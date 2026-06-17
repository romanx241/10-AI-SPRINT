// Тест chat API — пишет результат в файл, чтобы обойти баг с терминалом

import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import OpenAI from "openai";

async function test() {
  const results = [];

  try {
    // 1. Тест БД
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`SELECT version()`;
    results.push(`[OK] DB: ${rows[0].version.substring(0, 40)}...`);
  } catch (e) {
    results.push(`[FAIL] DB: ${e.message?.substring(0, 100)}`);
  }

  try {
    // 2. Тест эмбеддингов
    const openai = new OpenAI({
      apiKey: process.env.PROXYAPI_KEY,
      baseURL: process.env.PROXYAPI_BASE_URL,
    });
    const emb = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: "test",
      encoding_format: "float",
    });
    results.push(`[OK] Embeddings: dim=${emb.data[0].embedding.length}`);
  } catch (e) {
    results.push(`[FAIL] Embeddings: ${e.message?.substring(0, 100)}`);
  }

  try {
    // 3. Тест listDocuments
    const sql = neon(process.env.DATABASE_URL);
    const docs = await sql`SELECT id, filename FROM documents ORDER BY created_at DESC LIMIT 5`;
    results.push(`[OK] Documents: ${docs.length} docs found`);
  } catch (e) {
    results.push(`[FAIL] Documents: ${e.message?.substring(0, 100)}`);
  }

  try {
    // 4. Тест searchSimilarChunks (если есть документы)
    const sql = neon(process.env.DATABASE_URL);
    const chunks = await sql`SELECT COUNT(*) as cnt FROM chunks WHERE embedding IS NOT NULL`;
    if (Number(chunks[0].cnt) > 0) {
      results.push(`[OK] ${chunks[0].cnt} chunks with embeddings`);
    } else {
      results.push(`[INFO] No chunks yet (expected — no files uploaded)`);
    }
  } catch (e) {
    results.push(`[FAIL] Chunks: ${e.message?.substring(0, 100)}`);
  }

  console.log("=== RAG SYSTEM DIAGNOSTICS ===");
  results.forEach((r) => console.log(r));
  console.log("=== END ===");
}

test().catch((e) => console.error("FATAL:", e));
