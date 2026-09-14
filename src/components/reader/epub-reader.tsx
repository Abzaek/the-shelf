"use client";

import { useReadingAnalytics } from "@/hooks/use-reading-analytics";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import type { Book as EpubBook, Rendition } from "epubjs";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useBookmarks } from "@/hooks/use-bookmarks";
import { useNotes } from "@/hooks/use-notes";
import { useReadingProgress } from "@/hooks/use-reading-progress";
import { useMediaQuery } from "@/hooks/use-media-query";
import { ensureLocations, getEpubToc, locationForCfi, openEpub, searchEpub } from "@/lib/epub/epub";
import type { TocEntry } from "@/lib/pdf/outline";
import type { SearchMatch } from "@/lib/pdf/search";
import { storage } from "@/lib/storage";
import { clamp } from "@/lib/utils/format";
import type { Book, Bookmark, Note, ReadingMode, Settings } from "@/types";
import { FinishedPrompt } from "./finished-prompt";
import { ReaderLoading } from "./reader-loading";
import { ReaderSidebar } from "./reader-sidebar";
import { MobileReaderBar, ReaderToolbar } from "./reader-toolbar";
import { ZOOM_STEP, type SidebarTab, type ZoomState } from "./reader-types";

interface EpubReaderProps {
  book: Book;
  file: Blob;
  settings: Settings;
}

const MIN_FONT = 0.7;
const MAX_FONT = 2;
const HIGHLIGHT_CLASS = "shelf-search-hit";

interface RelocatedLocation {
  start: { cfi: string; location: number; percentage: number; href: string };
  end: { cfi: string; location: number };
  atStart?: boolean;
  atEnd?: boolean;
}

function themeRules(dark: boolean) {
  return {
    body: {
      background: dark ? "#1c1a17" : "#fbf9f4",
      color: dark ? "#e9e4da" : "#2a2622",
      "font-family": "Georgia, 'Iowan Old Style', 'Times New Roman', serif",
      "line-height": "1.6",
      padding: "0 8px",
    },
    a: { color: dark ? "#d3b47a" : "#8a6a2f" },
    "::selection": { background: dark ? "rgba(211,180,122,0.45)" : "rgba(160,120,60,0.35)" },
    [`.${HIGHLIGHT_CLASS}`]: { fill: dark ? "rgba(211,180,122,0.5)" : "rgba(160,120,60,0.35)", "fill-opacity": "1" },
  };
}

