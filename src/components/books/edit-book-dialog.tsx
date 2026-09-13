"use client";

import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLibrary } from "@/components/library-provider";
import { useBook } from "@/hooks/use-books";
import { storage } from "@/lib/storage";
import { formatBytes } from "@/lib/utils/format";
import { DEFAULT_CATEGORIES, FORMAT_LABELS, type Book } from "@/types";
import { BOOK_FILE_ACCEPT, detectFormat, lengthLabel } from "@/lib/utils/book-format";
import { BookFormFields, type BookFormValues } from "./book-form";
import { CoverPicker } from "./cover-picker";

export function EditBookDialog() {
  const { editBookId, setEditBookId } = useLibrary();
  const book = useBook(editBookId);
  const close = () => setEditBookId(null);

  return (
    <Dialog open={!!editBookId && !!book} onOpenChange={(o) => !o && close()}>
      <DialogContent className="gap-0 p-0 sm:max-w-3xl" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="font-serif text-[22px] font-medium tracking-tight">Edit book</DialogTitle>
          <DialogDescription>Changes are saved to this device.</DialogDescription>
        </DialogHeader>
        {/* Keyed by book so form state resets when a different book is edited. */}
        {book && <EditBookForm key={book.id} book={book} onClose={close} />}
      </DialogContent>
    </Dialog>
  );
}

function EditBookForm({ book, onClose }: { book: Book; onClose: () => void }) {
  const { settings, updateSettings } = useLibrary();
  const [values, setValues] = useState<BookFormValues>({
    title: book.title,
    author: book.author,
    category: book.category,
    description: book.description,
    tags: book.tags,
    status: book.status,
  });
  const [cover, setCover] = useState<Blob | null>(null);
  const [coverChange, setCoverChange] = useState<{ blob: Blob | null; kind: "custom" | "generated" | "none" } | null>(null);
  const [saving, setSaving] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    if (!values.title.trim()) return;
    setSaving(true);
    try {
      const category = values.category.trim() || "Other";
      await storage.updateBook(book.id, { ...values, category, title: values.title.trim(), author: values.author.trim() });
      if (coverChange) await storage.setCover(book.id, coverChange.blob, coverChange.kind);
      if (!(DEFAULT_CATEGORIES as readonly string[]).includes(category) && !settings.customCategories.includes(category)) {
        void updateSettings({ customCategories: [...settings.customCategories, category] });
      }
      toast.success("Book updated");
      onClose();
    } catch (err) {
      toast.error("Could not save changes", { description: err instanceof Error ? err.message : undefined });
      setSaving(false);
    }
  };

  const attachFile = async (file: File | undefined) => {
    if (!file) return;
    const format = detectFormat(file);
    if (!format) {
      toast.error("Only PDF and EPUB files are supported.");
      return;
    }
    if (format !== book.format) {
      toast.error(`This book is ${FORMAT_LABELS[book.format]}. Add a new book for a different format.`);
      return;
    }
    setAttaching(true);
    try {
      let pages = 0;
      let thumb: Blob | null = null;
      if (format === "pdf") {
        const { loadPdfDocument, destroyPdfDocument } = await import("@/lib/pdf/pdfjs");
        const doc = await loadPdfDocument(file);
        pages = doc.numPages;
        if (!book.coverId) {
          const { renderPageToBlob } = await import("@/lib/pdf/thumbnail");
          thumb = await renderPageToBlob(doc, 1, 480).catch(() => null);
        }
        await destroyPdfDocument(doc);
      } else {
        const { openEpub, extractEpubCover } = await import("@/lib/epub/epub");
        const epub = await openEpub(file);
        if (!book.coverId) thumb = await extractEpubCover(epub);
        epub.destroy();
      }
      await storage.setFile(book.id, file, file.name, pages);
      if (thumb) await storage.setCover(book.id, thumb, "generated");
      toast.success(`${FORMAT_LABELS[format]} attached`);
    } catch (err) {
      toast.error("Could not open that file", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setAttaching(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="grid gap-6 px-6 pt-5 pb-2 sm:grid-cols-[200px_1fr]">
        <div className="space-y-4">
          <CoverPicker
            title={values.title}
            author={values.author}
            cover={cover}
            storedCoverId={coverChange?.kind === "none" ? null : book.coverId}
            bookId={book.id}
            onChange={(blob, kind) => {
              setCover(blob);
              setCoverChange({ blob, kind });
            }}
          />
          <div className="space-y-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            {book.fileSize > 0 ? (
              <>
                <p className="truncate font-medium text-foreground" title={book.fileName}>{book.fileName}</p>
                <p>
                  {FORMAT_LABELS[book.format]} · {lengthLabel(book)} · {formatBytes(book.fileSize)}
                </p>
              </>
            ) : (
              <>
                <p className="font-medium text-destructive">{FORMAT_LABELS[book.format]} file missing</p>
                <p>This book was restored without its file.</p>
              </>
            )}
            <input
              ref={pdfInputRef}
              type="file"
              accept={BOOK_FILE_ACCEPT}
              className="sr-only"
              aria-label="Attach or replace the book file"
              onChange={(e) => {
                void attachFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button type="button" variant="outline" size="xs" onClick={() => pdfInputRef.current?.click()} disabled={attaching}>
              <FileUp aria-hidden data-icon="inline-start" /> {attaching ? "Opening…" : book.fileSize > 0 ? `Replace ${FORMAT_LABELS[book.format]}` : `Attach ${FORMAT_LABELS[book.format]}`}
            </Button>
          </div>
        </div>
        <div className="max-h-[55vh] overflow-y-auto pr-1 scroll-thin sm:max-h-none">
          <BookFormFields values={values} onChange={(p) => setValues((v) => ({ ...v, ...p }))} idPrefix="edit" />
        </div>
      </div>
      <DialogFooter className="border-t border-border/70 px-6 py-4">
        <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || !values.title.trim()}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}
