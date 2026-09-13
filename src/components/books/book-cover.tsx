"use client";

import { cn } from "@/lib/utils";
import { paletteFor } from "@/lib/utils/cover-palette";
import { useCoverUrl } from "@/hooks/use-cover-url";
import type { Book } from "@/types";

interface BookCoverProps {
  book: Pick<Book, "id" | "title" | "author" | "coverId"> & { updatedAt?: string };
  className?: string;
  /** Override the stored cover with a transient preview blob URL. */
  previewUrl?: string | null;
}

/**
 * The cover is the hero of every card. If the book has a stored thumbnail we
 * show it; otherwise we render a quiet typographic "cloth binding" so the shelf
 * still reads as a shelf of books.
 */
export function BookCover({ book, className, previewUrl }: BookCoverProps) {
  const storedUrl = useCoverUrl(book.coverId, book.updatedAt);
  const url = previewUrl ?? storedUrl;
  const palette = paletteFor(book.title + book.author);

  return (
    <div
      className={cn("book-cover aspect-[2/3] w-full bg-muted", className)}
      style={{ containerType: "inline-size", ...(!url ? { background: palette.bg, color: palette.fg } : {}) }}
      aria-hidden
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="flex h-full w-full flex-col justify-between p-[9%] font-serif">
          <div className="h-px w-1/3 opacity-70" style={{ background: palette.accent }} />
          <div className="min-h-0 flex-1 flex flex-col justify-center gap-[6cqw]">
            <p className="text-balance font-medium leading-[1.12] tracking-tight text-[clamp(0.7rem,9cqw,1.6rem)]">
              {book.title}
            </p>
            {book.author && (
              <p className="text-[clamp(0.55rem,5.5cqw,1rem)] italic opacity-80 leading-tight">{book.author}</p>
            )}
          </div>
          <div className="flex items-center justify-between opacity-60">
            <div className="h-px w-1/4" style={{ background: palette.accent }} />
            <span className="text-[clamp(0.45rem,4cqw,0.6rem)] tracking-[0.2em] uppercase font-sans">Shelf</span>
          </div>
        </div>
      )}
    </div>
  );
}
