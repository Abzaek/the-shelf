import type { BookStorage } from "../bookStorage";
import type { Book, LibraryBackup, LibraryBackupV1, ImportSummary } from "@/types";
/** Restore through the public storage contract. New IDs avoid resurrecting server tombstones. */
export async function importLocalBackup(
  storage: BookStorage,
  backup: LibraryBackup | LibraryBackupV1,
  files: { files: Map<string, Blob>; covers: Map<string, Blob> },
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    booksAdded: 0,
    booksSkipped: 0,
    booksWithoutFile: 0,
    bookmarksAdded: 0,
    notesAdded: 0,
    collectionsAdded: 0,
  };
  const key = (book: { title: string; author: string }) =>
    `${book.title.trim().toLowerCase()}|${book.author.trim().toLowerCase()}`;
  const existing = await storage.getBooks(),
    known = new Map(existing.map((book) => [key(book), book.id])),
    ids = new Map<string, string>();
  for (const raw of backup.books) {
    const legacy = raw as Partial<Book> & { pdfName?: string };
    const match = known.get(key(raw));
    if (match) {
      ids.set(raw.id, match);
      summary.booksSkipped++;
      continue;
    }
    const file = files.files.get(raw.id);
    if (!file) {
      summary.booksWithoutFile++;
      continue;
    }
    const book = await storage.addBook({
      ...raw,
      format: legacy.format ?? "pdf",
      fileName: legacy.fileName ?? legacy.pdfName ?? "book.pdf",
      file,
      cover: files.covers.get(raw.id),
    });
    if (legacy.currentCfi || raw.lastOpenedAt)
      await storage.updateBook(book.id, {
        currentCfi: legacy.currentCfi ?? null,
        lastOpenedAt: raw.lastOpenedAt,
        finishedAt: raw.finishedAt,
      });
    ids.set(raw.id, book.id);
    known.set(key(book), book.id);
    summary.booksAdded++;
    for (const bookmark of backup.bookmarks.filter((item) => item.bookId === raw.id)) {
      await storage.addBookmark(book.id, bookmark.page, bookmark.label, bookmark.cfi);
      summary.bookmarksAdded++;
    }
    for (const note of backup.notes.filter((item) => item.bookId === raw.id)) {
      await storage.addNote(
        book.id,
        note.page,
        [note.content, ...(note.conflictCopies ?? [])].join("\n\n[Preserved concurrent edit]\n\n"),
        note.cfi,
      );
      summary.notesAdded++;
    }
  }
  for (const collection of backup.collections) {
    const bookIds = collection.bookIds.map((id) => ids.get(id)).filter((id): id is string => !!id);
    let target = (await storage.getCollections()).find(
      (item) => item.name.toLowerCase() === collection.name.toLowerCase(),
    );
    if (!target) {
      target = await storage.createCollection(collection.name, collection.description);
      summary.collectionsAdded++;
    }
    await storage.updateCollection(target.id, {
      bookIds: [...new Set([...target.bookIds, ...bookIds])],
    });
  }
  return summary;
}
