"use client";

import { memo } from "react";
import { BookCover } from "@/components/books/book-cover";
import { ProgressBar } from "@/components/books/progress-bar";
import { STATUS_LABELS, type Book } from "@/types";
import { cn } from "@/lib/utils";

interface BookCardProps {
  book: Book;
  onOpen: (book: Book) => void;
  className?: string;
}

export const BookCard = memo(function BookCard({ book, onOpen, className }: BookCardProps) {
  const showProgress = book.status === "reading" || book.status === "paused";
  return (
    <button
      type="button"
      onClick={() => onOpen(book)}
      className={cn(
        "group/card flex w-full flex-col items-stretch gap-3 rounded-lg text-left outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background",
        className,
      )}
      aria-label={`${book.title} by ${book.author || "unknown author"}. ${STATUS_LABELS[book.status]}${
        showProgress ? `, ${book.progress}% read` : ""
      }. Open details.`}
    >
      <BookCover book={book} />
      <div className="min-w-0 space-y-1 px-0.5">
        <h3 className="line-clamp-2 font-serif text-[15px] font-medium leading-snug tracking-tight text-foreground">
          {book.title}
        </h3>
        <p className="line-clamp-1 text-[13px] text-muted-foreground">{book.author || "Unknown author"}</p>
        <div className="flex items-center gap-2 pt-0.5 text-[11px] text-muted-foreground">
          <span className="truncate">{book.category}</span>
          <span aria-hidden className="text-foreground/30">·</span>
          <span
            className={cn(
              "shrink-0",
              book.status === "reading" && "text-brass",
              book.status === "finished" && "text-emerald-700 dark:text-emerald-300",
            )}
          >
            {book.status === "reading" ? `${book.progress}%` : STATUS_LABELS[book.status]}
          </span>
        </div>
        {showProgress && <ProgressBar value={book.progress} className="mt-1.5" label={`${book.progress}% read`} />}
      </div>
    </button>
  );
});
