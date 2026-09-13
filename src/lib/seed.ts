"use client";

import type { ReadingStatus } from "@/types";
import { createPlaceholderPdf } from "@/lib/pdf/placeholder";
import { storage } from "@/lib/storage";

export interface SeedBook {
  title: string;
  author: string;
  category: string;
  tags: string[];
  description: string;
  status: ReadingStatus;
  pages: number;
  currentPage?: number;
}

/**
 * Sample library. Metadata only — the PDFs are generated placeholders,
 * never the copyrighted works themselves.
 */
export const SEED_BOOKS: SeedBook[] = [
  {
    title: "Thinking, Fast and Slow",
    author: "Daniel Kahneman",
    category: "Psychology",
    tags: ["cognition", "biases", "decision-making"],
    description: "Two systems drive the way we think: one fast and intuitive, one slow and deliberate. A tour of the biases that follow.",
    status: "reading",
    pages: 64,
    currentPage: 40,
  },
  {
    title: "Influence",
    author: "Robert Cialdini",
    category: "Persuasion",
    tags: ["psychology", "marketing"],
    description: "The six principles of persuasion and the situations in which people say yes.",
    status: "want-to-read",
    pages: 48,
  },
  {
    title: "The Psychology of Money",
    author: "Morgan Housel",
    category: "Finance",
    tags: ["behaviour", "investing"],
    description: "Timeless lessons on wealth, greed and happiness, told through short stories.",
    status: "finished",
    pages: 36,
  },
  {
    title: "The Intelligent Investor",
    author: "Benjamin Graham",
    category: "Finance",
    tags: ["value investing", "classic"],
    description: "The definitive book on value investing and the discipline of the margin of safety.",
    status: "paused",
    pages: 72,
    currentPage: 12,
  },
  {
    title: "Zero to One",
    author: "Peter Thiel",
    category: "Business",
    tags: ["startups", "strategy"],
    description: "Notes on startups, and how to build the future by creating something new rather than copying.",
    status: "want-to-read",
    pages: 40,
  },
  {
    title: "Sapiens",
    author: "Yuval Noah Harari",
    category: "History",
    tags: ["anthropology", "civilisation"],
    description: "A brief history of humankind, from the cognitive revolution to the present.",
    status: "reading",
    pages: 80,
    currentPage: 9,
  },
  {
    title: "Never Split the Difference",
    author: "Chris Voss",
    category: "Persuasion",
    tags: ["negotiation", "communication"],
    description: "A former FBI negotiator's field guide to negotiating as if your life depended on it.",
    status: "want-to-read",
    pages: 44,
  },
];

export async function addSampleBooks(onProgress?: (done: number, total: number) => void): Promise<number> {
  const { loadPdfDocument, destroyPdfDocument } = await import("@/lib/pdf/pdfjs");
  const { renderPageToBlob } = await import("@/lib/pdf/thumbnail");
  const existing = await storage.getBooks();
  const existingKeys = new Set(existing.map((b) => `${b.title.toLowerCase()}::${b.author.toLowerCase()}`));
  let added = 0;

  for (let i = 0; i < SEED_BOOKS.length; i++) {
    const seed = SEED_BOOKS[i];
    if (existingKeys.has(`${seed.title.toLowerCase()}::${seed.author.toLowerCase()}`)) {
      onProgress?.(i + 1, SEED_BOOKS.length);
      continue;
    }
    const pdf = createPlaceholderPdf({ title: seed.title, author: seed.author, pages: seed.pages });
    let cover: Blob | null = null;
    try {
      const doc = await loadPdfDocument(pdf);
      cover = await renderPageToBlob(doc, 1, 480);
      await destroyPdfDocument(doc);
    } catch {
      cover = null;
    }
    const book = await storage.addBook({
      title: seed.title,
      author: seed.author,
      description: seed.description,
      category: seed.category,
      tags: seed.tags,
      status: seed.status,
      totalPages: seed.pages,
      currentPage: seed.currentPage ?? 1,
      format: "pdf",
      file: pdf,
      fileName: `${seed.title}.pdf`,
      cover,
      coverKind: "generated",
    });
    if (seed.currentPage && seed.status !== "finished") {
      await storage.saveProgress(book.id, { currentPage: seed.currentPage, totalPages: seed.pages });
      if (seed.status === "paused") await storage.updateBook(book.id, { status: "paused" });
    }
    added += 1;
    onProgress?.(i + 1, SEED_BOOKS.length);
  }
  return added;
}
