"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import type { Book, Collection, Settings } from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import { storage, storageEvents } from "@/lib/storage";
import { authClient, type SessionUser, type Usage } from "@/lib/auth-client";

interface LibraryContextValue {
  user: SessionUser | null;
  usage: Usage | null;
  verificationRequired: boolean;
  authLoading: boolean;
  refreshSession: () => Promise<void>;
  signOut: () => Promise<void>;
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

const PUBLIC_PATHS = ["/login", "/register"];
const VERIFY_PATH = "/verify";

export function LibraryProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isPublic = PUBLIC_PATHS.includes(pathname);
  const isVerifyPage = pathname === VERIFY_PATH;

  const [user, setUser] = useState<SessionUser | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

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

  const refreshSession = useCallback(async () => {
    try {
      const info = await authClient.session();
      setUser(info.user);
      setUsage(info.usage);
      setVerificationRequired(info.emailVerificationRequired);
    } catch {
      setUser(null);
      setUsage(null);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const refreshBooks = useCallback(async () => {
    try {
      const list = await storage.getBooks();
      setBooks(list.sort((a, b) => a.title.localeCompare(b.title)));
      setBooksError(null);
      authClient.usage().then(setUsage).catch(() => null);
    } catch (err) {
      setBooksError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setBooksLoading(false);
    }
  }, []);

  const refreshCollections = useCallback(async () => {
    try {
      setCollections(await storage.getCollections());
    } catch {
      /* handled by auth redirect */
    } finally {
      setCollectionsLoading(false);
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    try {
      setSettings(await storage.getSettings());
      setSettingsLoaded(true);
    } catch {
      /* handled by auth redirect */
    }
  }, []);

  // Session first; library data only once signed in.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      if (!isPublic && !isVerifyPage) router.replace(`/login${pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : ""}`);
      return;
    }
    const needsVerification = verificationRequired && !user.emailVerified;
    if (needsVerification) {
      if (!isVerifyPage) router.replace(VERIFY_PATH);
      return;
    }
    if (isPublic) {
      router.replace("/");
      return;
    }
    if (isVerifyPage && !window.location.search.includes("token=")) {
      router.replace("/");
      return;
    }
    // Async fetches: state is set after await, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshBooks();
    void refreshCollections();
    void refreshSettings();
    return storageEvents.subscribe((topic) => {
      if (topic === "books") void refreshBooks();
      if (topic === "collections") void refreshCollections();
      if (topic === "settings") void refreshSettings();
      if (topic === "auth") {
        setUser(null);
        setUsage(null);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id, user?.emailVerified, verificationRequired, isPublic, isVerifyPage]);

  useEffect(() => {
    if (settingsLoaded) applyTheme(settings.theme);
  }, [settings.theme, settingsLoaded, applyTheme]);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch })); // optimistic
    await storage.updateSettings(patch);
  }, []);

  const signOut = useCallback(async () => {
    await authClient.logout().catch(() => null);
    setUser(null);
    setUsage(null);
    setBooks([]);
    setCollections([]);
    setSettingsLoaded(false);
    router.replace("/login");
  }, [router]);

  const value = useMemo<LibraryContextValue>(
    () => ({
      user, usage, verificationRequired, authLoading, refreshSession, signOut,
      books, booksLoading, booksError, refreshBooks,
      collections, collectionsLoading,
      settings, settingsLoaded, updateSettings,
      selectedBookId, openBook: setSelectedBookId,
      addBookOpen, setAddBookOpen, editBookId, setEditBookId, searchOpen, setSearchOpen,
    }),
    [
      user, usage, verificationRequired, authLoading, refreshSession, signOut, books, booksLoading, booksError, refreshBooks,
      collections, collectionsLoading, settings, settingsLoaded, updateSettings, selectedBookId,
      addBookOpen, editBookId, searchOpen,
    ],
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary must be used within LibraryProvider");
  return ctx;
}
