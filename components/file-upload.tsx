"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, FileText, X, Loader2, Trash2 } from "lucide-react";

interface DocumentInfo {
  id: number;
  filename: string;
  created_at: string;
}

export function FileUpload({
  onDocumentsChange,
}: {
  onDocumentsChange?: (docs: DocumentInfo[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocuments = useCallback(async () => {
    try {
      const res = await fetch("/api/documents");
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
        onDocumentsChange?.(data.documents || []);
      }
    } catch {
      // игнорируем
    }
  }, [onDocumentsChange]);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    loadDocuments();
  }, [loadDocuments]);

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploading(true);
      setError(null);
      setSuccessMsg(null);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Ошибка загрузки");
        } else {
          setSuccessMsg(data.message);
          await loadDocuments();
        }
      } catch {
        setError("Ошибка сети при загрузке");
      } finally {
        setUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [loadDocuments]
  );

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        const res = await fetch(`/api/documents?id=${id}`, {
          method: "DELETE",
        });
        if (res.ok) {
          await loadDocuments();
          setSuccessMsg("Документ удалён");
        }
      } catch {
        setError("Ошибка удаления");
      }
    },
    [loadDocuments]
  );

  return (
    <>
      {/* Кнопка открытия */}
      <button
        type="button"
        onClick={handleOpen}
        className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
        title="Управление документами"
      >
        <FileText className="h-3.5 w-3.5" />
        <span className="max-sm:hidden">
          {documents.length > 0
            ? `Документы (${documents.length})`
            : "Документы"}
        </span>
      </button>

      {/* Модальное окно */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Фон */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsOpen(false)}
          />

          {/* Контент */}
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-xl mx-4">
            {/* Заголовок */}
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-sm font-semibold text-foreground">
                Загруженные документы
              </h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Сообщения */}
            <div className="px-5 pt-4">
              {error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 mb-3">
                  {error}
                </div>
              )}
              {successMsg && (
                <div className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-600 mb-3">
                  {successMsg}
                </div>
              )}

              {/* Кнопка загрузки */}
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-6 text-sm text-muted-foreground hover:border-continental-300 hover:text-continental-600 transition-colors">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.md"
                  onChange={handleUpload}
                  disabled={uploading}
                  className="hidden"
                />
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Загрузка...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Загрузить PDF, TXT или MD
                  </>
                )}
              </label>
              <p className="mt-1 text-center text-[10px] text-muted-foreground">
                Максимум 10 МБ
              </p>
            </div>

            {/* Список документов */}
            <div className="max-h-64 overflow-y-auto px-5 py-4">
              {documents.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-4">
                  Нет загруженных документов
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">
                            {doc.filename}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(doc.created_at).toLocaleDateString(
                              "ru-RU"
                            )}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(doc.id)}
                        className="ml-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-red-50 hover:text-red-500 transition-colors"
                        title="Удалить документ"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
