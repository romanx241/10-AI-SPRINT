import { streamText, tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { DEFAULT_MODEL, calcMessageCost, type ModelId } from "@/lib/config";
import { searchSimilarChunks, buildRagContext, listDocuments } from "@/lib/rag";
import { warmUp, queryWithRetry } from "@/lib/db";
import { searchTavily } from "@/lib/tools/tavily-search";

const openai = createOpenAI({
  apiKey: process.env.PROXYAPI_KEY ?? "missing-key",
  baseURL: process.env.PROXYAPI_BASE_URL ?? "https://api.openai.com/v1",
});

export const runtime = "nodejs";

interface RagError {
  message: string;
  name: string;
  hint: string;
}

function buildRagErrorMessage(err: unknown): RagError {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("relation") && msg.includes("does not exist")) {
      return {
        message: "База данных не инициализирована. Запустите миграцию: npx tsx scripts/migrate.ts",
        name: "DB_NOT_READY",
        hint: "Таблицы documents/chunks не созданы. Миграция не была запущена.",
      };
    }
    if (
      msg.includes("connect") ||
      msg.includes("econnrefused") ||
      msg.includes("timeout") ||
      msg.includes("fetch failed") ||
      msg.includes("unreachable") ||
      msg.includes("query failed after")
    ) {
      return {
        message: "Не удалось подключиться к базе данных. Проверьте DATABASE_URL и VPN/сеть.",
        name: "DB_CONNECTION_ERROR",
        hint: "Neon database unreachable. Check network/variables.",
      };
    }
    if (msg.includes("401") || msg.includes("unauthorized") || msg.includes("apikey") || msg.includes("missing-key")) {
      return {
        message: "Неверный или отсутствующий PROXYAPI_KEY для эмбеддингов.",
        name: "EMBEDDING_AUTH_ERROR",
        hint: "Check PROXYAPI_KEY in .env",
      };
    }
    return {
      message: `Ошибка RAG: ${err.message}`,
      name: err.name,
      hint: "",
    };
  }
  return {
    message: "Неизвестная ошибка при поиске по документам.",
    name: "UNKNOWN",
    hint: "",
  };
}

const tavilyWebSearch = tool({
  description:
    "Поиск актуальной информации в интернете. Используй этот инструмент, " +
    "когда пользователь спрашивает о текущих событиях, новостях, курсах валют, " +
    "погоде, ценах, датах мероприятий, статистике — обо всём, что требует " +
    "свежих данных, которых нет в твоей обучающей выборке. " +
    "НЕ используй для вопросов о внутренних регламентах компании — для этого " +
    "есть контекст из документов.",
  parameters: z.object({
    query: z
      .string()
      .describe(
        "Поисковый запрос. Формулируй на русском или английском языке так, " +
        "чтобы получить максимально релевантные результаты."
      ),
    maxResults: z
      .number()
      .optional()
      .default(5)
      .describe("Максимальное количество результатов (1–10)"),
  }),
  execute: async ({ query, maxResults }) => {
    return await searchTavily(query, maxResults);
  },
});

function buildSystemPrompt(ragContext: string, hasDocuments: boolean): string {
  const searchNote =
    "\n\nДОСТУПНЫЙ ИНСТРУМЕНТ:\n" +
    "У тебя есть инструмент tavilyWebSearch для поиска актуальной информации в интернете. " +
    "Используй его по своему усмотрению, когда вопрос требует свежих данных: новости, курсы валют, погода, " +
    "текущие события, статистика, цены, даты мероприятий. " +
    "НЕ используй поиск для вопросов о внутренних регламентах компании — отвечай на них из контекста документов.";

  if (!hasDocuments) {
    return (
      "Ты — HR-ассистент компании Continental. Отвечаешь сотрудникам на вопросы об отпусках, командировках и компенсациях.\n" +
      "На данный момент в базе нет загруженных документов — скажи об этом сотруднику и предложи загрузить PDF/TXT/MD-файлы с регламентами.\n" +
      "Не придумывай внутренние правила компании, ссылайся только на общие нормы ТК РФ.\n" +
      "Будь краток, отвечай по существу." +
      searchNote
    );
  }

  return (
    "Ты — HR-ассистент компании Continental. Отвечаешь сотрудникам на вопросы об отпусках, командировках и компенсациях.\n\n" +
    "ПРАВИЛА ОТВЕТА:\n" +
    "1. Отвечай ТОЛЬКО на основе предоставленного ниже контекста из загруженных документов компании.\n" +
    "2. ВСЕГДА указывай источник в формате: «Источник: [имя файла], стр. N» (или просто «Источник: [имя файла]» если страница неизвестна).\n" +
    "3. Если в контексте НЕТ ответа на вопрос — честно скажи: «В загруженных документах ответ на этот вопрос не найден». Не придумывай.\n" +
    "4. Не используй общие знания, если они противоречат контексту из документов.\n" +
    "5. Отвечай кратко и по существу. Без вводных фраз типа «Конечно!», «Отличный вопрос!».\n" +
    "6. Запрещено давать юридические консультации.\n\n" +
    "КОНТЕКСТ ИЗ ДОКУМЕНТОВ:\n" +
    ragContext +
    searchNote
  );
}

