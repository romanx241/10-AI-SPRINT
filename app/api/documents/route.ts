import { NextRequest, NextResponse } from "next/server";
import { listDocuments, deleteDocument } from "@/lib/rag";
import { warmUp } from "@/lib/db";

export async function GET() {
  try {
    await warmUp();
    const docs = await listDocuments();
    return NextResponse.json({ documents: docs });
  } catch (err: any) {
    console.error("[Documents] Ошибка:", err);
    return NextResponse.json(
      { error: "Ошибка получения списка документов" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await warmUp();
    const { searchParams } = new URL(req.url);
    const idStr = searchParams.get("id");
    if (!idStr) {
      return NextResponse.json(
        { error: "Не указан id документа" },
        { status: 400 }
      );
    }

    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return NextResponse.json(
        { error: "Некорректный id документа" },
        { status: 400 }
      );
    }

    await deleteDocument(id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[Documents] Ошибка удаления:", err);
    return NextResponse.json(
      { error: "Ошибка удаления документа" },
      { status: 500 }
    );
  }
}