export function EpubReader({ book, file, settings }: EpubReaderProps) {
  const router = useRouter();
  const isDesktop = useMediaQuery("(min-width: 768px)", true);
  const { resolvedTheme } = useTheme();
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const epubRef = useRef<EpubBook | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const highlightsRef = useRef<string[]>([]);
  const handleKeyRef = useRef<(e: KeyboardEvent) => void>(() => {});

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [numLocations, setNumLocations] = useState(book.totalPages || 0);
  const [currentPage, setCurrentPage] = useState(Math.max(1, book.currentPage));
  const [currentCfi, setCurrentCfi] = useState<string | null>(book.currentCfi);
  const [atEnd, setAtEnd] = useState(false);
  const [fontScale, setFontScale] = useState(() =>
    typeof settings.defaultZoom === "number" ? clamp(settings.defaultZoom, MIN_FONT, MAX_FONT) : 1,
  );
  const [readingMode, setReadingMode] = useState<ReadingMode>(settings.defaultReadingMode);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("contents");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [toc, setToc] = useState<TocEntry[] | null>(null);
  const [finishedPromptDismissed, setFinishedPromptDismissed] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState<{ scanned: number; total: number } | null>(null);
  const searchAbort = useRef<AbortController | null>(null);

  const { bookmarks, addBookmark, removeBookmark } = useBookmarks(book.id);
  const { notes, addNote, updateNote, deleteNote } = useNotes(book.id);
  const { saveProgress } = useReadingProgress(book.id);

  const flowFor = (mode: ReadingMode) => (mode === "single" ? "paginated" : "scrolled-doc");

  // ------------------------------------------------------------ open + render
  useEffect(() => {
    const container = viewportRef.current;
    if (!container) return;
    let cancelled = false;
    let epub: EpubBook | null = null;

    (async () => {
      try {
        epub = await openEpub(file);
        if (cancelled) {
          epub.destroy();
          return;
        }
        epubRef.current = epub;
        const rendition = epub.renderTo(container, {
          width: "100%",
          height: "100%",
          flow: flowFor(settings.defaultReadingMode),
          spread: "none",
          allowScriptedContent: false,
        });
        renditionRef.current = rendition;
        if (process.env.NODE_ENV !== "production") {
          (window as unknown as { __shelfEpub?: unknown }).__shelfEpub = { book: epub, rendition };
        }
        rendition.themes.register("shelf-light", themeRules(false));
        rendition.themes.register("shelf-dark", themeRules(true));
        rendition.themes.select(resolvedTheme === "dark" ? "shelf-dark" : "shelf-light");
        rendition.themes.fontSize(`${Math.round(fontScale * 100)}%`);

        rendition.on("relocated", (loc: RelocatedLocation) => {
          if (cancelled) return;
          const cfi = loc.start?.cfi ?? null;
          setCurrentCfi(cfi);
          setAtEnd(!!loc.atEnd);
          const total = epub?.locations.length() ?? 0;
          if (total && typeof loc.start?.location === "number" && loc.start.location >= 0) {
            setCurrentPage(loc.start.location + 1);
          }
        });
        rendition.on("keydown", (e: KeyboardEvent) => handleKeyRef.current(e));

        const startAt = settings.rememberLastPage && book.status !== "finished" ? book.currentCfi ?? undefined : undefined;
        await rendition.display(startAt);
        if (cancelled) return;
        setReady(true);
        setLoadError(null);

        // Locations (for progress and numbering); cached after the first open.
        const total = await ensureLocations(epub, book.id);
        if (cancelled) return;
        setNumLocations(total);
        if (total && total !== book.totalPages) void storage.updateBook(book.id, { totalPages: total });
        // Re-sync current page now that locations exist.
        const cur = (await rendition.currentLocation()) as unknown as RelocatedLocation | undefined;
        if (cur?.start?.cfi) {
          const idx = locationForCfi(epub, cur.start.cfi);
          if (idx) setCurrentPage(idx);
        }
        setToc(await getEpubToc(epub));
      } catch (err) {
        console.error(err);
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "The EPUB could not be opened.");
      }
    })();

    return () => {
      cancelled = true;
      try {
        renditionRef.current?.destroy();
      } catch {
        /* already gone */
      }
      renditionRef.current = null;
      epubRef.current?.destroy();
      epubRef.current = null;
    };
    // Open exactly once per file; later setting changes are applied imperatively below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, book.id]);

  // Theme follows the app theme.
  useEffect(() => {
    renditionRef.current?.themes.select(resolvedTheme === "dark" ? "shelf-dark" : "shelf-light");
  }, [resolvedTheme, ready]);

  // Font size.
  useEffect(() => {
    renditionRef.current?.themes.fontSize(`${Math.round(fontScale * 100)}%`);
  }, [fontScale]);

  // Keep the rendition sized to its container (sidebar open/close, window resize).
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = renditionRef.current;
      if (r && ready) {
        try {
          r.resize(el.clientWidth, el.clientHeight);
        } catch {
          /* rendition not attached yet */
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);

  useReadingAnalytics(book.id, currentPage, ready && numLocations > 0);

  // Persist progress on every relocation.
  useEffect(() => {
    if (!ready || !numLocations) return;
    saveProgress(currentPage, numLocations, currentCfi);
  }, [currentPage, currentCfi, numLocations, ready, saveProgress]);

  // ------------------------------------------------------------ navigation
  const displayCfi = useCallback((target: string) => {
    void renditionRef.current?.display(target);
  }, []);

  const goToPage = useCallback(
    (page: number) => {
      const epub = epubRef.current;
      if (!epub || !epub.locations.length()) return;
      const idx = clamp(Math.round(page), 1, epub.locations.length()) - 1;
      displayCfi(epub.locations.cfiFromLocation(idx));
    },
    [displayCfi],
  );

  const stepPage = useCallback((delta: number) => {
    const r = renditionRef.current;
    if (!r) return;
    void (delta > 0 ? r.next() : r.prev());
  }, []);

  const changeReadingMode = useCallback(
    (mode: ReadingMode) => {
      setReadingMode(mode);
      const r = renditionRef.current;
      if (!r) return;
      r.flow(flowFor(mode));
      if (currentCfi) void r.display(currentCfi);
    },
    [currentCfi],
  );

  const zoomBy = useCallback((factor: number) => setFontScale((s) => clamp(s * factor, MIN_FONT, MAX_FONT)), []);
  const setZoomPreset = useCallback((z: ZoomState) => {
    if (z.mode === "custom") setFontScale(clamp(z.scale, MIN_FONT, MAX_FONT));
    else setFontScale(1);
  }, []);

  // ------------------------------------------------------------ search
  const clearHighlights = useCallback(() => {
    const r = renditionRef.current;
    if (!r) return;
    for (const cfi of highlightsRef.current) {
      try {
        r.annotations.remove(cfi, "highlight");
      } catch {
        /* not present */
      }
    }
    highlightsRef.current = [];
  }, []);

  const runSearch = useCallback(
    (query: string) => {
      searchAbort.current?.abort();
      setSearchQuery(query);
      clearHighlights();
      const epub = epubRef.current;
      if (!epub || !query) {
        setSearchResults([]);
        setSearching(false);
        setSearchProgress(null);
        return;
      }
      const controller = new AbortController();
      searchAbort.current = controller;
      setSearching(true);
      setSearchProgress({ scanned: 0, total: 0 });
      searchEpub(epub, query, {
        signal: controller.signal,
        onProgress: (scanned, total, matches) => {
          if (controller.signal.aborted) return;
          setSearchProgress({ scanned, total });
          setSearchResults([...matches]);
        },
      })
        .then((matches) => {
          if (controller.signal.aborted) return;
          setSearchResults(matches);
          const r = renditionRef.current;
          if (r) {
            for (const m of matches.slice(0, 200)) {
              if (!m.cfi) continue;
              try {
                r.annotations.highlight(m.cfi, {}, undefined, HIGHLIGHT_CLASS);
                highlightsRef.current.push(m.cfi);
              } catch {
                /* skip bad cfi */
              }
            }
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    },
    [clearHighlights],
  );

  useEffect(() => () => searchAbort.current?.abort(), []);

  // ------------------------------------------------------------ panels
  const toggleSidebar = useCallback(
    (tab?: SidebarTab) => {
      if (tab) {
        setSidebarTab(tab);
        setSidebarOpen((open) => (open && sidebarTab === tab ? false : true));
      } else setSidebarOpen((o) => !o);
    },
    [sidebarTab],
  );

  const openSearch = useCallback(() => {
    setSidebarTab("search");
    setSidebarOpen(true);
    requestAnimationFrame(() => document.getElementById("reader-search-input")?.focus());
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await rootRef.current?.requestFullscreen();
    } catch {
      toast.error("Fullscreen isn’t available here.");
    }
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const bookmarkHere = useMemo(
    () => bookmarks.find((b) => (currentCfi && b.cfi === currentCfi) || (!b.cfi && b.page === currentPage)),
    [bookmarks, currentCfi, currentPage],
  );

  const toggleBookmark = useCallback(async () => {
    if (bookmarkHere) await removeBookmark(bookmarkHere.id);
    else if (currentCfi) await storage.addBookmark(book.id, currentPage, "", currentCfi).then(() => toast.success(`Bookmarked location ${currentPage}`));
    else await addBookmark(currentPage);
  }, [bookmarkHere, currentCfi, currentPage, book.id, addBookmark, removeBookmark]);

  const markFinished = useCallback(async () => {
    await storage.updateBook(book.id, { status: "finished" });
    toast.success("Marked as finished", { description: book.title });
    router.push("/finished");
  }, [book.id, book.title, router]);

  // ------------------------------------------------------------ keyboard
  useEffect(() => {
    handleKeyRef.current = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === "f") {
        e.preventDefault();
        openSearch();
        return;
      }
      if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        zoomBy(ZOOM_STEP);
        return;
      }
      if (mod && e.key === "-") {
        e.preventDefault();
        zoomBy(1 / ZOOM_STEP);
        return;
      }
      if (mod && e.key === "0") {
        e.preventDefault();
        setFontScale(1);
        return;
      }
      if (e.key === "Escape") {
        if (document.fullscreenElement) void document.exitFullscreen();
        else if (sidebarOpen && !typing) setSidebarOpen(false);
        return;
      }
      if (typing || mod || e.altKey) return;
      switch (e.key) {
        case "ArrowLeft":
        case "PageUp":
          e.preventDefault();
          stepPage(-1);
          break;
        case "ArrowRight":
        case "PageDown":
        case " ":
          e.preventDefault();
          stepPage(e.shiftKey ? -1 : 1);
          break;
        case "Home":
          e.preventDefault();
          goToPage(1);
          break;
        case "End":
          e.preventDefault();
          goToPage(numLocations);
          break;
        case "b":
        case "B":
          void toggleBookmark();
          break;
        case "f":
        case "F":
          void toggleFullscreen();
          break;
      }
    };
  }, [openSearch, zoomBy, sidebarOpen, stepPage, goToPage, numLocations, toggleBookmark, toggleFullscreen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => handleKeyRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ------------------------------------------------------------ render
  const showFinishedPrompt = ready && atEnd && book.status !== "finished" && !finishedPromptDismissed;
  const zoomPercent = Math.round(fontScale * 100);
  const zoom: ZoomState = { mode: "custom", scale: fontScale };

  const jumpTo = (cfi: string | undefined, page: number) => {
    if (cfi) displayCfi(cfi);
    else goToPage(page);
    if (!isDesktop) setSidebarOpen(false);
  };

  const sidebarProps = {
    tab: sidebarTab,
    onTabChange: setSidebarTab,
    onClose: () => setSidebarOpen(false),
    currentPage,
    unit: "Location",
    goToPage: (p: number) => {
      goToPage(p);
      if (!isDesktop) setSidebarOpen(false);
    },
    toc,
    onSelectToc: (entry: TocEntry) => {
      if (entry.href) displayCfi(entry.href);
      else if (entry.page) goToPage(entry.page);
      if (!isDesktop) setSidebarOpen(false);
    },
    bookmarks,
    onAddBookmark: async (page: number, label: string) => {
      if (currentCfi && page === currentPage) {
        await storage.addBookmark(book.id, page, label, currentCfi);
        toast.success(`Bookmarked location ${page}`);
      } else await addBookmark(page, label);
    },
    onRemoveBookmark: removeBookmark,
    onSelectBookmark: (b: Bookmark) => jumpTo(b.cfi, b.page),
    notes,
    onAddNote: async (page: number, content: string) => {
      if (currentCfi && page === currentPage) {
        await storage.addNote(book.id, page, content, currentCfi);
        toast.success("Note saved");
      } else await addNote(page, content);
    },
    onUpdateNote: async (id: string, content: string) => {
      await updateNote(id, content);
    },
    onDeleteNote: deleteNote,
    onSelectNote: (n: Note) => jumpTo(n.cfi, n.page),
    searchQuery,
    onSearchQueryChange: runSearch,
    searchResults,
    searching,
    searchProgress,
    onSelectMatch: (m: SearchMatch) => jumpTo(m.cfi, m.page),
  };

  const toolbarActions = {
    onPageChange: goToPage,
    onStep: stepPage,
    onZoomIn: () => zoomBy(ZOOM_STEP),
    onZoomOut: () => zoomBy(1 / ZOOM_STEP),
    onZoomPreset: setZoomPreset,
    onReadingMode: changeReadingMode,
    onToggleSidebar: toggleSidebar,
    onToggleFullscreen: toggleFullscreen,
    onToggleBookmark: toggleBookmark,
    onMarkFinished: markFinished,
  };

  return (
    <div ref={rootRef} className="flex h-svh w-full flex-col overflow-hidden bg-background text-foreground">
      <ReaderToolbar
        title={book.title}
        format="epub"
        currentPage={currentPage}
        numPages={numLocations}
        zoomPercent={zoomPercent}
        zoom={zoom}
        readingMode={readingMode}
        sidebarOpen={sidebarOpen}
        isFullscreen={isFullscreen}
        isBookmarked={!!bookmarkHere}
        isFinished={book.status === "finished"}
        {...toolbarActions}
      />

      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1 bg-[color-mix(in_oklch,var(--background),var(--foreground)_3%)]">
          {/* epub.js mounts its iframe here */}
          <div
            ref={viewportRef}
            className="absolute inset-0 mx-auto max-w-[900px] px-2 py-3 sm:px-8 sm:py-6 [&_iframe]:rounded-[2px]"
            aria-label={`${book.title} — book content`}
          />
          {!ready && !loadError && (
            <div className="absolute inset-0">
              <ReaderLoading title={book.title} />
            </div>
          )}
          {loadError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
              <p className="font-serif text-[22px] font-medium">This book can’t be opened.</p>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">{loadError}</p>
              <Button variant="outline" className="mt-6" onClick={() => router.push("/")}>Back to Shelf</Button>
            </div>
          )}

          {/* Tap zones for mobile page turns in paginated mode */}
          {ready && readingMode === "single" && !isDesktop && (
            <>
              <button type="button" aria-label="Previous page" onClick={() => stepPage(-1)} className="absolute inset-y-0 left-0 w-[18%] opacity-0" />
              <button type="button" aria-label="Next page" onClick={() => stepPage(1)} className="absolute inset-y-0 right-0 w-[18%] opacity-0" />
            </>
          )}

          <p className="sr-only" role="status" aria-live="polite">
            Location {currentPage} of {numLocations || "unknown"}
          </p>

          {showFinishedPrompt && (
            <div className="pointer-events-none absolute inset-x-0 bottom-20 z-20 flex justify-center px-4 md:bottom-6">
              <FinishedPrompt onFinish={markFinished} onDismiss={() => setFinishedPromptDismissed(true)} />
            </div>
          )}

          <MobileReaderBar
            format="epub"
            currentPage={currentPage}
            numPages={numLocations}
            isBookmarked={!!bookmarkHere}
            readingMode={readingMode}
            isFullscreen={isFullscreen}
            isFinished={book.status === "finished"}
            {...toolbarActions}
          />
        </div>

        {isDesktop && sidebarOpen && (
          <div className="w-[300px] shrink-0 overflow-hidden border-l border-border/70 lg:w-[340px]">
            <ReaderSidebar {...sidebarProps} />
          </div>
        )}
      </div>

      {!isDesktop && (
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="bottom" className="h-[78svh] gap-0 p-0" showCloseButton>
            <SheetTitle className="sr-only">Reader panel</SheetTitle>
            <ReaderSidebar {...sidebarProps} />
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
