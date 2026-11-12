"use client";

import { BookCard } from "./book-card";
import type { Book } from "@/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface BookGridProps {
  books: Book[];
  onOpen: (book: Book) => void;
  onRemove?: (book: Book) => void;
  className?: string;
}

/** Responsive shelf grid: 2 on mobile, 3–4 on tablet, 5–7 on desktop. */
export function BookGrid({ books, onOpen, onRemove, className }: BookGridProps) {
  return (
    <ul
      className={cn(
        "grid gap-x-5 gap-y-8 sm:gap-x-6 sm:gap-y-10",
        "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7",
        className,
      )}
    >
      {books.map((book, i) => (
        <li key={book.id} className="group/book relative animate-shelf-in" style={{ animationDelay: `${Math.min(i, 14) * 22}ms` }}>
          <BookCard book={book} onOpen={onOpen} />
          {onRemove && (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              aria-label={`Remove ${book.title} from this collection`}
              title="Remove from collection"
              className="absolute right-2 top-2 z-10 size-8 rounded-full opacity-100 shadow-sm sm:opacity-0 sm:transition-opacity sm:group-hover/book:opacity-100 sm:group-focus-within/book:opacity-100"
              onClick={() => onRemove(book)}
            >
              <X aria-hidden className="size-4" />
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
