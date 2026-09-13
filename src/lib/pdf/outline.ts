"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";

export interface TocEntry {
  id: string;
  title: string;
  page: number | null;
  /** EPUB only: spine href to display. */
  href?: string;
  depth: number;
}

type RawOutlineItem = Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>[number];

async function resolvePage(doc: PDFDocumentProxy, dest: RawOutlineItem["dest"]): Promise<number | null> {
  try {
    let explicit = dest;
    if (typeof explicit === "string") explicit = await doc.getDestination(explicit);
    if (!Array.isArray(explicit) || !explicit.length) return null;
    const ref = explicit[0];
    if (typeof ref === "number") return ref + 1;
    if (ref && typeof ref === "object") {
      const index = await doc.getPageIndex(ref as Parameters<PDFDocumentProxy["getPageIndex"]>[0]);
      return index + 1;
    }
  } catch {
    // Broken destinations are common in the wild; just skip.
  }
  return null;
}

/** Flatten the document outline into a list with resolved page numbers. */
export async function getTableOfContents(doc: PDFDocumentProxy, maxDepth = 3): Promise<TocEntry[]> {
  const outline = await doc.getOutline().catch(() => null);
  if (!outline?.length) return [];
  const entries: TocEntry[] = [];
  let counter = 0;

  const walk = async (items: RawOutlineItem[], depth: number) => {
    for (const item of items) {
      const page = await resolvePage(doc, item.dest);
      entries.push({ id: `toc-${counter++}`, title: item.title?.trim() || "Untitled", page, depth });
      if (item.items?.length && depth + 1 < maxDepth) await walk(item.items, depth + 1);
    }
  };
  await walk(outline, 0);
  return entries;
}
