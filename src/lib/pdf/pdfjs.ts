"use client";

import { pdfjs } from "react-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";

let configured = false;

/** Configure the pdf.js worker exactly once (client only). */
export function ensurePdfWorker(): typeof pdfjs {
  if (!configured && typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    configured = true;
  }
  return pdfjs;
}

export type { PDFDocumentProxy };

/** Open a PDF blob as a pdf.js document. Caller must call `destroy()` when done. */
export async function loadPdfDocument(source: Blob | ArrayBuffer): Promise<PDFDocumentProxy> {
  const lib = ensurePdfWorker();
  const data = source instanceof Blob ? await source.arrayBuffer() : source;
  const task = lib.getDocument({ data: new Uint8Array(data) });
  return task.promise;
}

/** Release worker memory for a document opened with loadPdfDocument. */
export async function destroyPdfDocument(doc: PDFDocumentProxy): Promise<void> {
  try {
    await doc.loadingTask.destroy();
  } catch {
    // Already destroyed.
  }
}
