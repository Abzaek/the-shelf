import { FORMAT_ACCEPT, type Book, type BookFormat } from "@/types";

/** Detects the book format from a picked file, or null when unsupported. */
export function detectFormat(file: File): BookFormat | null {
  const name = file.name.toLowerCase();
  for (const [format, { mime, ext }] of Object.entries(FORMAT_ACCEPT) as [BookFormat, { mime: string[]; ext: string }][]) {
    if (mime.includes(file.type) || name.endsWith(ext)) return format;
  }
  return null;
}

/** `accept` attribute for file inputs. */
export const BOOK_FILE_ACCEPT = Object.values(FORMAT_ACCEPT)
  .flatMap(({ mime, ext }) => [...mime, ext])
  .join(",");

/** Human label for the reader position, e.g. "Page 45 / 64" or "Location 120 / 900". */
export function positionLabel(book: Pick<Book, "format" | "currentPage" | "totalPages">): string {
  if (!book.totalPages) return book.format === "epub" ? "Not opened yet" : "";
  const unit = book.format === "epub" ? "Location" : "Page";
  return `${unit} ${book.currentPage} / ${book.totalPages}`;
}

/** Unit word for counts, e.g. "64 pages" / "900 locations". */
export function lengthLabel(book: Pick<Book, "format" | "totalPages">): string {
  if (!book.totalPages) return book.format === "epub" ? "length known after first open" : "0 pages";
  const unit = book.format === "epub" ? "location" : "page";
  return `${book.totalPages} ${unit}${book.totalPages === 1 ? "" : "s"}`;
}
