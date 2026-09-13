"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";

export interface SearchMatch {
  id: string;
  page: number;
  /** EPUB only: exact CFI of the match. */
  cfi?: string;
  /** Snippet with the match roughly centred. */
  before: string;
  match: string;
  after: string;
}

/**
 * Caches extracted page text per document so repeated searches are cheap.
 * Keyed by the document's fingerprint.
 */
const textCache = new WeakMap<PDFDocumentProxy, Map<number, string>>();

async function getPageText(doc: PDFDocumentProxy, pageNumber: number): Promise<string> {
  let cache = textCache.get(doc);
  if (!cache) {
    cache = new Map();
    textCache.set(doc, cache);
  }
  const cached = cache.get(pageNumber);
  if (cached !== undefined) return cached;

  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  let text = "";
  for (const item of content.items) {
    if ("str" in item) {
      text += item.str;
      if (item.hasEOL) text += " ";
    }
  }
  text = text.replace(/\s+/g, " ").trim();
  cache.set(pageNumber, text);
  page.cleanup();
  return text;
}

export interface SearchOptions {
  signal?: AbortSignal;
  onProgress?: (scanned: number, total: number, matches: SearchMatch[]) => void;
  maxMatches?: number;
  contextChars?: number;
}

/** Search every page's text for `query` (case-insensitive). Streams progress. */
export async function searchPdfText(
  doc: PDFDocumentProxy,
  query: string,
  { signal, onProgress, maxMatches = 300, contextChars = 48 }: SearchOptions = {},
): Promise<SearchMatch[]> {
  const needle = query.trim().toLowerCase();
  const matches: SearchMatch[] = [];
  if (!needle) return matches;

  const total = doc.numPages;
  for (let pageNumber = 1; pageNumber <= total; pageNumber++) {
    if (signal?.aborted) break;
    const text = await getPageText(doc, pageNumber);
    const haystack = text.toLowerCase();
    let index = haystack.indexOf(needle);
    while (index !== -1 && matches.length < maxMatches) {
      matches.push({
        id: `${pageNumber}-${index}`,
        page: pageNumber,
        before: text.slice(Math.max(0, index - contextChars), index),
        match: text.slice(index, index + needle.length),
        after: text.slice(index + needle.length, index + needle.length + contextChars),
      });
      index = haystack.indexOf(needle, index + needle.length);
    }
    // Yield to the event loop every few pages so the UI stays responsive.
    if (pageNumber % 4 === 0) {
      onProgress?.(pageNumber, total, matches);
      await new Promise((r) => setTimeout(r, 0));
    }
    if (matches.length >= maxMatches) break;
  }
  onProgress?.(total, total, matches);
  return matches;
}
