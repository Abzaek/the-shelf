"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import type { Book, Collection, Settings } from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import { storage, storageEvents } from "@/lib/storage";
import { activateLibrary, deactivateLibrary, currentUserId } from "@/lib/storage/local/runtime";
import { cachedSession, saveSession, lockSession, isLocallySignedOut } from "@/lib/storage/local/session";
import { syncStatus } from "@/lib/sync/status";
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
  const isOfflineShell = pathname === "/offline";
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
  const sessionGeneration = useRef(0);

  const refreshSession = useCallback(async () => {
    const generation = ++sessionGeneration.current;
    try {
      if (isLocallySignedOut()) { setUser(null); return; }
      let info;
      try {
        info = await authClient.session();
        if (!info.user) {
          const cached = cachedSession();
          if (cached) { info = cached; syncStatus.set({ phase: "sign-in" }); }
        } else saveSession(info);
      } catch (error) {
        info = cachedSession();
        if (!info) throw error;
      }
      if (generation !== sessionGeneration.current || isLocallySignedOut()) return;
      if (info.user && (!info.emailVerificationRequired || info.user.emailVerified)) {
        if (currentUserId() !== info.user.id) { setBooks([]); setCollections([]); setSettings(DEFAULT_SETTINGS); setBooksLoading(true); setSettingsLoaded(false); }
        await activateLibrary(info.user.id);
      }
      if (generation !== sessionGeneration.current || isLocallySignedOut()) return;
      setUser(info.user);
      setUsage(info.usage);
      setVerificationRequired(info.emailVerificationRequired);
    } catch (error) {
      if (generation !== sessionGeneration.current) return;
      setBooksError(error instanceof Error ? error : new Error("Could not open local storage."));
      setUser(null);
      setUsage(null);
    } finally {
      if (generation === sessionGeneration.current) setAuthLoading(false);
    }
  }, []);

  const refreshBooks = useCallback(async () => {
    try {
      const account = currentUserId();
      const list = await storage.getBooks();
      if (account !== currentUserId()) return;
      setBooks(list.sort((a, b) => a.title.localeCompare(b.title)));
      setBooksError(null);
      authClient.usage().then(value => { if (account === currentUserId()) setUsage(value); }).catch(() => null);
    } catch (err) {
      setBooksError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setBooksLoading(false);
    }
  }, []);

  const refreshCollections = useCallback(async () => {
    try {
      const account = currentUserId();
      const list = await storage.getCollections();
      if (account === currentUserId()) setCollections(list);
    } catch {
      /* handled by auth redirect */
    } finally {
      setCollectionsLoading(false);
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    try {
      const account = currentUserId();
      const loaded = await storage.getSettings();
      if (account !== currentUserId()) return;
      setSettings(loaded);
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
      if (!isPublic && !isVerifyPage && !isOfflineShell) router.replace(`/login${pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : ""}`);
      return;
    }
    const needsVerification = verificationRequired && !user.emailVerified;
    if (needsVerification) {
      if (!isVerifyPage) router.replace(VERIFY_PATH);
      return;
    }
    if (isPublic) return;
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
      if (topic === "auth") syncStatus.set({ phase: "sign-in" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id, user?.emailVerified, verificationRequired, isPublic, isVerifyPage, isOfflineShell]);

  useEffect(() => {
    const changed = () => { if (isLocallySignedOut()) { ++sessionGeneration.current; void deactivateLibrary(); setUser(null); setBooks([]); setCollections([]); setSettingsLoaded(false); } else void refreshSession(); };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [refreshSession]);

  useEffect(() => {
    if (settingsLoaded) applyTheme(settings.theme);
  }, [settings.theme, settingsLoaded, applyTheme]);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch })); // optimistic
    await storage.updateSettings(patch);
  }, []);

  const signOut = useCallback(async () => {
    ++sessionGeneration.current;
    lockSession();
    await deactivateLibrary();
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
