"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { FileText, Upload, AlertCircle, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLibrary } from "@/components/library-provider";
import { storage } from "@/lib/storage";
import { destroyPdfDocument, loadPdfDocument } from "@/lib/pdf/pdfjs";
import { extractPdfMetadata } from "@/lib/pdf/metadata";
import { renderPageToBlob } from "@/lib/pdf/thumbnail";
import { formatBytes } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { DEFAULT_CATEGORIES } from "@/types";
import { BookFormFields, type BookFormValues } from "./book-form";
import { CoverPicker } from "./cover-picker";

type Step = "drop" | "processing" | "details";

const EMPTY: BookFormValues = { title: "", author: "", category: "Other", description: "", tags: [], status: "want-to-read" };

export function AddBookDialog() {
  const { addBookOpen, setAddBookOpen, openBook, settings, updateSettings } = useLibrary();
  const [step, setStep] = useState<Step>("drop");
  const [file, setFile] = useState<File | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [values, setValues] = useState<BookFormValues>(EMPTY);
  const [generatedCover, setGeneratedCover] = useState<Blob | null>(null);
  const [cover, setCover] = useState<Blob | null>(null);
  const [coverKind, setCoverKind] = useState<"custom" | "generated" | "none">("none");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep("drop");
    setFile(null);
    setTotalPages(0);
    setValues(EMPTY);
    setGeneratedCover(null);
    setCover(null);
    setCoverKind("none");
    setError(null);
    setSaving(false);
  }, []);

  useEffect(() => {
    if (!addBookOpen) {
      const t = setTimeout(reset, 200);
      return () => clearTimeout(t);
    }
  }, [addBookOpen, reset]);

  const processFile = useCallback(async (picked: File) => {
    if (!(picked.type === "application/pdf" || /\.pdf$/i.test(picked.name))) {
      setError("Only PDF files can be added to the shelf.");
      return;
    }
    setError(null);
    setFile(picked);
    setStep("processing");
    try {
      const doc = await loadPdfDocument(picked);
      try {
        const meta = await extractPdfMetadata(doc, picked.name);
        setTotalPages(meta.totalPages);
        setValues((v) => ({ ...v, title: meta.title, author: meta.author }));
        try {
          const thumb = await renderPageToBlob(doc, 1, 480);
          setGeneratedCover(thumb);
          setCover(thumb);
          setCoverKind("generated");
        } catch {
          setGeneratedCover(null);
        }
      } finally {
        await destroyPdfDocument(doc);
      }
      setStep("details");
    } catch (err) {
      console.error(err);
      setStep("drop");
      setFile(null);
      setError(
        err instanceof Error && /password/i.test(err.message)
          ? "This PDF is password-protected and cannot be opened."
          : "This file could not be opened as a PDF. It may be damaged.",
      );
    }
  }, []);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) void processFile(dropped);
  };

  const save = async () => {
    if (!file || !values.title.trim()) return;
    setSaving(true);
    try {
      const category = values.category.trim() || "Other";
      const book = await storage.addBook({
        ...values,
        category,
        totalPages,
        pdf: file,
        pdfName: file.name,
        cover,
        coverKind,
      });
      if (!(DEFAULT_CATEGORIES as readonly string[]).includes(category) &&
          !settings.customCategories.includes(category)) {
        void updateSettings({ customCategories: [...settings.customCategories, category] });
      }
      toast.success("Added to your shelf", {
        description: book.title,
        action: { label: "Open", onClick: () => openBook(book.id) },
      });
      setAddBookOpen(false);
    } catch (err) {
      toast.error("Could not save the book", { description: err instanceof Error ? err.message : undefined });
      setSaving(false);
    }
  };

  return (
    <Dialog open={addBookOpen} onOpenChange={setAddBookOpen}>
      <DialogContent
        className={cn("gap-0 p-0 sm:max-w-lg", step === "details" && "sm:max-w-3xl")}
        onInteractOutside={(e) => {
          if (step === "details") e.preventDefault();
        }}
      >
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="font-serif text-[22px] font-medium tracking-tight">Add a book</DialogTitle>
          <DialogDescription>
            {step === "details"
              ? "Check the details before it goes on the shelf."
              : "Add a PDF you own. It stays on this device."}
          </DialogDescription>
        </DialogHeader>

        {step !== "details" && (
          <div className="px-6 pb-6 pt-5">
            <div
              role="button"
              tabIndex={0}
              aria-label="Drop a PDF here or press Enter to choose a file"
              aria-busy={step === "processing"}
              onClick={() => step === "drop" && inputRef.current?.click()}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && step === "drop") {
                  e.preventDefault();
                  inputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                "flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center transition-colors outline-none",
                "focus-visible:ring-2 focus-visible:ring-ring",
                dragging ? "border-brass bg-brass/10" : "border-border hover:border-foreground/30 hover:bg-muted/40",
                step === "processing" && "cursor-progress",
              )}
            >
              {step === "processing" ? (
                <>
                  <FileText className="size-8 animate-pulse text-brass" strokeWidth={1.5} aria-hidden />
                  <p className="font-serif text-lg">Reading {file?.name}</p>
                  <p className="text-sm text-muted-foreground">Extracting details and the first page…</p>
                </>
              ) : (
                <>
                  <Upload className="size-8 text-muted-foreground" strokeWidth={1.5} aria-hidden />
                  <p className="font-serif text-lg">Drag your PDF here</p>
                  <p className="text-sm text-muted-foreground">or</p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      inputRef.current?.click();
                    }}
                  >
                    Choose PDF
                  </Button>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                tabIndex={-1}
                onChange={(e) => {
                  const picked = e.target.files?.[0];
                  if (picked) void processFile(picked);
                  e.target.value = "";
                }}
              />
            </div>
            {error && (
              <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {error}
              </p>
            )}
          </div>
        )}

        {step === "details" && file && (
          <form
            className="flex flex-col"
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
                  generated={generatedCover}
                  onChange={(blob, kind) => {
                    setCover(blob);
                    setCoverKind(kind);
                  }}
                />
                <div className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                  <p className="truncate font-medium text-foreground" title={file.name}>{file.name}</p>
                  <p>
                    {totalPages} pages · {formatBytes(file.size)}
                  </p>
                </div>
              </div>
              <div className="max-h-[55vh] overflow-y-auto pr-1 scroll-thin sm:max-h-none">
                <BookFormFields values={values} onChange={(p) => setValues((v) => ({ ...v, ...p }))} idPrefix="add" autoFocusTitle />
              </div>
            </div>
            <DialogFooter className="border-t border-border/70 px-6 py-4 sm:justify-between">
              <Button type="button" variant="ghost" onClick={reset} disabled={saving}>
                <ArrowLeft aria-hidden data-icon="inline-start" /> Different file
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setAddBookOpen(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving || !values.title.trim()}>
                  {saving ? "Saving…" : "Add to shelf"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
