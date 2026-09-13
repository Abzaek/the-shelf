"use client";

import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { storage } from "@/lib/storage";
import { useStorageQuery } from "./use-storage-query";

export function useBookmarks(bookId: string | undefined) {
  const query = useStorageQuery(
    ["bookmarks"],
    () => (bookId ? storage.getBookmarks(bookId) : Promise.resolve([])),
    [bookId],
    bookId,
  );

  const addBookmark = useCallback(
    async (page: number, label?: string) => {
      if (!bookId) return;
      const bookmark = await storage.addBookmark(bookId, page, label);
      toast.success(`Bookmarked page ${page}`);
      return bookmark;
    },
    [bookId],
  );

  const removeBookmark = useCallback(async (id: string) => {
    await storage.removeBookmark(id);
    toast("Bookmark removed");
  }, []);

  const data = query.data;
  const bookmarks = useMemo(() => data ?? [], [data]);
  const isBookmarked = useCallback((page: number) => bookmarks.some((b) => b.page === page), [bookmarks]);

  return { bookmarks, loading: query.loading, addBookmark, removeBookmark, isBookmarked };
}
