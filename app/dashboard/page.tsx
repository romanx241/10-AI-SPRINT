// File: app/dashboard/page.tsx
import React from "react";
import { queryWithRetry, getSql, warmUp } from "@/lib/db";

// Страница всегда рендерится на сервере, никакого статического предрендеринга
export const dynamic = "force-dynamic";

// Types for metrics
interface Metrics {
  totalConversations: number;
  costToday: number;
  costWeek: number;
  avgCost: number;
  budgetLimit?: number;
}

interface ChatRecord {
  id: number;
  user: string;
  question: string;
  answer: string;
  timestamp: string;
  prompt_tokens: number;
  completion_tokens: number;
  cost_rub: number;
}

interface ErrorRecord {
  id: number;
  timestamp: string;
  error_type: string;
  error_text: string;
  request: any;
}

/** Попробовать выполнить запрос с возвратом fallback-значения при ошибке */
async function tryQuery<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn("[Dashboard] DB query failed, using fallback:", String(err).substring(0, 120));
    return fallback;
  }
}

async function fetchMetrics(): Promise<Metrics> {
  const result = await tryQuery(() =>
    queryWithRetry(() =>
      // @ts-ignore
      getSql()`SELECT 
        COUNT(*) AS total_conversations,
        COALESCE(SUM(CASE WHEN timestamp::date = CURRENT_DATE THEN cost_rub END), 0) AS cost_today,
        COALESCE(SUM(CASE WHEN timestamp >= (CURRENT_DATE - INTERVAL '6 days') THEN cost_rub END), 0) AS cost_week,
        COALESCE(AVG(cost_rub), 0) AS avg_cost
      FROM chat_history`
    ),
    [{ total_conversations: 0, cost_today: 0, cost_week: 0, avg_cost: 0 }]
  );
  const row = result[0];
  return {
    totalConversations: Number(row?.total_conversations ?? 0),
    costToday: Number(row?.cost_today ?? 0),
    costWeek: Number(row?.cost_week ?? 0),
    avgCost: Number(row?.avg_cost ?? 0),
    budgetLimit: Number(process.env.DAILY_BUDGET_LIMIT_RUB || 0),
  };
}

async function fetchTopExpensive(): Promise<ChatRecord[]> {
  return tryQuery(
    () =>
      queryWithRetry(() =>
        // @ts-ignore
        getSql()`SELECT id, user, question, answer, timestamp, prompt_tokens, completion_tokens, cost_rub 
        FROM chat_history 
        ORDER BY cost_rub DESC 
        LIMIT 5`
      ),
    []
  );
}

async function fetchRecentErrors(): Promise<ErrorRecord[]> {
  return tryQuery(
    () =>
      queryWithRetry(() =>
        // @ts-ignore
        getSql()`SELECT id, timestamp, error_type, error_text, request
        FROM errors
        ORDER BY timestamp DESC
        LIMIT 20`
      ),
    []
  );
}

/** Есть ли хоть одна запись (не все нулевые метрики и не пустые списки) */
function hasData(metrics: Metrics, top: ChatRecord[], errors: ErrorRecord[]): boolean {
  return metrics.totalConversations > 0 || top.length > 0 || errors.length > 0;
}

export default async function DashboardPage() {
  // Прогрев БД перед запросами (разбудить Neon free-tier)
  await warmUp();

  const [metrics, top, errors] = await Promise.all([
    fetchMetrics(),
    fetchTopExpensive(),
    fetchRecentErrors(),
  ]);

  const showBudgetWarning = metrics.budgetLimit && metrics.costToday > metrics.budgetLimit;

  return (
    <main className="p-4">
      {showBudgetWarning && (
        <div className="bg-red-200 text-red-800 p-2 mb-4 rounded text-center font-medium">
          ⚠ Бюджет агента превышен: {metrics.costToday.toFixed(2)} ₽ из {metrics.budgetLimit?.toFixed(2)} ₽ лимита
        </div>
      )}
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>

      {/* Metric cards */}
      <section className="grid gap-4 mb-8 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white rounded shadow p-4">
          <h2 className="text-sm font-medium text-gray-500">Всего разговоров</h2>
          <p className="text-2xl font-semibold">{metrics.totalConversations}</p>
        </div>
        <div className="bg-white rounded shadow p-4">
          <h2 className="text-sm font-medium text-gray-500">Расходы сегодня (₽)</h2>
          <p className="text-2xl font-semibold">{metrics.costToday.toFixed(2)}</p>
        </div>
        <div className="bg-white rounded shadow p-4">
          <h2 className="text-sm font-medium text-gray-500">Расходы за неделю (₽)</h2>
          <p className="text-2xl font-semibold">{metrics.costWeek.toFixed(2)}</p>
        </div>
        <div className="bg-white rounded shadow p-4">
          <h2 className="text-sm font-medium text-gray-500">Средняя стоимость (₽)</h2>
          <p className="text-2xl font-semibold">{metrics.avgCost.toFixed(2)}</p>
        </div>
      </section>

      {!hasData(metrics, top, errors) && (
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded mb-6">
          <p className="font-medium">Нет данных для отображения</p>
          <p className="text-sm mt-1">
            База данных не содержит записей или временно недоступна.
            Отправьте несколько сообщений в чате или проверьте подключение к БД.
          </p>
        </div>
      )}

      {/* Top 5 expensive queries */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-2">Топ‑5 дорогих запросов</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full table-auto border">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-2 py-1 text-left">ID</th>
                <th className="px-2 py-1 text-left">Вопрос</th>
                <th className="px-2 py-1 text-left">Ответ</th>
                <th className="px-2 py-1 text-left">Стоимость (₽)</th>
              </tr>
            </thead>
            <tbody>
              {top.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-2 py-4 text-center text-gray-400">Нет записей</td>
                </tr>
              ) : (
                top.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-2 py-1 whitespace-nowrap">{r.id}</td>
                    <td className="px-2 py-1 max-w-xs truncate" title={r.question}>{r.question}</td>
                    <td className="px-2 py-1 max-w-xs truncate" title={r.answer}>{r.answer}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{Number(r.cost_rub).toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Error log */}
      <section>
        <h2 className="text-xl font-semibold mb-2">Лог ошибок</h2>
        {errors.length === 0 ? (
          <p className="text-green-600 font-medium">Ошибок нет ✓</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto border">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-2 py-1 text-left">ID</th>
                  <th className="px-2 py-1 text-left">Тип</th>
                  <th className="px-2 py-1 text-left">Текст ошибки</th>
                  <th className="px-2 py-1 text-left">Время</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-2 py-1 whitespace-nowrap">{r.id}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{r.error_type}</td>
                    <td className="px-2 py-1 max-w-xs truncate" title={r.error_text}>{r.error_text}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{new Date(r.timestamp).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
