/**
 * Tavily Search API — инструмент поиска актуальной информации в интернете.
 * Документация: https://docs.tavily.com/
 */
export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
}

export interface TavilySearchResponse {
  answer?: string;
  results: TavilySearchResult[];
  searchTimeMs: number;
  error?: string; // Теперь TypeScript знает про это поле
}

interface TavilyApiError {
  detail?: { error?: string };
  error?: string;
}

export async function searchTavily(
  query: string,
  maxResults: number = 5
): Promise<TavilySearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    return {
      answer: undefined,
      results: [],
      searchTimeMs: 0,
      error: "TAVILY_API_KEY не задан в .env",
    };
  }

  const startTime = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        include_answer: true,
        max_results: maxResults,
      }),
      signal: controller.signal,
    });

    // Очищаем таймаут сразу после завершения сетевого запроса
    clearTimeout(timeout);

    if (!response.ok) {
      let errorDetail = `HTTP ${response.status}`;
      try {
        const errBody = (await response.json()) as TavilyApiError;
        errorDetail = errBody?.detail?.error || errBody?.error || errorDetail;
      } catch {
        // Игнорируем ошибки парсинга JSON
      }
      return {
        answer: undefined,
        results: [],
        searchTimeMs: Date.now() - startTime,
        error: `Tavily API error: ${errorDetail}`,
      };
    }

    const data = (await response.json()) as {
      answer?: string;
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };

    return {
      answer: data.answer,
      results: (data.results ?? []).map((r) => ({
        title: r.title ?? "Без названия",
        url: r.url ?? "",
        content: r.content ?? "",
      })),
      searchTimeMs: Date.now() - startTime,
    };
  } catch (e: any) {
    // Важно очистить таймаут и в случае ошибки (например, сбоя сети до таймаута)
    clearTimeout(timeout);

    let errorMessage = e?.message ?? "Неизвестная ошибка при запросе к Tavily";
    if (e?.name === 'AbortError') {
      errorMessage = "Превышено время ожидания ответа от Tavily (15 секунд)";
    }

    return {
      answer: undefined,
      results: [],
      searchTimeMs: Date.now() - startTime,
      error: errorMessage,
    };
  }
}