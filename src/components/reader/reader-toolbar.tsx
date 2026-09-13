"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  MoreHorizontal,
  PanelRight,
  Search,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ReadingMode } from "@/types";
import type { SidebarTab, ZoomState } from "./reader-types";

export interface ReaderToolbarProps {
  title: string;
  currentPage: number;
  numPages: number;
  zoomPercent: number;
  zoom: ZoomState;
  readingMode: ReadingMode;
  sidebarOpen: boolean;
  isFullscreen: boolean;
  isBookmarked: boolean;
  isFinished: boolean;
  onPageChange: (page: number) => void;
  onStep: (delta: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomPreset: (zoom: ZoomState) => void;
  onReadingMode: (mode: ReadingMode) => void;
  onToggleSidebar: (tab?: SidebarTab) => void;
  onToggleFullscreen: () => void;
  onToggleBookmark: () => void;
  onMarkFinished: () => void;
}

function IconButton({ label, shortcut, onClick, children, className, pressed, disabled }: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  pressed?: boolean;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} aria-pressed={pressed} onClick={onClick} className={className} disabled={disabled}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut && <kbd className="ml-1.5 font-mono text-[10px] opacity-70">{shortcut}</kbd>}
      </TooltipContent>
    </Tooltip>
  );
}

export function PageInput({ currentPage, numPages, onPageChange, compact }: { currentPage: number; numPages: number; onPageChange: (p: number) => void; compact?: boolean }) {
  const [draft, setDraft] = useState(String(currentPage));
  const [seenPage, setSeenPage] = useState(currentPage);
  if (seenPage !== currentPage) {
    // Page changed from outside (keys, TOC, scroll): reflect it in the input.
    setSeenPage(currentPage);
    setDraft(String(currentPage));
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = parseInt(draft, 10);
    if (!Number.isNaN(n)) onPageChange(Math.min(numPages, Math.max(1, n)));
    else setDraft(String(currentPage));
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-1 text-[13px] tabular-nums text-muted-foreground">
      <label htmlFor="reader-page-input" className="sr-only">
        Go to page
      </label>
      <input
        id="reader-page-input"
        type="text"
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
        onBlur={submit}
        onFocus={(e) => e.target.select()}
        className={cn(
          "h-7 rounded-md border border-transparent bg-foreground/[0.05] text-center text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
          compact ? "w-10" : "w-12",
        )}
        aria-describedby="reader-page-total"
      />
      <span id="reader-page-total" className="whitespace-nowrap">
        / {numPages || "…"}
      </span>
    </form>
  );
}

export function ReaderToolbar(props: ReaderToolbarProps) {
  const {
    title, currentPage, numPages, zoomPercent, zoom, readingMode, sidebarOpen, isFullscreen, isBookmarked, isFinished,
    onPageChange, onStep, onZoomIn, onZoomOut, onZoomPreset, onReadingMode, onToggleSidebar, onToggleFullscreen, onToggleBookmark, onMarkFinished,
  } = props;

  const zoomValue = zoom.mode === "custom" ? "custom" : zoom.mode;

  return (
    <header className="z-20 flex h-12 shrink-0 items-center gap-1 border-b border-border/70 bg-background/90 px-2 backdrop-blur-md sm:gap-2 sm:px-3">
      <Button asChild variant="ghost" size="sm" className="shrink-0 text-muted-foreground hover:text-foreground">
        <Link href="/" aria-label="Back to Shelf">
          <ArrowLeft aria-hidden data-icon="inline-start" />
          <span className="hidden sm:inline">Back to Shelf</span>
        </Link>
      </Button>
      <h1 className="min-w-0 flex-1 truncate font-serif text-[14.5px] font-medium tracking-tight sm:text-[15px]" title={title}>
        {title}
      </h1>

      {/* Desktop controls */}
      <div className="hidden items-center gap-0.5 md:flex">
        <IconButton label="Previous page" shortcut="←" onClick={() => onStep(-1)} disabled={currentPage <= 1}>
          <ChevronLeft aria-hidden />
        </IconButton>
        <PageInput currentPage={currentPage} numPages={numPages} onPageChange={onPageChange} />
        <IconButton label="Next page" shortcut="→" onClick={() => onStep(1)} disabled={currentPage >= numPages}>
          <ChevronRight aria-hidden />
        </IconButton>
        <div className="mx-1.5 h-5 w-px bg-border" aria-hidden />
        <IconButton label="Search in book" shortcut="⌘F" onClick={() => onToggleSidebar("search")}>
          <Search aria-hidden />
        </IconButton>
        <div className="mx-1.5 h-5 w-px bg-border" aria-hidden />
        <IconButton label="Zoom out" shortcut="⌘−" onClick={onZoomOut}>
          <ZoomOut aria-hidden />
        </IconButton>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="w-16 tabular-nums text-[12.5px] text-muted-foreground" aria-label={`Zoom ${zoomPercent}%. Choose zoom`}>
              {zoomPercent}%
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup
              value={zoomValue}
              onValueChange={(v) => {
                if (v === "fit-width" || v === "fit-page") onZoomPreset({ mode: v });
              }}
            >
              <DropdownMenuRadioItem value="fit-width">Fit width</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="fit-page">Fit page</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            {[0.75, 1, 1.25, 1.5, 2].map((s) => (
              <DropdownMenuItem key={s} onSelect={() => onZoomPreset({ mode: "custom", scale: s })}>
                {Math.round(s * 100)}%
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <IconButton label="Zoom in" shortcut="⌘+" onClick={onZoomIn}>
          <ZoomIn aria-hidden />
        </IconButton>
        <div className="mx-1.5 h-5 w-px bg-border" aria-hidden />
        <IconButton label={isBookmarked ? "Remove bookmark" : "Bookmark this page"} shortcut="B" onClick={onToggleBookmark} pressed={isBookmarked} className={isBookmarked ? "text-brass" : undefined}>
          {isBookmarked ? <BookmarkCheck aria-hidden /> : <Bookmark aria-hidden />}
        </IconButton>
        <IconButton label={sidebarOpen ? "Hide panel" : "Show panel"} onClick={() => onToggleSidebar()} pressed={sidebarOpen}>
          <PanelRight aria-hidden />
        </IconButton>
        <IconButton label={isFullscreen ? "Exit fullscreen" : "Fullscreen"} shortcut={isFullscreen ? "Esc" : "F"} onClick={onToggleFullscreen}>
          {isFullscreen ? <Minimize aria-hidden /> : <Maximize aria-hidden />}
        </IconButton>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="More options">
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            <DropdownMenuLabel>Reading mode</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={readingMode} onValueChange={(v) => onReadingMode(v as ReadingMode)}>
              <DropdownMenuRadioItem value="single">Single page</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="continuous">Continuous scroll</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onToggleSidebar("contents")}>Table of contents</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onToggleSidebar("bookmarks")}>Bookmarks</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onToggleSidebar("notes")}>Notes</DropdownMenuItem>
            {!isFinished && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onMarkFinished}>
                  <Check aria-hidden /> Mark as Finished
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Mobile: just the page indicator; the rest lives in the floating bar */}
      <div className="md:hidden">
        <PageInput currentPage={currentPage} numPages={numPages} onPageChange={onPageChange} compact />
      </div>
    </header>
  );
}

