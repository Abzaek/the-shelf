"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import type { Book, Collection, Settings } from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import { storage, storageEvents } from "@/lib/storage";

interface LibraryContextValue {
  books: Book[];
  booksLoading: boolean;
  booksError: Error | null;
  refreshBooks: () => Promise<void>;
  collections: Collection[];
  collectionsLoading: boolean;
  settings: Settings;
  settingsLoaded: boolean;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  // UI state shared across the shelf
  selectedBookId: string | null;
  openBook: (id: string | null) => void;
  addBookOpen: boolean;
  setAddBookOpen: (open: boolean) => void;
  editBookId: string | null;
  setEditBookId: (id: string | null) => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [books, setBooks] = useState<Book[]>([]);
  const [booksLoading, setBooksLoading] = useState(true);
  const [booksError, setBooksError] = useState<Error | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(true);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [addBookOpen, setAddBookOpen] = useState(false);
  const [editBookId, setEditBookId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const { setTheme: applyTheme } = useTheme();

  const refreshBooks = useCallback(async () => {
    try {
      const list = await storage.getBooks();
      setBooks(list.sort((a, b) => a.title.localeCompare(b.title)));
      setBooksError(null);
    } catch (err) {
      setBooksError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setBooksLoading(false);
    }
  }, []);

  const refreshCollections = useCallback(async () => {
    try {
      setCollections(await storage.getCollections());
    } finally {
      setCollectionsLoading(false);
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    const next = await storage.getSettings();
    setSettings(next);
    setSettingsLoaded(true);
  }, []);

  useEffect(() => {
    // Initial load: these are async IndexedDB reads; state is set after await, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshBooks();
    void refreshCollections();
    void refreshSettings();
    return storageEvents.subscribe((topic) => {
      if (topic === "books") void refreshBooks();
      if (topic === "collections") void refreshCollections();
      if (topic === "settings") void refreshSettings();
    });
  }, [refreshBooks, refreshCollections, refreshSettings]);

  // Persisted theme preference drives next-themes.
  useEffect(() => {
    if (settingsLoaded) applyTheme(settings.theme);
  }, [settings.theme, settingsLoaded, applyTheme]);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch })); // optimistic
    await storage.updateSettings(patch);
  }, []);

  const value = useMemo<LibraryContextValue>(
    () => ({
      books,
      booksLoading,
      booksError,
      refreshBooks,
      collections,
      collectionsLoading,
      settings,
      settingsLoaded,
      updateSettings,
      selectedBookId,
      openBook: setSelectedBookId,
      addBookOpen,
      setAddBookOpen,
      editBookId,
      setEditBookId,
      searchOpen,
      setSearchOpen,
    }),
    [
      books, booksLoading, booksError, refreshBooks, collections, collectionsLoading,
      settings, settingsLoaded, updateSettings, selectedBookId, addBookOpen, editBookId, searchOpen,
    ],
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary must be used within LibraryProvider");
  return ctx;
}
