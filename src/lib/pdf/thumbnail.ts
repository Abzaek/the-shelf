"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";

/**
 * Render a page to a compact JPEG blob for use as a shelf thumbnail.
 * Width is capped so thumbnails stay small even for huge pages.
 */
export async function renderPageToBlob(
  doc: PDFDocumentProxy,
  pageNumber = 1,
  targetWidth = 480,
  quality = 0.82,
): Promise<Blob> {
  const page = await doc.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = targetWidth / baseViewport.width;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Could not create a canvas context.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  // "print" intent makes pdf.js schedule work with microtasks instead of
  // requestAnimationFrame, so thumbnails still render in background tabs.
  await page.render({ canvas, canvasContext: context, viewport, intent: "print" }).promise;
  page.cleanup();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new Error("Could not encode the cover thumbnail.");
  return blob;
}

/** Downscale an uploaded cover image so we never store multi-megabyte covers. */
export async function normalizeCoverImage(file: Blob, maxWidth = 600): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create a canvas context.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
  if (!blob) throw new Error("Could not process the cover image.");
  return blob;
}
