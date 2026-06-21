// File: app/dashboard/page.tsx
import React from "react";
import { queryWithRetry, getSql } from "@/lib/db";

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

async function fetchMetrics(): Promise<Metrics> {
  const result = await queryWithRetry(() =>
    // @ts-ignore
    getSql()`SELECT 
      COUNT(*) AS total_conversations,
      COALESCE(SUM(CASE WHEN timestamp::date = CURRENT_DATE THEN cost_rub END), 0) AS cost_today,
      COALESCE(SUM(CASE WHEN timestamp >= (CURRENT_DATE - INTERVAL '6 days') THEN cost_rub END), 0) AS cost_week,
      COALESCE(AVG(cost_rub), 0) AS avg_cost
    FROM chat_history`
  );
  const row = result[0];
  const budgetLimit = Number(process.env.DAILY_BUDGET_LIMIT_RUB || 0);
  return {
    totalConversations: Number(row.total_conversations),
    costToday: Number(row.cost_today),
    costWeek: Number(row.cost_week),
    avgCost: Number(row.avg_cost),
    // budget limit will be used in component rendering
  } as Metrics & { budgetLimit?: number };
}

async function fetchTopExpensive(): Promise<ChatRecord[]> {
  const rows = await queryWithRetry(() =>
    // @ts-ignore
    getSql()`SELECT id, user, question, answer, timestamp, prompt_tokens, completion_tokens, cost_rub 
    FROM chat_history 
    ORDER BY cost_rub DESC 
    LIMIT 5`
  );
  return rows;
}

async function fetchRecentErrors(): Promise<ChatRecord[]> {
  const rows = await queryWithRetry(() =>
    // @ts-ignore
    getSql()`SELECT id, user, question, answer, timestamp, prompt_tokens, completion_tokens, cost_rub 
    FROM chat_history 
    WHERE answer ILIKE '%error%' 
    ORDER BY timestamp DESC 
    LIMIT 20`
  );
  return rows;
}

export default async function DashboardPage() {
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
              {top.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-2 py-1 whitespace-nowrap">{r.id}</td>
                  <td className="px-2 py-1 max-w-xs truncate" title={r.question}>{r.question}</td>
                  <td className="px-2 py-1 max-w-xs truncate" title={r.answer}>{r.answer}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{Number(r.cost_rub).toFixed(2)}</td>
                </tr>
              ))}
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
                  <th className="px-2 py-1 text-left">Вопрос</th>
                  <th className="px-2 py-1 text-left">Ответ</th>
                  <th className="px-2 py-1 text-left">Время</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-2 py-1 whitespace-nowrap">{r.id}</td>
                    <td className="px-2 py-1 max-w-xs truncate" title={r.question}>{r.question}</td>
                    <td className="px-2 py-1 max-w-xs truncate" title={r.answer}>{r.answer}</td>
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
