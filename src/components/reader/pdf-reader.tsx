"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Document } from "react-pdf";
import { toast } from "sonner";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useBookmarks } from "@/hooks/use-bookmarks";
import { useNotes } from "@/hooks/use-notes";
import { useReadingProgress } from "@/hooks/use-reading-progress";
import { useMediaQuery } from "@/hooks/use-media-query";
import { ensurePdfWorker, type PDFDocumentProxy } from "@/lib/pdf/pdfjs";
import { getTableOfContents, type TocEntry } from "@/lib/pdf/outline";
import { searchPdfText, type SearchMatch } from "@/lib/pdf/search";
import { storage } from "@/lib/storage";
import { clamp } from "@/lib/utils/format";
import type { Book, ReadingMode, Settings } from "@/types";
import { ContinuousView, SinglePageView } from "./page-views";
import { FinishedPrompt } from "./finished-prompt";
import { ReaderLoading } from "./reader-loading";
import { ReaderSidebar } from "./reader-sidebar";
import { MobileReaderBar, ReaderToolbar } from "./reader-toolbar";
import { CSS_UNITS, MAX_SCALE, MIN_SCALE, ZOOM_STEP, type SidebarTab, type ZoomState } from "./reader-types";

ensurePdfWorker();

interface PdfReaderProps {
  book: Book;
  file: Blob;
  settings: Settings;
}

function initialZoom(settings: Settings): ZoomState {
  if (settings.defaultZoom === "fit-width" || settings.defaultZoom === "fit-page") return { mode: settings.defaultZoom };
  return { mode: "custom", scale: settings.defaultZoom };
}

