"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark, BookmarkPlus, List, Loader2, Pencil, Search, StickyNote, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { Bookmark as BookmarkType, Note } from "@/types";
import type { TocEntry } from "@/lib/pdf/outline";
import type { SearchMatch } from "@/lib/pdf/search";
import { formatRelative } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import type { SidebarTab } from "./reader-types";

export interface ReaderSidebarProps {
  tab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  onClose: () => void;
  currentPage: number;
  goToPage: (page: number) => void;
  /** "Page" for PDFs, "Location" for EPUBs. */
  unit?: string;
  /** Optional precise jumps (EPUB CFIs / hrefs). Fall back to goToPage when absent. */
  onSelectToc?: (entry: TocEntry) => void;
  onSelectBookmark?: (bookmark: BookmarkType) => void;
  onSelectNote?: (note: Note) => void;
  onSelectMatch?: (match: SearchMatch) => void;
  // Contents
  toc: TocEntry[] | null;
  // Bookmarks
  bookmarks: BookmarkType[];
  onAddBookmark: (page: number, label: string) => Promise<void>;
  onRemoveBookmark: (id: string) => Promise<void>;
  // Notes
  notes: Note[];
  onAddNote: (page: number, content: string) => Promise<void>;
  onUpdateNote: (id: string, content: string) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
  // Search
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  searchResults: SearchMatch[];
  searching: boolean;
  searchProgress: { scanned: number; total: number } | null;
  className?: string;
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-10 text-center font-serif text-[15px] italic text-muted-foreground">{children}</p>;
}

export function ReaderSidebar(props: ReaderSidebarProps) {
  const { tab, onTabChange, currentPage, goToPage, className, onSelectToc } = props;
  return (
    <aside className={cn("flex h-full min-h-0 w-full flex-col bg-sidebar text-sidebar-foreground", className)} aria-label="Reader panel">
      <Tabs value={tab} onValueChange={(v) => onTabChange(v as SidebarTab)} className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="border-b border-border/70 px-2 py-2">
          <TabsList className="grid h-8 w-full grid-cols-4 bg-transparent p-0" aria-label="Panels">
            <TabsTrigger value="contents" aria-label="Table of contents" className="h-7 min-w-0 gap-1.5 px-1 text-[12.5px]"><List className="size-3.5 shrink-0" aria-hidden /><span className="hidden truncate xl:inline">Contents</span></TabsTrigger>
            <TabsTrigger value="bookmarks" aria-label="Bookmarks" className="h-7 min-w-0 gap-1.5 px-1 text-[12.5px]"><Bookmark className="size-3.5 shrink-0" aria-hidden /><span className="hidden truncate xl:inline">Bookmarks</span></TabsTrigger>
            <TabsTrigger value="notes" aria-label="Notes" className="h-7 min-w-0 gap-1.5 px-1 text-[12.5px]"><StickyNote className="size-3.5 shrink-0" aria-hidden /><span className="hidden truncate xl:inline">Notes</span></TabsTrigger>
            <TabsTrigger value="search" aria-label="Search" className="h-7 min-w-0 gap-1.5 px-1 text-[12.5px]"><Search className="size-3.5 shrink-0" aria-hidden /><span className="hidden truncate xl:inline">Search</span></TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="contents" className="min-h-0 flex-1 overflow-y-auto scroll-thin">
          <ContentsPanel toc={props.toc} currentPage={currentPage} goToPage={goToPage} onSelectToc={onSelectToc} />
        </TabsContent>
        <TabsContent value="bookmarks" className="min-h-0 flex-1 overflow-y-auto scroll-thin">
          <BookmarksPanel {...props} />
        </TabsContent>
        <TabsContent value="notes" className="min-h-0 flex-1 overflow-y-auto scroll-thin">
          <NotesPanel {...props} />
        </TabsContent>
        <TabsContent value="search" className="flex min-h-0 flex-1 flex-col">
          <SearchPanel {...props} />
        </TabsContent>
      </Tabs>
    </aside>
  );
}