/** Compact floating toolbar for small screens. */
export function MobileReaderBar(props: Pick<
  ReaderToolbarProps,
  "currentPage" | "numPages" | "onPageChange" | "onStep" | "onToggleSidebar" | "onToggleBookmark" | "isBookmarked" | "onZoomIn" | "onZoomOut" | "onZoomPreset" | "readingMode" | "onReadingMode" | "onToggleFullscreen" | "isFullscreen" | "onMarkFinished" | "isFinished"
>) {
  const { currentPage, numPages, onStep, onToggleSidebar, onToggleBookmark, isBookmarked, onZoomIn, onZoomOut, onZoomPreset, readingMode, onReadingMode, onToggleFullscreen, isFullscreen, onMarkFinished, isFinished } = props;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-border bg-popover/95 p-1 shadow-xl backdrop-blur">
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Previous page" onClick={() => onStep(-1)} disabled={currentPage <= 1}>
          <ChevronLeft aria-hidden />
        </Button>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Next page" onClick={() => onStep(1)} disabled={currentPage >= numPages}>
          <ChevronRight aria-hidden />
        </Button>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Search in book" onClick={() => onToggleSidebar("search")}>
          <Search aria-hidden />
        </Button>
        <Button variant="ghost" size="icon" className={cn("rounded-full", isBookmarked && "text-brass")} aria-label={isBookmarked ? "Remove bookmark" : "Bookmark this page"} aria-pressed={isBookmarked} onClick={onToggleBookmark}>
          {isBookmarked ? <BookmarkCheck aria-hidden /> : <Bookmark aria-hidden />}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full" aria-label="More options">
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="min-w-52">
            <DropdownMenuItem onSelect={onZoomIn}><ZoomIn aria-hidden /> Zoom in</DropdownMenuItem>
            <DropdownMenuItem onSelect={onZoomOut}><ZoomOut aria-hidden /> Zoom out</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onZoomPreset({ mode: "fit-width" })}>Fit width</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onZoomPreset({ mode: "fit-page" })}>Fit page</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={readingMode} onValueChange={(v) => onReadingMode(v as ReadingMode)}>
              <DropdownMenuRadioItem value="single">Single page</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="continuous">Continuous scroll</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onToggleSidebar("contents")}>Table of contents</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onToggleSidebar("bookmarks")}>Bookmarks</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onToggleSidebar("notes")}>Notes</DropdownMenuItem>
            <DropdownMenuItem onSelect={onToggleFullscreen}>{isFullscreen ? <Minimize aria-hidden /> : <Maximize aria-hidden />} {isFullscreen ? "Exit fullscreen" : "Fullscreen"}</DropdownMenuItem>
            {!isFinished && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onMarkFinished}><Check aria-hidden /> Mark as Finished</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
