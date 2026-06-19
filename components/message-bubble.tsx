"use client";

import { type UIMessage, type ToolInvocation } from "@ai-sdk/ui-utils";
import { Bot, User, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TavilySearchResponse } from "@/lib/tools/tavily-search";

// ---------------------------------------------------------------------------
// Типы
// ---------------------------------------------------------------------------

interface UsageInfo {
  promptTokens: number;
  completionTokens: number;
  cost: number;
}

interface MessageBubbleProps {
  message: UIMessage;
  usage?: UsageInfo;
}

// ---------------------------------------------------------------------------
// Извлечение tool-invocation parts
// ---------------------------------------------------------------------------

function extractToolInvocations(
  parts: UIMessage["parts"]
): ToolInvocation[] {
  if (!parts) return [];
  const invocations: ToolInvocation[] = [];
  for (const part of parts) {
    if (part.type === "tool-invocation") {
      invocations.push(part.toolInvocation);
    }
  }
  return invocations;
}

// ---------------------------------------------------------------------------
// Форматирование текста сообщения
// ---------------------------------------------------------------------------

function formatMessageParts(parts: UIMessage["parts"]) {
  return (parts ?? [])
    .map((part) => {
      if (part.type === "text") {
        return (part.text ?? "")
          .replace(
            /(Источник:.+)/gi,
            (_match: string) => `\n\n*${_match}*`
          )
          .replace(
            /(Согласно\s[^.]+?(?:стр\.?\s*\d+)?)/gi,
            (_match: string) => `\n\n*${_match}*`
          )
          .trim();
      }
      return "";
    })
    .join("");
}

// ---------------------------------------------------------------------------
// Статус поиска (показывается пока идёт поиск)
// ---------------------------------------------------------------------------

function SearchStatus() {
  return (
    <div className="mt-2 flex items-center gap-2 rounded-xl border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800 animate-pulse">
      <Search className="h-4 w-4 shrink-0" />
      <span>Ищу в интернете...</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Результаты поиска (блок «Найдено в интернете:»)
// ---------------------------------------------------------------------------

function SearchResults({ result }: { result: TavilySearchResponse }) {
  const sources = result.results ?? [];

  if (sources.length === 0) {
    return (
      <div className="mt-2 rounded-xl border border-border bg-white/50 px-3 py-2 text-xs text-muted-foreground">
        Ничего не найдено.
      </div>
    );
  }

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-green-200 bg-green-50/60">
      {/* Заголовок */}
      <div className="flex items-center gap-2 border-b border-green-200 px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-green-700" />
        <span className="text-xs font-medium text-green-800">
          Найдено в интернете
          {result.searchTimeMs != null && (
            <span className="font-normal text-green-600">
              {" "}
              · {(result.searchTimeMs / 1000).toFixed(1)}&nbsp;с
            </span>
          )}
          :
        </span>
      </div>

      {/* Список источников */}
      <ul className="divide-y divide-green-100">
        {sources.map((source, i) => (
          <li key={i} className="px-3 py-2">
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block min-w-0"
            >
              <span className="block text-xs font-medium text-green-800 hover:text-green-900 transition-colors break-words">
                {source.title}
              </span>
              <span className="mt-0.5 block text-[11px] text-green-600 break-all">
                {source.url}
              </span>
            </a>
          </li>
        ))}
      </ul>

      {/* Сводный ответ от Tavily (если есть) */}
      {result.answer && (
        <p className="border-t border-green-200 px-3 py-2 text-xs leading-relaxed text-green-800 break-words">
          {result.answer}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Информация о токенах / стоимости
// ---------------------------------------------------------------------------

function UsageFooter({ usage }: { usage: UsageInfo }) {
  return (
    <p className="pl-11 text-[11px] text-muted-foreground">
      &asymp; {usage.cost.toFixed(2)}&#x20bd; &middot;{" "}
      {usage.promptTokens + usage.completionTokens} токенов
    </p>
  );
}

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

export function MessageBubble({ message, usage }: MessageBubbleProps) {
  const isAssistant = message.role === "assistant";
  const text = formatMessageParts(message.parts ?? []);

  // Извлекаем tool-вызовы (только tavilyWebSearch)
  const toolInvocations = extractToolInvocations(message.parts);
  const searchInvocations = toolInvocations.filter(
    (ti) => ti.toolName === "tavilyWebSearch"
  );

  // Состояния поиска
  const pendingCalls = searchInvocations.filter(
    (ti) => ti.state === "call" || ti.state === "partial-call"
  );
  const hasPendingCall = pendingCalls.length > 0;

  const resultInvocations = searchInvocations.filter(
    (ti) => ti.state === "result"
  );
  const hasResult = resultInvocations.length > 0;

  // Собираем результаты
  const completedResults: TavilySearchResponse[] = [];
  for (const ti of resultInvocations) {
    if (ti.result != null) {
      completedResults.push(ti.result as TavilySearchResponse);
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-1",
        isAssistant ? "items-start" : "items-end"
      )}
    >
      <div
        className={cn(
          "flex gap-3 animate-fade-in",
          isAssistant ? "justify-start" : "justify-end"
        )}
      >
        {/* Аватар ассистента */}
        {isAssistant && (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-continental-100 text-continental-600">
            <Bot className="h-4 w-4" />
          </div>
        )}

        {/* Пузырь */}
        <div
          className={cn(
            "max-w-[85%] min-w-0 rounded-2xl px-4 py-3 text-sm leading-relaxed",
            isAssistant
              ? "bg-muted text-foreground rounded-tl-sm"
              : "bg-continental-500 text-white rounded-tr-sm"
          )}
        >
          {/* Текст сообщения */}
          {text.length > 0 &&
            text.split("\n").map((line: string, i: number) => {
              if (line.startsWith("*") && line.endsWith("*")) {
                return (
                  <p
                    key={i}
                    className={cn(
                      "mt-2 pt-2 text-xs italic opacity-70",
                      isAssistant
                        ? "border-t border-border"
                        : "border-t border-white/20"
                    )}
                  >
                    {line.slice(1, -1)}
                  </p>
                );
              }
              if (line === "") return <br key={i} />;
              return (
                <p key={i} className="break-words">
                  {line}
                </p>
              );
            })}

          {/* Статус поиска */}
          {isAssistant && hasPendingCall && !hasResult && <SearchStatus />}

          {/* Результаты поиска */}
          {isAssistant &&
            completedResults.map((result, i) => (
              <SearchResults key={i} result={result} />
            ))}
        </div>

        {/* Аватар пользователя */}
        {!isAssistant && (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-continental-500 text-white">
            <User className="h-4 w-4" />
          </div>
        )}
      </div>

      {/* Футер со стоимостью */}
      {isAssistant && usage && !hasPendingCall && <UsageFooter usage={usage} />}
    </div>
  );
}