function ContentsPanel({ toc, currentPage, goToPage, onSelectToc }: { toc: TocEntry[] | null; currentPage: number; goToPage: (p: number) => void; onSelectToc?: (e: TocEntry) => void }) {
  if (toc === null) return <EmptyHint>Reading the table of contents…</EmptyHint>;
  if (!toc.length) return <EmptyHint>This PDF has no table of contents.</EmptyHint>;
  // Highlight the last entry whose page <= currentPage
  let activeId: string | null = null;
  for (const e of toc) if (e.page !== null && e.page <= currentPage) activeId = e.id;
  return (
    <nav aria-label="Table of contents" className="py-2">
      <ul>
        {toc.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              disabled={entry.page === null && !onSelectToc}
              onClick={() => (onSelectToc ? onSelectToc(entry) : entry.page !== null && goToPage(entry.page))}
              aria-current={entry.id === activeId ? "location" : undefined}
              className={cn(
                "flex w-full items-baseline gap-3 px-4 py-1.5 text-left text-[13.5px] transition-colors hover:bg-foreground/[0.04] disabled:opacity-50 outline-none focus-visible:bg-foreground/[0.06]",
                entry.id === activeId && "text-brass",
              )}
              style={{ paddingLeft: 16 + entry.depth * 14 }}
            >
              <span className="min-w-0 flex-1 truncate">{entry.title}</span>
              {entry.page !== null && <span className="shrink-0 text-[11.5px] tabular-nums text-muted-foreground">{entry.page}</span>}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function BookmarksPanel({ bookmarks, currentPage, goToPage, onAddBookmark, onRemoveBookmark, onSelectBookmark, unit = "Page" }: ReaderSidebarProps) {
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const onThisPage = bookmarks.some((b) => b.page === currentPage);

  const add = async () => {
    setAdding(true);
    try {
      await onAddBookmark(currentPage, label);
      setLabel("");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="py-3">
      <form
        className="flex items-center gap-2 px-3 pb-3"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={onThisPage ? `${unit} ${currentPage} is bookmarked` : `Label for ${unit.toLowerCase()} ${currentPage} (optional)`}
          aria-label="Bookmark label"
          className="h-8 text-[13px]"
          disabled={onThisPage}
        />
        <Button type="submit" size="sm" variant="secondary" disabled={adding || onThisPage} aria-label={`Bookmark ${unit.toLowerCase()} ${currentPage}`}>
          <BookmarkPlus aria-hidden data-icon="inline-start" /> Add
        </Button>
      </form>
      {bookmarks.length === 0 ? (
        <EmptyHint>No bookmarks yet. Mark a page to find your way back.</EmptyHint>
      ) : (
        <ul>
          {bookmarks.map((b) => (
            <li key={b.id} className="group/bm flex items-center gap-1 pr-2">
              <button
                type="button"
                onClick={() => (onSelectBookmark ? onSelectBookmark(b) : goToPage(b.page))}
                className={cn(
                  "flex min-w-0 flex-1 items-baseline gap-3 px-4 py-2 text-left transition-colors hover:bg-foreground/[0.04] outline-none focus-visible:bg-foreground/[0.06]",
                  b.page === currentPage && "text-brass",
                )}
              >
                <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">{unit} {b.page}</span>
                <span className="min-w-0 flex-1 truncate text-[13.5px]">{b.label || <span className="italic text-muted-foreground">No label</span>}</span>
              </button>
              <Button variant="ghost" size="icon-xs" aria-label={`Remove bookmark on ${unit.toLowerCase()} ${b.page}`} onClick={() => onRemoveBookmark(b.id)} className="text-muted-foreground opacity-0 transition-opacity group-hover/bm:opacity-100 focus-visible:opacity-100">
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NotesPanel({ notes, currentPage, goToPage, onAddNote, onUpdateNote, onDeleteNote, onSelectNote, unit = "Page" }: ReaderSidebarProps) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const save = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await onAddNote(currentPage, draft);
      setDraft("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="py-3">
      <form
        className="space-y-2 px-3 pb-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`A note for ${unit.toLowerCase()} ${currentPage}…`}
          aria-label={`Note for ${unit.toLowerCase()} ${currentPage}`}
          rows={3}
          className="resize-none text-[13.5px]"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void save();
          }}
        />
        <div className="flex items-center justify-between">
          <span className="text-[11.5px] text-muted-foreground">⌘↵ to save</span>
          <Button type="submit" size="sm" variant="secondary" disabled={saving || !draft.trim()}>
            Save note
          </Button>
        </div>
      </form>
      {notes.length === 0 ? (
        <EmptyHint>No notes yet. Keep your thoughts next to the page.</EmptyHint>
      ) : (
        <ul className="space-y-1 px-2">
          {notes.map((n) => (
            <li key={n.id} className={cn("group/note rounded-lg px-2 py-2 transition-colors hover:bg-foreground/[0.03]", n.page === currentPage && "bg-brass/[0.07]")}>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => (onSelectNote ? onSelectNote(n) : goToPage(n.page))} className="text-[12px] font-medium tabular-nums text-brass hover:underline outline-none focus-visible:underline">
                  {unit} {n.page}
                </button>
                <span className="text-[11px] text-muted-foreground">{formatRelative(n.updatedAt)}</span>
                <div className="ml-auto flex opacity-0 transition-opacity group-hover/note:opacity-100 focus-within:opacity-100">
                  <Button variant="ghost" size="icon-xs" aria-label="Edit note" onClick={() => { setEditingId(n.id); setEditDraft(n.content); }}>
                    <Pencil aria-hidden />
                  </Button>
                  <Button variant="ghost" size="icon-xs" aria-label="Delete note" className="text-muted-foreground" onClick={() => onDeleteNote(n.id)}>
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </div>
              {editingId === n.id ? (
                <form
                  className="mt-1.5 space-y-1.5"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await onUpdateNote(n.id, editDraft);
                    setEditingId(null);
                  }}
                >
                  <Textarea value={editDraft} onChange={(e) => setEditDraft(e.target.value)} rows={3} autoFocus className="resize-none text-[13.5px]" aria-label="Edit note" />
                  <div className="flex justify-end gap-1">
                    <Button type="button" size="xs" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                    <Button type="submit" size="xs" disabled={!editDraft.trim()}>Save</Button>
                  </div>
                </form>
              ) : (
                <p className="mt-1 whitespace-pre-wrap font-serif text-[14px] leading-relaxed">{n.content}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SearchPanel({ searchQuery, onSearchQueryChange, searchResults, searching, searchProgress, goToPage, currentPage, onSelectMatch, unit = "Page" }: ReaderSidebarProps) {
  const jump = (m: SearchMatch) => (onSelectMatch ? onSelectMatch(m) : goToPage(m.page));
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(searchQuery);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounce typing → query
  useEffect(() => {
    const t = setTimeout(() => {
      if (draft.trim() !== searchQuery) onSearchQueryChange(draft.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [draft, searchQuery, onSearchQueryChange]);

  const byPage = new Map<number, SearchMatch[]>();
  for (const m of searchResults) byPage.set(m.page, [...(byPage.get(m.page) ?? []), m]);

  return (
    <>
      <div className="border-b border-border/70 px-3 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            ref={inputRef}
            id="reader-search-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Search this book"
            aria-label="Search text in this book"
            className="h-8 pl-8 pr-8 text-[13.5px]"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSearchQueryChange(draft.trim());
                const next = searchResults.find((m) => m.page > currentPage) ?? searchResults[0];
                if (next) jump(next);
              }
            }}
          />
          {draft && (
            <button type="button" onClick={() => { setDraft(""); onSearchQueryChange(""); inputRef.current?.focus(); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Clear search">
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-muted-foreground" role="status" aria-live="polite">
          {searching && <Loader2 className="size-3 animate-spin" aria-hidden />}
          {searchQuery
            ? searching && searchProgress
              ? `Searching… ${searchProgress.scanned}/${searchProgress.total} ${unit === "Page" ? "pages" : "chapters"} · ${searchResults.length} so far`
              : `${searchResults.length}${searchResults.length >= 300 ? "+" : ""} ${searchResults.length === 1 ? "match" : "matches"} in ${byPage.size} ${unit === "Page" ? (byPage.size === 1 ? "page" : "pages") : byPage.size === 1 ? "location" : "locations"}`
            : "Matches are highlighted on the page."}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
        {searchQuery && !searching && searchResults.length === 0 ? (
          <EmptyHint>No matches for “{searchQuery}”.</EmptyHint>
        ) : (
          <ul className="py-1">
            {Array.from(byPage.entries()).map(([page, matches]) => (
              <li key={page}>
                <p className="px-4 pb-0.5 pt-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{unit} {page}</p>
                {matches.slice(0, 5).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => jump(m)}
                    className={cn("block w-full px-4 py-1.5 text-left text-[13px] leading-snug text-foreground/85 transition-colors hover:bg-foreground/[0.04] outline-none focus-visible:bg-foreground/[0.06]", page === currentPage && "border-l-2 border-brass")}
                  >
                    <span className="text-muted-foreground">…{m.before}</span>
                    <mark className="rounded-[2px] bg-brass/30 px-0.5 text-foreground">{m.match}</mark>
                    <span className="text-muted-foreground">{m.after}…</span>
                  </button>
                ))}
                {matches.length > 5 && <p className="px-4 py-1 text-[11.5px] text-muted-foreground">+{matches.length - 5} more here</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