export function PdfReader({ book, file, settings }: PdfReaderProps) {
  const router = useRouter();
  const isDesktop = useMediaQuery("(min-width: 768px)", true);
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Document state
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(book.totalPages || 0);
  const [pageDims, setPageDims] = useState<{ width: number; height: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Navigation
  const startPage = settings.rememberLastPage && book.status !== "finished" ? book.currentPage : 1;
  const [currentPage, setCurrentPage] = useState(() => Math.max(1, startPage));
  const [zoom, setZoom] = useState<ZoomState>(() => initialZoom(settings));
  const [readingMode, setReadingMode] = useState<ReadingMode>(settings.defaultReadingMode);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  // Panels
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("contents");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [toc, setToc] = useState<TocEntry[] | null>(null);
  const [finishedPromptDismissed, setFinishedPromptDismissed] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState<{ scanned: number; total: number } | null>(null);
  const searchAbort = useRef<AbortController | null>(null);

  const { bookmarks, addBookmark, removeBookmark, isBookmarked } = useBookmarks(book.id);
  const { notes, addNote, updateNote, deleteNote } = useNotes(book.id);
  const { saveProgress } = useReadingProgress(book.id);

  const fileMemo = useMemo(() => file, [file]);

  // ------------------------------------------------------------ viewport
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setViewport((v) => (Math.abs(v.width - width) < 1 && Math.abs(v.height - height) < 1 ? v : { width, height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pageWidth = useMemo(() => {
    if (!viewport.width) return 0;
    const padX = isDesktop ? 48 : 16;
    const padY = isDesktop ? 48 : 32;
    const available = Math.max(200, viewport.width - padX);
    const ratio = pageDims ? pageDims.height / pageDims.width : 1.4;
    if (zoom.mode === "fit-width") return Math.min(available, 1100);
    if (zoom.mode === "fit-page") return Math.min(available, Math.max(200, (viewport.height - padY) / ratio));
    const base = (pageDims?.width ?? 612) * CSS_UNITS;
    return Math.round(base * zoom.scale);
  }, [viewport, zoom, pageDims, isDesktop]);

  const zoomPercent = useMemo(() => {
    const base = (pageDims?.width ?? 612) * CSS_UNITS;
    return pageWidth ? Math.round((pageWidth / base) * 100) : 100;
  }, [pageWidth, pageDims]);

  const currentScale = useMemo(() => {
    const base = (pageDims?.width ?? 612) * CSS_UNITS;
    return pageWidth / base || 1;
  }, [pageWidth, pageDims]);

  const zoomBy = useCallback(
    (factor: number) => setZoom({ mode: "custom", scale: clamp(currentScale * factor, MIN_SCALE, MAX_SCALE) }),
    [currentScale],
  );

  // ------------------------------------------------------------ navigation
  const goToPage = useCallback(
    (page: number) => {
      setCurrentPage((p) => {
        const next = clamp(Math.round(page), 1, Math.max(1, numPages || p));
        return next === p ? p : next;
      });
    },
    [numPages],
  );

  /** Relative navigation that is safe under rapid repeated key presses. */
  const stepPage = useCallback(
    (delta: number) => {
      setCurrentPage((p) => clamp(p + delta, 1, Math.max(1, numPages || p)));
    },
    [numPages],
  );

  // Persist progress whenever the page changes (after the document is known).
  useEffect(() => {
    if (!numPages) return;
    saveProgress(currentPage, numPages);
  }, [currentPage, numPages, saveProgress]);

  // ------------------------------------------------------------ document
  const onLoadSuccess = useCallback(
    async (doc: PDFDocumentProxy) => {
      setPdf(doc);
      setNumPages(doc.numPages);
      setLoadError(null);
      try {
        const first = await doc.getPage(1);
        const vp = first.getViewport({ scale: 1 });
        setPageDims({ width: vp.width, height: vp.height });
      } catch {
        setPageDims(null);
      }
      getTableOfContents(doc).then(setToc).catch(() => setToc([]));
      if (book.totalPages !== doc.numPages) {
        void storage.updateBook(book.id, { totalPages: doc.numPages });
      }
    },
    [book.id, book.totalPages],
  );

  const onLoadError = useCallback((err: Error) => {
    setLoadError(/password/i.test(err.message) ? "This PDF is password-protected." : err.message || "The PDF could not be opened.");
  }, []);

  // ------------------------------------------------------------ search
  const runSearch = useCallback(
    (query: string) => {
      searchAbort.current?.abort();
      setSearchQuery(query);
      if (!pdf || !query) {
        setSearchResults([]);
        setSearching(false);
        setSearchProgress(null);
        return;
      }
      const controller = new AbortController();
      searchAbort.current = controller;
      setSearching(true);
      setSearchProgress({ scanned: 0, total: pdf.numPages });
      searchPdfText(pdf, query, {
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
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    },
    [pdf],
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

  const toggleBookmark = useCallback(async () => {
    const existing = bookmarks.find((b) => b.page === currentPage);
    if (existing) await removeBookmark(existing.id);
    else await addBookmark(currentPage);
  }, [bookmarks, currentPage, addBookmark, removeBookmark]);

  const markFinished = useCallback(async () => {
    await storage.updateBook(book.id, { status: "finished" });
    toast.success("Marked as finished", { description: book.title });
    router.push("/finished");
  }, [book.id, book.title, router]);

  // ------------------------------------------------------------ keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
        setZoom({ mode: "fit-width" });
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
          e.preventDefault();
          stepPage(1);
          break;
        case " ":
          if (readingMode === "single") {
            e.preventDefault();
            stepPage(e.shiftKey ? -1 : 1);
          }
          break;
        case "Home":
          e.preventDefault();
          goToPage(1);
          break;
        case "End":
          e.preventDefault();
          goToPage(numPages);
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
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [numPages, goToPage, stepPage, zoomBy, openSearch, sidebarOpen, readingMode, toggleBookmark, toggleFullscreen]);

  // ------------------------------------------------------------ render
  const showFinishedPrompt = numPages > 0 && currentPage === numPages && book.status !== "finished" && !finishedPromptDismissed;
  const aspect = pageDims ? pageDims.height / pageDims.width : 1.4;

  const sidebarProps = {
    tab: sidebarTab,
    onTabChange: setSidebarTab,
    onClose: () => setSidebarOpen(false),
    currentPage,
    goToPage: (p: number) => {
      goToPage(p);
      if (!isDesktop) setSidebarOpen(false);
    },
    toc,
    bookmarks,
    onAddBookmark: async (page: number, label: string) => {
      await addBookmark(page, label);
    },
    onRemoveBookmark: removeBookmark,
    notes,
    onAddNote: async (page: number, content: string) => {
      await addNote(page, content);
    },
    onUpdateNote: async (id: string, content: string) => {
      await updateNote(id, content);
    },
    onDeleteNote: deleteNote,
    searchQuery,
    onSearchQueryChange: runSearch,
    searchResults,
    searching,
    searchProgress,
  };

  const toolbarActions = {
    onPageChange: goToPage,
    onStep: stepPage,
    onZoomIn: () => zoomBy(ZOOM_STEP),
    onZoomOut: () => zoomBy(1 / ZOOM_STEP),
    onZoomPreset: setZoom,
    onReadingMode: setReadingMode,
    onToggleSidebar: toggleSidebar,
    onToggleFullscreen: toggleFullscreen,
    onToggleBookmark: toggleBookmark,
    onMarkFinished: markFinished,
  };

  return (
    <div ref={rootRef} className="flex h-svh w-full flex-col overflow-hidden bg-background text-foreground">
      <ReaderToolbar
        title={book.title}
        format="pdf"
        currentPage={currentPage}
        numPages={numPages}
        zoomPercent={zoomPercent}
        zoom={zoom}
        readingMode={readingMode}
        sidebarOpen={sidebarOpen}
        isFullscreen={isFullscreen}
        isBookmarked={isBookmarked(currentPage)}
        isFinished={book.status === "finished"}
        {...toolbarActions}
      />

      <div className="relative flex min-h-0 flex-1">
        <div ref={viewportRef} className="relative min-w-0 flex-1 bg-[color-mix(in_oklch,var(--background),var(--foreground)_3%)]">
          <Document
            file={fileMemo}
            onLoadSuccess={onLoadSuccess}
            onLoadError={onLoadError}
            onItemClick={({ pageNumber }) => pageNumber && goToPage(pageNumber)}
            externalLinkTarget="_blank"
            loading={<ReaderLoading title={book.title} />}
            error={
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <p className="font-serif text-[22px] font-medium">This book can’t be opened.</p>
                <p className="mt-2 max-w-sm text-sm text-muted-foreground">{loadError ?? "The PDF could not be read."}</p>
                <Button variant="outline" className="mt-6" onClick={() => router.push("/")}>Back to Shelf</Button>
              </div>
            }
            className="h-full"
          >
            {pageWidth > 0 && numPages > 0 && (
              readingMode === "single" ? (
                <SinglePageView
                  numPages={numPages}
                  currentPage={currentPage}
                  pageWidth={pageWidth}
                  aspect={aspect}
                  searchQuery={searchQuery}
                  onPageChange={goToPage}
                />
              ) : (
                <ContinuousView
                  numPages={numPages}
                  currentPage={currentPage}
                  pageWidth={pageWidth}
                  aspect={aspect}
                  searchQuery={searchQuery}
                  onPageChange={setCurrentPage}
                />
              )
            )}
          </Document>

          {/* Live region for screen readers */}
          <p className="sr-only" role="status" aria-live="polite">
            Page {currentPage} of {numPages}
          </p>

          {showFinishedPrompt && (
            <div className="pointer-events-none absolute inset-x-0 bottom-20 z-20 flex justify-center px-4 md:bottom-6">
              <FinishedPrompt onFinish={markFinished} onDismiss={() => setFinishedPromptDismissed(true)} />
            </div>
          )}

          <MobileReaderBar
            format="pdf"
            currentPage={currentPage}
            numPages={numPages}
            isBookmarked={isBookmarked(currentPage)}
            readingMode={readingMode}
            isFullscreen={isFullscreen}
            isFinished={book.status === "finished"}
            {...toolbarActions}
          />
        </div>

        {/* Desktop sidebar */}
        {isDesktop && sidebarOpen && (
          <div className="w-[300px] shrink-0 overflow-hidden border-l border-border/70 lg:w-[340px]">
            <ReaderSidebar {...sidebarProps} />
          </div>
        )}
      </div>

      {/* Mobile sidebar as a sheet */}
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
