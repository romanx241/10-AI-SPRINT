// Скрипт миграции базы данных для RAG
// Запуск: npx tsx scripts/migrate.ts
import { config } from "dotenv";
import { resolve } from "path";

// Загружаем .env из корня проекта
config({ path: resolve(__dirname, "..", ".env") });

import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL!;
if (!DATABASE_URL) {
  console.error("DATABASE_URL не задан в .env");
  process.exit(1);
}

async function migrate() {
  const sql = neon(DATABASE_URL);

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

  console.log("\nМиграция завершена успешно!");
}

migrate().catch((err) => {
  console.error("Ошибка миграции:", err);
  process.exit(1);
});
