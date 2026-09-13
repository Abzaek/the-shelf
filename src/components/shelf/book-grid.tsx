"use client";

import { BookCard } from "./book-card";
import type { Book } from "@/types";
import { cn } from "@/lib/utils";

interface BookGridProps {
  books: Book[];
  onOpen: (book: Book) => void;
  className?: string;
}

/** Responsive shelf grid: 2 on mobile, 3–4 on tablet, 5–7 on desktop. */
export function BookGrid({ books, onOpen, className }: BookGridProps) {
  return (
    <ul
      className={cn(
        "grid gap-x-5 gap-y-8 sm:gap-x-6 sm:gap-y-10",
        "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7",
        className,
      )}
    >
      {books.map((book, i) => (
        <li key={book.id} className="animate-shelf-in" style={{ animationDelay: `${Math.min(i, 14) * 22}ms` }}>
          <BookCard book={book} onOpen={onOpen} />
        </li>
      ))}
    </ul>
  );
}
