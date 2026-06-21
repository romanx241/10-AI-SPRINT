// Скрипт миграции базы данных для RAG
// Запуск: npx tsx scripts/migrate.ts
import { config } from "dotenv";
import { resolve } from "path";

// Загружаем .env из корня проекта
config({ path: resolve(__dirname, "..", ".env") });

import { neon } from "@neondatabase/serverless";

// DDL (CREATE TABLE / INDEX) — используем DIRECT_URL (без пулера),
// т.к. PgBouncer в transaction mode не поддерживает DDL
const DIRECT_URL = process.env.DIRECT_URL!;
if (!DIRECT_URL) {
  console.error("DIRECT_URL не задан в .env");
  process.exit(1);
}

async function migrate() {
  const sql = neon(DIRECT_URL);

  console.log("Запуск миграции...\n");

  // 1. Включаем расширение pgvector
  console.log("1. Создание расширения vector...");
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  console.log("   [OK] расширение vector включено");

  // 2. Создаём таблицу documents
  console.log("2. Создание таблицы documents...");
  await sql`CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    filename TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  console.log("   [OK] таблица documents создана");

  // 3. Создаём таблицу chunks с векторным полем
  console.log("3. Создание таблицы chunks...");
  await sql`CREATE TABLE IF NOT EXISTS chunks (
    id SERIAL PRIMARY KEY,
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    page_number INTEGER,
    embedding vector(1536),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  console.log("   [OK] таблица chunks создана");

  // 4. Индексы
  console.log("4. Создание индексов...");
  await sql`CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)`;
  console.log("   [OK] индексы созданы");

  // 5. Таблица истории разговоров
  console.log("5. Создание таблицы chat_history...");
  await sql`CREATE TABLE IF NOT EXISTS chat_history (
    id SERIAL PRIMARY KEY,
    "user" TEXT NOT NULL DEFAULT 'anonymous',
    question TEXT NOT NULL,
    answer TEXT NOT NULL DEFAULT '',
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    cost_rub NUMERIC(12,6) NOT NULL DEFAULT 0
  )`;
  console.log("   [OK] таблица chat_history создана");

  // 6. Таблица ошибок
  console.log("6. Создание таблицы errors...");
  await sql`CREATE TABLE IF NOT EXISTS errors (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    error_type TEXT NOT NULL,
    error_text TEXT NOT NULL,
    request JSONB
  )`;
  console.log("   [OK] таблица errors создана");

  // 7. Индекс на timestamp для быстрых агрегатов
  console.log("7. Создание индексов для chat_history...");
  await sql`CREATE INDEX IF NOT EXISTS idx_chat_history_timestamp ON chat_history(timestamp)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_errors_timestamp ON errors(timestamp)`;
  console.log("   [OK] индексы chat_history/errors созданы");

  console.log("\nМиграция завершена успешно!");
}

migrate().catch((err) => {
  console.error("Ошибка миграции:", err);
  process.exit(1);
});
