"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { Send, Square, Trash2, AlertTriangle, Ban } from "lucide-react";
import { MessageBubble } from "./message-bubble";
import { FileUpload } from "./file-upload";
import { cn } from "@/lib/utils";
import {
  calcMessageCost,
  AVAILABLE_MODELS,
  DEFAULT_MODEL,
  DAILY_LIMIT_RUB,
  type ModelId,
} from "@/lib/config";

interface UsageEntry {
  promptTokens: number;
  completionTokens: number;
  cost: number;
}

export function ChatInterface() {
  const [usageMap, setUsageMap] = useState<Map<string, UsageEntry>>(new Map());
  const [totalCost, setTotalCost] = useState(0);
  const [selectedModel, setSelectedModel] = useState<ModelId>(DEFAULT_MODEL);

  const [dailyCost, setDailyCost] = useState(() => {
    if (typeof window === "undefined") return 0;
    const today = new Date().toISOString().slice(0, 10);
    const stored = localStorage.getItem(`daily-cost-${today}`);
    return stored ? Number.parseFloat(stored) : 0;
  });

  const { messages, input, handleInputChange, handleSubmit, status, stop, setMessages } = useChat({
    api: "/api/chat",
    body: { model: selectedModel },
    onFinish: (message, options) => {
      const usage = options.usage;
      if (usage) {
        const promptTokens = usage.promptTokens;
        const completionTokens = usage.completionTokens;
        const cost = calcMessageCost(selectedModel, promptTokens, completionTokens);
        setUsageMap((prev) =>
          new Map(prev).set(message.id, { promptTokens, completionTokens, cost })
        );
        setTotalCost((prev) => prev + cost);
        setDailyCost((prev) => {
          const next = prev + cost;
          const today = new Date().toISOString().slice(0, 10);
          localStorage.setItem(`daily-cost-${today}`, next.toString());
          return next;
        });
      }
    },
  });

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const onSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      const limitExceeded = dailyCost >= DAILY_LIMIT_RUB;
      if (limitExceeded) return;
      handleSubmit(e);
      setTimeout(() => inputRef.current?.focus(), 0);
    },
    [handleSubmit, dailyCost]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (dailyCost >= DAILY_LIMIT_RUB) return;
        const fakeEvent = {
          preventDefault: () => {},
        } as React.FormEvent<HTMLFormElement>;
        onSubmit(fakeEvent);
      }
    },
    [onSubmit, dailyCost]
  );

  const isLoading = status === "submitted" || status === "streaming";

  const usagePercent = dailyCost / DAILY_LIMIT_RUB;
  const isWarning = dailyCost >= DAILY_LIMIT_RUB * 0.8 && dailyCost < DAILY_LIMIT_RUB;
  const isExceeded = dailyCost >= DAILY_LIMIT_RUB;

  const handleClear = useCallback(() => {
    if (window.confirm("Очистить историю? Это действие нельзя отменить.")) {
      setMessages([]);
      setUsageMap(new Map());
      setTotalCost(0);
    }
  }, [setMessages]);

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      {/* Header */}
      <header className="shrink-0 border-b bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-continental-500 text-white text-sm font-bold">
              C
            </div>
            <div>
              <h1 className="text-sm font-semibold text-foreground">
                HR-ассистент Continental
              </h1>
              <p className="text-xs text-muted-foreground">
                Ответы на вопросы о регламентах и политиках компании
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value as ModelId)}
              className="max-sm:hidden text-xs border rounded-lg px-2 py-1.5 bg-white text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {AVAILABLE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} ({m.description})
                </option>
              ))}
            </select>
            <FileUpload />
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleClear}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-white text-foreground/60 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
                aria-label="Очистить историю"
                title="Очистить историю"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            {isWarning && !isExceeded && (
              <>
                <AlertTriangle className="sm:hidden h-4 w-4 shrink-0 text-yellow-600" />
                <span className="max-sm:hidden shrink-0 text-xs text-yellow-600">
                  Лимит {Math.round(usagePercent * 100)}% · {dailyCost.toFixed(0)}₽/{DAILY_LIMIT_RUB}₽
                </span>
              </>
            )}
            {isExceeded && (
              <>
                <Ban className="sm:hidden h-4 w-4 shrink-0 text-red-600" />
                <span className="max-sm:hidden shrink-0 text-xs text-red-600">
                  Лимит исчерпан · {dailyCost.toFixed(0)}₽/{DAILY_LIMIT_RUB}₽
                </span>
              </>
            )}
            {totalCost > 0 && (
              <p className="shrink-0 text-xs text-muted-foreground">
                За сессию: {totalCost.toFixed(2)}&#x20bd;
              </p>
            )}
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-continental-100 text-continental-500 mb-4">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h2 className="text-lg font-medium text-foreground">
              HR-ассистент Continental
            </h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Задайте вопрос об отпусках, больничных, командировках и других
              HR-процедурах компании.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {[
                "Сколько дней отпуска?",
                "Как оформить больничный?",
                "Правила удалённой работы",
                "Оформление командировки",
              ].map((q) => (
                <button
                  key={q}
                  type="button"
                  className="rounded-full border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors min-h-[44px]"
                  onClick={() => {
                    const syntheticEvent = {
                      target: { value: q },
                    } as React.ChangeEvent<HTMLTextAreaElement>;
                    handleInputChange(syntheticEvent);
                    setTimeout(() => {
                      const submitEvent = {
                        preventDefault: () => {},
                      } as React.FormEvent<HTMLFormElement>;
                      onSubmit(submitEvent);
                    }, 100);
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 pb-2">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                usage={usageMap.get(message.id)}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </main>

      {/* Input */}
      <footer className="shrink-0 border-t bg-white px-3 py-3">
        <form onSubmit={onSubmit} className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={onKeyDown}
            placeholder="Задайте вопрос о регламентах..."
            rows={1}
            disabled={isLoading || isExceeded}
            className="min-h-[44px] max-h-32 flex-1 resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0 disabled:opacity-50"
          />
          {isLoading ? (
            <button
              type="button"
              onClick={() => stop()}
              className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors"
              aria-label="Остановить генерацию"
            >
              <Square className="h-4 w-4 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl bg-continental-500 text-white hover:bg-continental-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="h-5 w-5" />
            </button>
          )}
        </form>
        <p className="mt-2 text-center text-[10px] text-muted-foreground">
          HR-ассистент Continental. Ответы носят справочный характер.
        </p>
      </footer>
    </div>
  );
}
