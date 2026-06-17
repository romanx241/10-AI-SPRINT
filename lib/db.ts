import { neon } from "@neondatabase/serverless";

// Ленивое создание подключения — создаётся при первом запросе, не при импорте
let _sql: any = null;

function getSql(): any {
  if (_sql) return _sql;
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not set in environment variables");
  }
  _sql = neon(DATABASE_URL);
  return _sql;
}

// Прогрев: пингуем БД при старте, чтобы разбудить Neon free-tier после паузы
let warmedUp = false;

export async function warmUp(): Promise<void> {
  if (warmedUp) return;
  try {
    await getSql()`SELECT 1`;
    warmedUp = true;
    console.log("[DB] Connected and warmed up");
  } catch (e) {
    console.warn("[DB] Warm-up failed, will retry on next query:", String(e).substring(0, 100));
  }
}

// Запрос с повторной попыткой при первом сбое (Neon cold start)
export async function queryWithRetry(
  fn: () => Promise<any>,
  retries = 2
): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt < retries) {
        const msg = String(err).toLowerCase();
        const isRetryable =
          msg.includes("connect") ||
          msg.includes("timeout") ||
          msg.includes("fetch failed") ||
          msg.includes("cold start") ||
          msg.includes("econnrefused");
        if (isRetryable) {
          console.warn(`[DB] Query failed (attempt ${attempt + 1}/${retries + 1}), retrying...`);
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
      }
      throw err;
    }
  }
  throw new Error("Unreachable");
}

export { getSql };
