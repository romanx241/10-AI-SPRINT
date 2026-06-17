// Цены моделей ProxyAPI за 1 миллион токенов в рублях (с НДС)
// Взяты с proxyapi.ru/pricing

export const MODEL_PRICING = {
  "gpt-5.4-nano": {
    input: 61,
    output: 380,
  },
  "gpt-5.4-mini": {
    input: 230,
    output: 1370,
  },
  "gpt-5.4": {
    input: 760,
    output: 4550,
  },
} as const;

/** Дневной лимит расходов в рублях */
export const DAILY_LIMIT_RUB = 10;

/** Доступные модели AI для выбора в интерфейсе */
export const AVAILABLE_MODELS = [
  { id: "gpt-5.4-nano", label: "Nano", description: "Быстро, дёшево" },
  { id: "gpt-5.4-mini", label: "Mini", description: "Баланс" },
  { id: "gpt-5.4", label: "Full", description: "Умно, дорого" },
] as const;

export type ModelId = (typeof AVAILABLE_MODELS)[number]["id"];

/** Модель по умолчанию */
export const DEFAULT_MODEL: ModelId = "gpt-5.4-mini";

/** @deprecated Используйте DEFAULT_MODEL или выбранную пользователем модель */
export const CHAT_MODEL = DEFAULT_MODEL;

/** Рассчитать стоимость запроса в рублях */
export function calcMessageCost(
  modelId: keyof typeof MODEL_PRICING,
  promptTokens: number,
  completionTokens: number
): number {
  const pricing = MODEL_PRICING[modelId];
  return (
    (promptTokens / 1_000_000) * pricing.input +
    (completionTokens / 1_000_000) * pricing.output
  );
}