export async function POST(req: Request) {
  try {
    // Прогрев БД (разбудить Neon free-tier после паузы)
    await warmUp();

    const { messages, model } = await req.json();
    const modelId: ModelId =
      model && ["gpt-5.4-nano", "gpt-5.4-mini", "gpt-5.4"].includes(model)
        ? model
        : DEFAULT_MODEL;

    // Получаем последнее сообщение пользователя
    const lastUserMessage = [...messages]
      .reverse()
      .find((m: any) => m.role === "user");

    let ragContext = "";
    let hasDocuments = false;
    let ragError: RagError | null = null;

    if (lastUserMessage?.content) {
      const query =
        typeof lastUserMessage.content === "string"
          ? lastUserMessage.content
          : (lastUserMessage.content as any).text ?? "";

      // RAG-поиск обёрнут в try-catch — если БД недоступна,
      // чат продолжает работать без контекста
      try {
        const docs = await listDocuments();
        hasDocuments = docs.length > 0;

        if (hasDocuments && query) {
          const results = await searchSimilarChunks(query, 5);
          ragContext = buildRagContext(results);

          if (!ragContext) {
            ragContext = "(Релевантные фрагменты не найдены)";
          }
        }
      } catch (err) {
        ragError = buildRagErrorMessage(err);
        console.error("[RAG Error]", ragError);
        // Продолжаем без RAG-контекста
      }
    }

    const system = buildSystemPrompt(
      ragError ? `(Поиск по документам временно недоступен: ${ragError.hint || ragError.message})` : ragContext,
      hasDocuments
    );

    const result = streamText({
      model: openai(modelId),
      maxTokens: 1000,
      system,
      messages,
      tools: { tavilyWebSearch },
    });

    const response = result.toDataStreamResponse({
      sendUsage: true,
    });

    result.usage
      .then(async (usage) => {
        const promptTokens = usage.promptTokens;
        const completionTokens = usage.completionTokens;
        const cost = calcMessageCost(modelId, promptTokens, completionTokens);
        console.log(
          `[Cost] ${modelId} | ${promptTokens} in + ${completionTokens} out = ${promptTokens + completionTokens} total | ≈ ${cost.toFixed(4)}₽`
        );
        // Сохранение истории разговора
        try {
          const question = typeof lastUserMessage.content === "string"
            ? lastUserMessage.content
            : (lastUserMessage.content as any).text ?? "";
          const answer = "[Ответ записан в поток]"; // Точное содержание ответа недоступно здесь
          await queryWithRetry(() =>
            // Предполагаем, что таблица chat_history уже существует
            // user, question, answer, timestamp, prompt_tokens, completion_tokens, cost_rub
            // Если таблица не существует, запрос завершится ошибкой, но не сломает основной процесс
            // Можно добавить CREATE TABLE IF NOT EXISTS в миграцию отдельно
            // Здесь просто вставляем запись
            // @ts-ignore – getSql возвращает клиент с методом query
            getSql()`INSERT INTO chat_history (user, question, answer, timestamp, prompt_tokens, completion_tokens, cost_rub) VALUES ('anonymous', ${question}, ${answer}, NOW(), ${promptTokens}, ${completionTokens}, ${cost})`
          );
        } catch (e) {
          console.warn("[DB] Не удалось сохранить историю разговора:", e);
        }
      })
      .catch(() => {
        // usage может быть недоступен
      });

    return response;
  } catch (err) {
    console.error("[Chat Route Error]", err);
    // Сохранение ошибки в таблицу errors
    try {
      await queryWithRetry(() =>
        // @ts-ignore – getSql возвращает клиент с методом query
        getSql()`INSERT INTO errors (timestamp, error_type, error_text, request) VALUES (NOW(), 'ChatRoute', ${String(err)}, ${JSON.stringify(messages)})`
      );
    } catch (logErr) {
      console.warn("Не удалось сохранить ошибку в БД", logErr);
    }

    const status = err instanceof SyntaxError ? 400 : 500;
    const message =
      err instanceof Error
        ? err.message
        : "Внутренняя ошибка сервера";

    return new Response(
      JSON.stringify({
        error: message,
        detail: status === 500 ? "Попробуйте позже или проверьте логи сервера." : null,
      }),
      {
        status,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
