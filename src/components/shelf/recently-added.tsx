"use client";

import { BookCard } from "./book-card";
import type { Book } from "@/types";

export function RecentlyAdded({ books, onOpen }: { books: Book[]; onOpen: (book: Book) => void }) {
  if (books.length < 2) return null;
  return (
    <section aria-labelledby="recently-added-heading" className="space-y-4">
      <h2 id="recently-added-heading" className="font-serif text-[20px] font-medium tracking-tight">
        Recently Added
      </h2>
      <ul className="-mx-4 flex gap-5 overflow-x-auto px-4 pb-2 scroll-thin sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        {books.slice(0, 8).map((book) => (
          <li key={book.id} className="w-[124px] shrink-0 sm:w-[140px]">
            <BookCard book={book} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </section>
  );
}
