"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { fileNameToTitle } from "@/lib/utils/format";

export interface PdfMetadata {
  title: string;
  author: string;
  totalPages: number;
}

function cleanString(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.replace(/\s+/g, " ").trim();
  // Discard junk like "untitled", "Microsoft Word - ..." prefixes, or file paths.
  if (!trimmed || /^untitled$/i.test(trimmed)) return "";
  return trimmed.replace(/^Microsoft Word - /i, "").replace(/\.(docx?|pdf|indd)$/i, "");
}

export async function extractPdfMetadata(doc: PDFDocumentProxy, fileName: string): Promise<PdfMetadata> {
  let title = "";
  let author = "";
  try {
    const { info } = await doc.getMetadata();
    const record = (info ?? {}) as Record<string, unknown>;
    title = cleanString(record.Title);
    author = cleanString(record.Author);
  } catch {
    // Metadata is optional; fall back to filename.
  }
  return {
    title: title || fileNameToTitle(fileName),
    author,
    totalPages: doc.numPages,
  };
}
