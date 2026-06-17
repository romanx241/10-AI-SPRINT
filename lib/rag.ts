import OpenAI from "openai";
import { getSql, queryWithRetry } from "./db";

// --- OpenAI клиент для эмбеддингов ---
const openai = new OpenAI({
  apiKey: process.env.PROXYAPI_KEY ?? "missing-key",
  baseURL: process.env.PROXYAPI_BASE_URL ?? "https://api.openai.com/v1",
});

const EMBEDDING_MODEL = "text-embedding-ada-002";
const EMBEDDING_DIM = 1536;

// --- Типы ---
export interface DocumentRecord {
  id: number;
  filename: string;
  created_at: string;
}

export interface ChunkRecord {
  id: number;
  document_id: number;
  content: string;
  chunk_index: number;
  page_number: number | null;
}

export interface SearchResult extends ChunkRecord {
  filename: string;
  similarity: number;
}

// --- Извлечение текста из разных форматов ---
export async function extractTextFromBuffer(
  buffer: Buffer,
  filename: string
): Promise<{ text: string; pages?: string[] }> {
  const ext = filename.toLowerCase().split(".").pop();

  if (ext === "txt" || ext === "md") {
    return { text: buffer.toString("utf-8") };
  }

  if (ext === "pdf") {
    // Динамический импорт pdf-parse (CommonJS-пакет)
    const pdfParseModule = await import("pdf-parse");
    const pdfParse = (pdfParseModule as any).default || pdfParseModule;
    const data = await pdfParse(buffer);
    return { text: data.text };
  }

  throw new Error(`Неподдерживаемый формат: .${ext}`);
}

// --- Чанкинг: разбивка на куски ~300 слов с перекрытием ---
export interface TextChunk {
  content: string;
  index: number;
  pageNumber: number | null;
}

export function chunkText(
  text: string,
  maxWords: number = 300,
  overlapWords: number = 50
): TextChunk[] {
  const words = text.split(/\s+/);
  const chunks: TextChunk[] = [];

  if (words.length <= maxWords) {
    chunks.push({ content: text.trim(), index: 0, pageNumber: 1 });
    return chunks;
  }

  let i = 0;
  while (i < words.length) {
    const chunkWords = words.slice(i, i + maxWords);
    chunks.push({
      content: chunkWords.join(" "),
      index: chunks.length,
      pageNumber: null,
    });
    i += maxWords - overlapWords;
    if (chunkWords.length < maxWords) break;
  }

  return chunks;
}

// --- Генерация эмбеддинга ---
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.replace(/\n/g, " ").trim(),
    encoding_format: "float",
  });
  return response.data[0].embedding;
}

// --- Сохранение документа и чанков в БД ---
export async function storeDocument(
  filename: string,
  chunks: TextChunk[]
): Promise<number> {
  // Вставляем документ
  const [doc] = await queryWithRetry(() =>
    getSql()`INSERT INTO documents (filename) VALUES (${filename}) RETURNING id`
  );
  const documentId = doc.id as number;

  // Генерируем эмбеддинги и вставляем чанки
  for (const chunk of chunks) {
    const embedding = await generateEmbedding(chunk.content);
    const embeddingStr = `[${embedding.join(",")}]`;
    await queryWithRetry(() =>
      getSql()`INSERT INTO chunks (document_id, content, chunk_index, page_number, embedding)
      VALUES (${documentId}, ${chunk.content}, ${chunk.index}, ${chunk.pageNumber}, ${embeddingStr}::vector)`
    );
  }

  return documentId;
}

// --- Поиск похожих чанков ---
export async function searchSimilarChunks(
  query: string,
  limit: number = 5
): Promise<SearchResult[]> {
  const embedding = await generateEmbedding(query);
  const embeddingStr = `[${embedding.join(",")}]`;

  const rows = await queryWithRetry(() => getSql()`
    SELECT
      c.id,
      c.document_id,
      c.content,
      c.chunk_index,
      c.page_number,
      d.filename,
      1 - (c.embedding <=> ${embeddingStr}::vector) AS similarity
    FROM chunks c
    JOIN documents d ON d.id = c.document_id
    WHERE c.embedding IS NOT NULL
    ORDER BY c.embedding <=> ${embeddingStr}::vector
    LIMIT ${limit}
  `);

  return rows.map((row: any) => ({
    id: row.id as number,
    document_id: row.document_id as number,
    content: row.content as string,
    chunk_index: row.chunk_index as number,
    page_number: row.page_number as number | null,
    filename: row.filename as string,
    similarity: row.similarity as number,
  }));
}

// --- Получение списка документов ---
export async function listDocuments(): Promise<DocumentRecord[]> {
  const rows = await queryWithRetry(() => getSql()`
    SELECT id, filename, created_at
    FROM documents
    ORDER BY created_at DESC
  `);
  return rows.map((r: any) => ({
    id: r.id as number,
    filename: r.filename as string,
    created_at: (r.created_at as Date).toISOString(),
  }));
}

// --- Удаление документа и его чанков ---
export async function deleteDocument(id: number): Promise<void> {
  await queryWithRetry(() => getSql()`DELETE FROM documents WHERE id = ${id}`);
}

// --- Формирование контекста из результатов поиска ---
export function buildRagContext(results: SearchResult[]): string {
  if (results.length === 0) return "";

  return results
    .map((r, i) => {
      const source = `${r.filename}${r.page_number ? `, стр. ${r.page_number}` : ""}`;
      return `[Источник #${i + 1}: ${source}]\n${r.content}`;
    })
    .join("\n\n---\n\n");
}
