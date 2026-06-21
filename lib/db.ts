import { neon } from "@neondatabase/serverless";

// Ленивое создание подключения — при первом запросе
let _sql: any = null;
let _usingFallback = false;

/** Создать Neon-клиент для указанного URL */
function createNeon(url: string) {
  return neon(url);
}

/** Получить SQL-клиент с fallback: если DATABASE_URL не работает, пробуем DIRECT_URL */
function getSql(): any {
  if (_sql) return _sql;

  const primaryUrl = process.env.DATABASE_URL;
  const fallbackUrl = process.env.DIRECT_URL;

  // Сначала пробуем primary (pooled)
  if (primaryUrl) {
    try {
      _sql = createNeon(primaryUrl);
      _usingFallback = false;
      return _sql;
    } catch {
      // падение при создании — редко, но бывает; fallback
    }
  }

  // Fallback на DIRECT_URL (без пулера)
  if (fallbackUrl) {
    console.warn("[DB] Falling back to DIRECT_URL (non-pooled)");
    _sql = createNeon(fallbackUrl);
    _usingFallback = true;
    return _sql;
  }

  throw new Error("DATABASE_URL is not set in environment variables");
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
    // сбрасываем warmedUp, чтобы следующая попытка тоже прогревала
    warmedUp = false;
    console.warn("[DB] Warm-up failed, will retry on next query:", String(e).substring(0, 120));
  }
}

// Запрос с повторной попыткой при сбое (Neon cold start — до 3 с)
export async function queryWithRetry(
  fn: () => Promise<any>,
  retries = 3
): Promise<any> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = String(err).toLowerCase();
      const isRetryable =
        msg.includes("connect") ||
        msg.includes("timeout") ||
        msg.includes("fetch failed") ||
        msg.includes("cold start") ||
        msg.includes("econnrefused") ||
        msg.includes("503") ||
        msg.includes("too many requests") ||
        msg.includes("unreachable");

      if (attempt < retries && isRetryable) {
        // экспоненциальная задержка: 1.5s → 3s → 5s → 8s
        const delay = 1500 + attempt * 1500 + Math.random() * 500;
        console.warn(
          `[DB] Query failed (attempt ${attempt + 1}/${retries + 1}), retrying in ${Math.round(delay)}ms...`
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      // Если primary упал, а fallback ещё не пробовали — переключаемся
      if (!_usingFallback && process.env.DIRECT_URL) {
        console.warn("[DB] Switching to DIRECT_URL fallback connection...");
        _sql = createNeon(process.env.DIRECT_URL);
        _usingFallback = true;
        // сбрасываем счётчик, чтобы после переключения были полноценные retry на fallback
        attempt = -1;
        continue;
      }

      throw err;
    }
  }

  // Исчерпали все попытки + fallback — включаем оригинальную ошибку
  const lastMsg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Query failed after ${retries + 1} retries: ${lastMsg}`);
}

export { getSql };
