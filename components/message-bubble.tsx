"use client";

import { type UIMessage } from "@ai-sdk/ui-utils";
import { Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface UsageInfo {
  promptTokens: number;
  completionTokens: number;
  cost: number;
}

interface MessageBubbleProps {
  message: UIMessage;
  usage?: UsageInfo;
}

function formatMessageParts(parts: UIMessage["parts"]) {
  return (parts ?? [])
    .map((part: { type: string; text?: string }) => {
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

export function MessageBubble({ message, usage }: MessageBubbleProps) {
  const isAssistant = message.role === "assistant";
  const text = formatMessageParts(message.parts ?? []);

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
        {isAssistant && (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-continental-100 text-continental-600">
            <Bot className="h-4 w-4" />
          </div>
        )}

        <div
          className={cn(
            "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
            isAssistant
              ? "bg-muted text-foreground rounded-tl-sm"
              : "bg-continental-500 text-white rounded-tr-sm"
          )}
        >
          {text.split("\n").map((line: string, i: number) => {
            if (line.startsWith("*") && line.endsWith("*")) {
              return (
                <p
                  key={i}
                  className={cn(
                    "mt-2 pt-2 text-xs italic opacity-70",
                    isAssistant ? "border-t border-border" : "border-t border-white/20"
                  )}
                >
                  {line.slice(1, -1)}
                </p>
              );
            }
            if (line === "") return <br key={i} />;
            return <p key={i}>{line}</p>;
          })}
        </div>

        {!isAssistant && (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-continental-500 text-white">
            <User className="h-4 w-4" />
          </div>
        )}
      </div>

      {isAssistant && usage && (
        <p className="pl-11 text-[11px] text-muted-foreground">
          &asymp; {usage.cost.toFixed(2)}&#x20bd; &middot;{" "}
          {usage.promptTokens + usage.completionTokens} токенов
        </p>
      )}
    </div>
  );
}
