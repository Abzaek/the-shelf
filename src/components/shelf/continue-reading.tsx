"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BookCover } from "@/components/books/book-cover";
import { ProgressBar } from "@/components/books/progress-bar";
import { Button } from "@/components/ui/button";
import type { Book } from "@/types";
import { positionLabel } from "@/lib/utils/book-format";

interface ContinueReadingProps {
  books: Book[];
  onOpenDetails: (book: Book) => void;
}

export function ContinueReading({ books, onOpenDetails }: ContinueReadingProps) {
  if (!books.length) return null;
  const visible = books.slice(0, 4);

  return (
    <section aria-labelledby="continue-reading-heading" className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 id="continue-reading-heading" className="font-serif text-[20px] font-medium tracking-tight">
          Continue Reading
        </h2>
        {books.length > visible.length && (
          <Link href="/reading" className="text-[13px] text-muted-foreground hover:text-foreground">
            All {books.length} in progress
          </Link>
        )}
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {visible.map((book) => (
          <li
            key={book.id}
            className="group/card flex gap-4 rounded-xl border border-border/70 bg-card/60 p-3.5 transition-colors hover:bg-card"
          >
            <button
              type="button"
              onClick={() => onOpenDetails(book)}
              className="w-[68px] shrink-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Details for ${book.title}`}
            >
              <BookCover book={book} />
            </button>
            <div className="flex min-w-0 flex-1 flex-col">
              <h3 className="line-clamp-2 font-serif text-[15.5px] font-medium leading-snug tracking-tight">{book.title}</h3>
              <p className="mt-0.5 line-clamp-1 text-[13px] text-muted-foreground">{book.author}</p>
              <div className="mt-auto space-y-2 pt-3">
                <div className="flex items-center justify-between text-[12px] text-muted-foreground">
                  <span className="tabular-nums">{positionLabel(book)}</span>
                  <span className="tabular-nums text-brass">{book.progress}%</span>
                </div>
                <ProgressBar value={book.progress} />
                <Button asChild size="sm" variant="secondary" className="w-full justify-between">
                  <Link href={`/read/${book.id}`} aria-label={`Continue reading ${book.title}`}>
                    Continue
                    <ArrowRight aria-hidden data-icon="inline-end" />
                  </Link>
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
