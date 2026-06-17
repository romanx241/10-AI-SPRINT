import { NextRequest, NextResponse } from "next/server";
import { extractTextFromBuffer, chunkText, storeDocument } from "@/lib/rag";
import { warmUp } from "@/lib/db";

// Максимальный размер файла: 10 МБ
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".pdf", ".txt", ".md"];

export async function POST(req: NextRequest) {
  try {
    await warmUp();
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Файл не найден в запросе" },
        { status: 400 }
      );
    }

    // Проверка размера
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Файл слишком большой. Максимум 10 МБ" },
        { status: 400 }
      );
    }

    // Проверка расширения
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        {
          error: `Неподдерживаемый формат: ${ext}. Допустимые: PDF, TXT, MD`,
        },
        { status: 400 }
      );
    }

    // Извлечение текста
    const buffer = Buffer.from(await file.arrayBuffer());
    const { text } = await extractTextFromBuffer(buffer, file.name);

    if (!text || text.trim().length < 10) {
      return NextResponse.json(
        { error: "Не удалось извлечь текст из файла — возможно, файл пуст или является скан-копией без OCR" },
        { status: 400 }
      );
    }

    // Чанкинг
    const chunks = chunkText(text, 300, 50);

    // Сохранение в БД
    const documentId = await storeDocument(file.name, chunks);

    return NextResponse.json({
      success: true,
      documentId,
      filename: file.name,
      chunks: chunks.length,
      message: `Файл «${file.name}» загружен (${chunks.length} фрагментов)`,
    });
  } catch (err: any) {
    console.error("[Upload] Ошибка:", err);
    return NextResponse.json(
      { error: err.message || "Ошибка загрузки файла" },
      { status: 500 }
    );
  }
}
