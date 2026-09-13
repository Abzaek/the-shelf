"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useLibrary } from "@/components/library-provider";
import { useBooks, filterBooksByStatus } from "@/hooks/use-books";
import type { Book, ReadingStatus } from "@/types";
import { BookGrid } from "./book-grid";
import { ContinueReading } from "./continue-reading";
import { EmptyShelf } from "./empty-shelf";
import { LibraryStatsRow } from "./library-stats";
import { RecentlyAdded } from "./recently-added";
import { ShelfSkeleton } from "./shelf-skeleton";

interface ShelfPageProps {
  filter: ReadingStatus | "all";
  title: string;
  /** Whether to show the Continue Reading / Recently Added sections. */
  showFeatured?: boolean;
}

export function ShelfPage({ filter, title, showFeatured = false }: ShelfPageProps) {
  const { books, stats, continueReading, recentlyAdded, loading, error } = useBooks();
  const { openBook, setAddBookOpen } = useLibrary();
  const router = useRouter();

  const visible = useMemo(() => filterBooksByStatus(books, filter), [books, filter]);
  const openDetails = (book: Book) => openBook(book.id);

  if (error) {
    return (
      <div className="py-20 text-center">
        <p className="font-serif text-xl">The shelf could not be opened.</p>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      <LibraryStatsRow
        stats={stats}
        title={title}
        subtitle={filter === "all" ? undefined : `${visible.length} ${visible.length === 1 ? "book" : "books"}`}
      />

      {loading ? (
        <ShelfSkeleton />
      ) : books.length === 0 ? (
        <EmptyShelf onAdd={() => setAddBookOpen(true)} />
      ) : (
        <>
          {showFeatured && <ContinueReading books={continueReading} onOpenDetails={openDetails} />}
          {showFeatured && recentlyAdded.length > 0 && books.length > 4 && (
            <RecentlyAdded books={recentlyAdded} onOpen={openDetails} />
          )}
          <section aria-labelledby="all-books-heading" className="space-y-5">
            {showFeatured && (
              <h2 id="all-books-heading" className="font-serif text-[20px] font-medium tracking-tight">
                All Books
              </h2>
            )}
            {visible.length ? (
              <BookGrid books={visible} onOpen={openDetails} />
            ) : (
              <p className="py-16 text-center font-serif text-lg italic text-muted-foreground">
                Nothing here yet.{" "}
                {filter === "reading" && (
                  <button type="button" className="not-italic underline-offset-4 hover:underline" onClick={() => router.push("/")}>
                    Pick a book to start reading.
                  </button>
                )}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
