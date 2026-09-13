"use client";

import { useMemo } from "react";
import { useLibrary } from "@/components/library-provider";
import type { Book, ReadingStatus } from "@/types";

export function useBooks() {
  const { books, booksLoading, booksError, refreshBooks } = useLibrary();

  const stats = useMemo(
    () => ({
      total: books.length,
      reading: books.filter((b) => b.status === "reading").length,
      finished: books.filter((b) => b.status === "finished").length,
      wantToRead: books.filter((b) => b.status === "want-to-read").length,
    }),
    [books],
  );

  const continueReading = useMemo(
    () =>
      books
        .filter((b) => b.status === "reading")
        .sort((a, b) => (b.lastOpenedAt ?? b.updatedAt).localeCompare(a.lastOpenedAt ?? a.updatedAt)),
    [books],
  );

  const recentlyAdded = useMemo(
    () => [...books].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12),
    [books],
  );

  return { books, stats, continueReading, recentlyAdded, loading: booksLoading, error: booksError, refresh: refreshBooks };
}

export function useBook(id: string | null | undefined): Book | undefined {
  const { books } = useLibrary();
  return useMemo(() => (id ? books.find((b) => b.id === id) : undefined), [books, id]);
}

export function filterBooksByStatus(books: Book[], status: ReadingStatus | "all"): Book[] {
  return status === "all" ? books : books.filter((b) => b.status === status);
}

export function searchBooks(books: Book[], query: string): Book[] {
  const q = query.trim().toLowerCase();
  if (!q) return books;
  return books.filter(
    (b) =>
      b.title.toLowerCase().includes(q) ||
      b.author.toLowerCase().includes(q) ||
      b.category.toLowerCase().includes(q) ||
      b.tags.some((t) => t.toLowerCase().includes(q)),
  );
}
