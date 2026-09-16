"use client";

import { BookDownload } from "@/components/offline/book-download";
import { useState } from "react";
import Link from "next/link";
import { BookOpen, Bookmark, Check, ChevronDown, Library, Pencil, StickyNote, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { useLibrary } from "@/components/library-provider";
import { useBook } from "@/hooks/use-books";
import { useBookmarks } from "@/hooks/use-bookmarks";
import { useNotes } from "@/hooks/use-notes";
import { storage } from "@/lib/storage";
import { formatDate, formatRelative } from "@/lib/utils/format";
import { lengthLabel } from "@/lib/utils/book-format";
import { FORMAT_LABELS, READING_STATUSES, STATUS_LABELS, type ReadingStatus } from "@/types";
import { BookCover } from "./book-cover";
import { DeleteBookDialog } from "./delete-book-dialog";
import { ProgressBar } from "./progress-bar";
import { StatusBadge } from "./status-badge";
import { CreateCollectionDialog } from "@/components/collections/create-collection-dialog";

export function BookDetailsDialog() {
  const { selectedBookId, openBook, setEditBookId, collections } = useLibrary();
  const book = useBook(selectedBookId);
  const { bookmarks } = useBookmarks(book?.id);
  const { notes } = useNotes(book?.id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);

  const close = () => openBook(null);

  const setStatus = async (status: ReadingStatus) => {
    if (!book || status === book.status) return;
    await storage.updateBook(book.id, { status });
    toast.success(status === "finished" ? "Marked as finished" : `Moved to ${STATUS_LABELS[status]}`);
  };

  const remove = async () => {
    if (!book) return;
    const title = book.title;
    setConfirmDelete(false);
    close();
    await storage.deleteBook(book.id);
    toast("Removed from your shelf", { description: title });
  };

  const toggleCollection = async (collectionId: string, checked: boolean) => {
    if (!book) return;
    const current = collections.filter((c) => c.bookIds.includes(book.id)).map((c) => c.id);
    const next = checked ? [...current, collectionId] : current.filter((id) => id !== collectionId);
    await storage.setBookCollections(book.id, next);
  };

  const inCollections = book ? collections.filter((c) => c.bookIds.includes(book.id)) : [];
  const hasStarted = !!book && (book.currentPage > 1 || book.status === "reading" || book.status === "paused");
  const readLabel = book?.status === "finished" ? "Read Again" : hasStarted ? "Continue Reading" : "Start Reading";
  const pdfMissing = !!book && book.fileSize === 0;

  return (
    <>
      <Dialog open={!!book} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-h-[92svh] overflow-y-auto p-0 sm:max-w-3xl scroll-thin" showCloseButton>
          {book && (
            <div className="grid gap-8 p-6 sm:grid-cols-[220px_1fr] sm:p-8">
              <div className="mx-auto w-[180px] sm:mx-0 sm:w-full">
                <BookCover book={book} className="shadow-2xl" />
              </div>

              <div className="flex min-w-0 flex-col">
                <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
                  <span>{book.category}</span>
                  <span aria-hidden>·</span>
                  <span className="rounded border border-border px-1.5 py-px text-[10.5px] font-medium tracking-wide">{FORMAT_LABELS[book.format]}</span>
                  <span aria-hidden>·</span>
                  <StatusBadge status={book.status} />
                </div>
                <DialogTitle className="mt-2 font-serif text-[28px] font-medium leading-[1.1] tracking-tight sm:text-[32px]">
                  {book.title}
                </DialogTitle>
                <DialogDescription className="mt-1.5 font-serif text-[17px] italic text-muted-foreground">
                  {book.author || "Unknown author"}
                </DialogDescription>

                {/* Progress */}
                <div className="mt-6 space-y-2">
                  <div className="flex items-baseline justify-between text-[13px]">
                    <span className="text-muted-foreground">
                      {book.status === "finished" ? (
                        <>Finished {formatDate(book.finishedAt)}</>
                      ) : hasStarted ? (
                        <>
                          Continue from {book.format === "epub" ? "location" : "page"}{" "}
                          <span className="font-medium text-foreground tabular-nums">{book.currentPage}</span> of{" "}
                          <span className="tabular-nums">{book.totalPages}</span>
                        </>
                      ) : (
                        <>{lengthLabel(book)} · not started</>
                      )}
                    </span>
                    <span className="font-medium tabular-nums text-brass">{book.progress}%</span>
                  </div>
                  <ProgressBar value={book.progress} size="sm" />
                </div>

                <div className="mt-4"><BookDownload book={book} /></div>
                {Object.keys(book.readingPositions ?? {}).length > 1 && <details className="mt-3 text-sm"><summary className="cursor-pointer">Saved positions on your devices</summary>{Object.entries(book.readingPositions ?? {}).map(([device, position]) => <Button key={device} size="sm" variant="ghost" onClick={() => void storage.saveProgress(book.id, position)}>{book.format === "epub" ? "Location" : "Page"} {position.currentPage} · {new Date(position.updatedAt).toLocaleDateString()}</Button>)}</details>}
                {/* Actions */}
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button asChild size="lg" className="px-4" disabled={pdfMissing}>
                    <Link href={pdfMissing ? "#" : `/read/${book.id}`} onClick={() => !pdfMissing && close()} aria-disabled={pdfMissing}>
                      <BookOpen aria-hidden data-icon="inline-start" /> {readLabel}
                    </Link>
                  </Button>
                  {book.status !== "finished" ? (
                    <Button variant="outline" size="lg" onClick={() => setStatus("finished")}>
                      <Check aria-hidden data-icon="inline-start" /> Mark as Finished
                    </Button>
                  ) : (
                    <Button variant="outline" size="lg" onClick={() => setStatus("reading")}>
                      Mark as Reading
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="lg" aria-label="Change status">
                        Status <ChevronDown aria-hidden data-icon="inline-end" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuRadioGroup value={book.status} onValueChange={(v) => setStatus(v as ReadingStatus)}>
                        {READING_STATUSES.map((s) => (
                          <DropdownMenuRadioItem key={s} value={s}>
                            {STATUS_LABELS[s]}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {pdfMissing && (
                  <p className="mt-3 text-[13px] text-destructive">
                    The file for this book is missing. Edit the book to attach it again.
                  </p>
                )}

                {book.description && (
                  <p className="mt-6 whitespace-pre-line text-[15px] leading-relaxed text-foreground/90">{book.description}</p>
                )}

                {book.tags.length > 0 && (
                  <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Tags">
                    {book.tags.map((t) => (
                      <li key={t} className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                        {t}
                      </li>
                    ))}
                  </ul>
                )}

                <Separator className="my-6" />

                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-3">
                  <div>
                    <dt className="text-muted-foreground">Last opened</dt>
                    <dd className="mt-0.5 font-medium">{formatRelative(book.lastOpenedAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{book.format === "epub" ? "Locations read" : "Pages read"}</dt>
                    <dd className="mt-0.5 font-medium tabular-nums">
                      {book.status === "finished" ? book.totalPages : Math.max(0, book.currentPage - 1)} / {book.totalPages || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Added</dt>
                    <dd className="mt-0.5 font-medium">{formatDate(book.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Bookmarks</dt>
                    <dd className="mt-0.5 flex items-center gap-1 font-medium tabular-nums">
                      <Bookmark className="size-3.5 text-muted-foreground" aria-hidden /> {bookmarks.length}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Notes</dt>
                    <dd className="mt-0.5 flex items-center gap-1 font-medium tabular-nums">
                      <StickyNote className="size-3.5 text-muted-foreground" aria-hidden /> {notes.length}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Collections</dt>
                    <dd className="mt-0.5 font-medium">{inCollections.length ? inCollections.map((c) => c.name).join(", ") : "—"}</dd>
                  </div>
                </dl>

                <div className="mt-8 flex flex-wrap items-center gap-1 border-t border-border/70 pt-4">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <Library aria-hidden data-icon="inline-start" /> Collections
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="min-w-52">
                      <DropdownMenuLabel>Add to collection</DropdownMenuLabel>
                      {collections.length === 0 && (
                        <p className="px-2 py-1.5 text-xs text-muted-foreground">No collections yet.</p>
                      )}
                      {collections.map((c) => (
                        <DropdownMenuCheckboxItem
                          key={c.id}
                          checked={c.bookIds.includes(book.id)}
                          onCheckedChange={(checked) => toggleCollection(c.id, !!checked)}
                          onSelect={(e) => e.preventDefault()}
                        >
                          {c.name}
                        </DropdownMenuCheckboxItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setNewCollectionOpen(true)}>New collection…</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button variant="ghost" size="sm" onClick={() => setEditBookId(book.id)}>
                    <Pencil aria-hidden data-icon="inline-start" /> Edit Book
                  </Button>
                  <Button variant="ghost" size="sm" className="ml-auto text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                    <Trash2 aria-hidden data-icon="inline-start" /> Delete Book
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <DeleteBookDialog book={book ?? null} open={confirmDelete} onOpenChange={setConfirmDelete} onConfirm={remove} />
      <CreateCollectionDialog
        open={newCollectionOpen}
        onOpenChange={setNewCollectionOpen}
        onCreated={(c) => book && storage.setBookCollections(book.id, [...inCollections.map((x) => x.id), c.id])}
      />
    </>
  );
}
