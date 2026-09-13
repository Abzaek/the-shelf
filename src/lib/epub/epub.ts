"use client";

import ePub, { type Book as EpubBook, type NavItem } from "epubjs";
import type { TocEntry } from "@/lib/pdf/outline";
import type { SearchMatch } from "@/lib/pdf/search";
import { fileNameToTitle } from "@/lib/utils/format";
import { normalizeCoverImage } from "@/lib/pdf/thumbnail";
import { storage } from "@/lib/storage";

/** Characters per generated "location"; ~a paragraph. Same value must be used for cached maps. */
export const LOCATION_CHARS = 1600;

/** Open an EPUB blob. Caller must `destroy()` the book when done. */
export async function openEpub(blob: Blob): Promise<EpubBook> {
  const data = await blob.arrayBuffer();
  const book = ePub(data as unknown as string, { openAs: "binary" });
  // `opened` resolves after resource replacement finishes; destroying before
  // that leaves a dangling promise inside epub.js.
  await book.opened;
  await book.ready;
  return book;
}

export interface EpubMetadata {
  title: string;
  author: string;
  description: string;
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export async function extractEpubMetadata(book: EpubBook, fileName: string): Promise<EpubMetadata> {
  const meta = await book.loaded.metadata;
  const description = clean(meta.description).replace(/<[^>]+>/g, "");
  return {
    title: clean(meta.title) || fileNameToTitle(fileName.replace(/\.epub$/i, "")),
    author: clean(meta.creator),
    description,
  };
}

/** Cover image from the package, downscaled for the shelf. */
export async function extractEpubCover(book: EpubBook): Promise<Blob | null> {
  try {
    const url = await book.coverUrl();
    if (!url) return null;
    const blob = await (await fetch(url)).blob();
    URL.revokeObjectURL(url);
    return await normalizeCoverImage(blob, 600);
  } catch {
    return null;
  }
}

/** Flatten the EPUB navigation into TOC entries (pages resolved when locations exist). */
export async function getEpubToc(book: EpubBook, maxDepth = 3): Promise<TocEntry[]> {
  const nav = await book.loaded.navigation;
  const entries: TocEntry[] = [];
  let counter = 0;
  const walk = (items: NavItem[], depth: number) => {
    for (const item of items) {
      entries.push({
        id: `toc-${counter++}`,
        title: clean(item.label) || "Untitled",
        page: locationForHref(book, item.href),
        href: item.href,
        depth,
      });
      if (item.subitems?.length && depth + 1 < maxDepth) walk(item.subitems, depth + 1);
    }
  };
  walk(nav.toc ?? [], 0);
  return entries;
}

/** Location index (1-based) for a spine href, or null if locations aren't ready. */
export function locationForHref(book: EpubBook, href: string): number | null {
  try {
    if (!book.locations.length()) return null;
    const section = book.spine.get(href);
    if (!section) return null;
    const cfi = `epubcfi(${(section as unknown as { cfiBase: string }).cfiBase}!/4/1:0)`;
    const loc = book.locations.locationFromCfi(cfi) as unknown as number;
    return typeof loc === "number" && loc >= 0 ? loc + 1 : null;
  } catch {
    return null;
  }
}

/** 1-based location index for a CFI, or null. */
export function locationForCfi(book: EpubBook, cfi: string): number | null {
  try {
    if (!book.locations.length()) return null;
    const loc = book.locations.locationFromCfi(cfi) as unknown as number;
    return typeof loc === "number" && loc >= 0 ? loc + 1 : null;
  } catch {
    return null;
  }
}

/**
 * Load the cached location map for this book or generate and cache it.
 * Generation walks the whole text once; a few seconds for a long novel.
 */
export async function ensureLocations(book: EpubBook, bookId: string): Promise<number> {
  const cached = await storage.getLocations(bookId);
  if (cached) {
    try {
      book.locations.load(cached);
      if (book.locations.length()) return book.locations.length();
    } catch {
      // fall through and regenerate
    }
  }
  await book.locations.generate(LOCATION_CHARS);
  const total = book.locations.length();
  if (total) await storage.setLocations(bookId, book.locations.save());
  return total;
}

interface SectionLike {
  href: string;
  load(loader: unknown): Promise<unknown>;
  unload(): void;
  find(query: string): Array<{ cfi: string; excerpt: string }>;
}

export interface EpubSearchOptions {
  signal?: AbortSignal;
  onProgress?: (scanned: number, total: number, matches: SearchMatch[]) => void;
  maxMatches?: number;
}

/** Full-text search across every spine item. Streams progress per chapter. */
export async function searchEpub(
  book: EpubBook,
  query: string,
  { signal, onProgress, maxMatches = 300 }: EpubSearchOptions = {},
): Promise<SearchMatch[]> {
  const needle = query.trim();
  const matches: SearchMatch[] = [];
  if (!needle) return matches;

  const sections: SectionLike[] = [];
  book.spine.each((s: unknown) => sections.push(s as SectionLike));
  const total = sections.length;

  for (let i = 0; i < total; i++) {
    if (signal?.aborted) break;
    const section = sections[i];
    try {
      await section.load(book.load.bind(book));
      const found = section.find(needle);
      for (const f of found) {
        if (matches.length >= maxMatches) break;
        const excerpt = f.excerpt.replace(/\s+/g, " ");
        const idx = excerpt.toLowerCase().indexOf(needle.toLowerCase());
        const loc = locationForCfi(book, f.cfi) ?? i + 1;
        matches.push({
          id: `${i}-${f.cfi}`,
          page: loc,
          cfi: f.cfi,
          before: idx >= 0 ? excerpt.slice(0, idx) : excerpt,
          match: idx >= 0 ? excerpt.slice(idx, idx + needle.length) : "",
          after: idx >= 0 ? excerpt.slice(idx + needle.length) : "",
        });
      }
    } catch {
      // unreadable section; skip
    } finally {
      section.unload();
    }
    onProgress?.(i + 1, total, matches);
    if (matches.length >= maxMatches) break;
    await new Promise((r) => setTimeout(r, 0));
  }
  onProgress?.(total, total, matches);
  return matches;
}
