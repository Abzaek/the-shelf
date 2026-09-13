"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { storage } from "@/lib/storage";
import { useStorageQuery } from "./use-storage-query";

export function useNotes(bookId: string | undefined) {
  const query = useStorageQuery(
    ["notes"],
    () => (bookId ? storage.getNotes(bookId) : Promise.resolve([])),
    [bookId],
    bookId,
  );

  const addNote = useCallback(
    async (page: number, content: string) => {
      if (!bookId || !content.trim()) return;
      const note = await storage.addNote(bookId, page, content);
      toast.success("Note saved");
      return note;
    },
    [bookId],
  );

  const updateNote = useCallback(async (id: string, content: string) => {
    const note = await storage.updateNote(id, content);
    toast.success("Note saved");
    return note;
  }, []);

  const deleteNote = useCallback(async (id: string) => {
    await storage.deleteNote(id);
    toast("Note deleted");
  }, []);

  return { notes: query.data ?? [], loading: query.loading, addNote, updateNote, deleteNote };
}
