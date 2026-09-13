import type {
  Book,
  Bookmark,
  Collection,
  ImportSummary,
  LibraryBackup,
  LibraryBackupV1,
  NewBookInput,
  Note,
  ReadingProgressUpdate,
  Settings,
} from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import { createId } from "@/lib/utils/id";
import { computeProgress, clamp } from "@/lib/utils/format";
import type { BookStorage } from "./bookStorage";
import { getDB } from "./db";
import { storageEvents } from "./events";

const SETTINGS_KEY = "app";

function now(): string {
  return new Date().toISOString();
}

/** Accepts a v1 (pdfId/pdfName/pdfSize) or v2 book record and returns a v2 Book. */
function normalizeImportedBook(raw: LibraryBackup["books"][number] | LibraryBackupV1["books"][number]): Book {
  const legacy = raw as Partial<Book> & { pdfId?: string; pdfName?: string; pdfSize?: number };
  const book: Book = {
    ...(raw as Book),
    format: legacy.format ?? "pdf",
    fileId: legacy.fileId ?? legacy.pdfId ?? raw.id,
    fileName: legacy.fileName ?? legacy.pdfName ?? "",
    fileSize: legacy.fileSize ?? legacy.pdfSize ?? 0,
    currentCfi: legacy.currentCfi ?? null,
  };
  delete (book as { pdfId?: string }).pdfId;
  delete (book as { pdfName?: string }).pdfName;
  delete (book as { pdfSize?: number }).pdfSize;
  return book;
}

function normalizeKey(title: string, author: string): string {
  return `${title.trim().toLowerCase()}::${author.trim().toLowerCase()}`;
}

export class IndexedDbBookStorage implements BookStorage {
  // ---------------------------------------------------------------- Books

  async addBook(input: NewBookInput): Promise<Book> {
    const db = await getDB();
    const id = createId();
    const timestamp = now();
    const hasCover = !!input.cover;
    const currentPage =
      input.status === "finished"
        ? Math.max(1, input.totalPages)
        : clamp(input.currentPage ?? 1, 1, Math.max(1, input.totalPages));

    const book: Book = {
      id,
      format: input.format,
      title: input.title.trim(),
      author: input.author.trim(),
      description: input.description.trim(),
      category: input.category.trim() || "Other",
      tags: input.tags.map((t) => t.trim()).filter(Boolean),
      status: input.status,
      coverId: hasCover ? id : null,
      coverKind: hasCover ? input.coverKind ?? "generated" : "none",
      fileId: id,
      fileName: input.fileName,
      fileSize: input.file.size,
      totalPages: input.totalPages,
      currentPage,
      currentCfi: null,
      progress: input.status === "finished" ? 100 : computeProgress(currentPage, input.totalPages),
      createdAt: timestamp,
      updatedAt: timestamp,
      lastOpenedAt: null,
      finishedAt: input.status === "finished" ? timestamp : null,
    };

    const tx = db.transaction(["books", "files", "covers"], "readwrite");
    await Promise.all([
      tx.objectStore("books").put(book),
      tx.objectStore("files").put(input.file, id),
      hasCover ? tx.objectStore("covers").put(input.cover as Blob, id) : Promise.resolve(),
      tx.done,
    ]);
    storageEvents.emit("books", id);
    if (hasCover) storageEvents.emit("covers", id);
    return book;
  }

  async getBook(id: string): Promise<Book | undefined> {
    const db = await getDB();
    return db.get("books", id);
  }

  async getBooks(): Promise<Book[]> {
    const db = await getDB();
    return db.getAll("books");
  }

  async updateBook(id: string, patch: Partial<Omit<Book, "id" | "createdAt">>): Promise<Book> {
    const db = await getDB();
    const existing = await db.get("books", id);
    if (!existing) throw new Error("Book not found.");

    const next: Book = { ...existing, ...patch, id, createdAt: existing.createdAt, updatedAt: now() };

    // Keep derived fields coherent when status changes.
    if (patch.status && patch.status !== existing.status) {
      if (patch.status === "finished") {
        next.finishedAt = next.finishedAt ?? now();
        next.progress = 100;
        if (next.totalPages) next.currentPage = next.totalPages;
      } else {
        next.finishedAt = null;
        if (existing.status === "finished") {
          // Re-opening a finished book: start from the beginning.
          next.currentPage = 1;
          next.currentCfi = null;
          next.progress = 0;
        } else {
          next.progress = computeProgress(next.currentPage, next.totalPages);
        }
      }
    }

    await db.put("books", next);
    storageEvents.emit("books", id);
    return next;
  }

  async deleteBook(id: string): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(
      ["books", "files", "covers", "locations", "bookmarks", "notes", "collections"],
      "readwrite",
    );
    const bookmarks = await tx.objectStore("bookmarks").index("by-book").getAllKeys(id);
    const notes = await tx.objectStore("notes").index("by-book").getAllKeys(id);
    const collections = await tx.objectStore("collections").getAll();

    const ops: Promise<unknown>[] = [
      tx.objectStore("books").delete(id),
      tx.objectStore("files").delete(id),
      tx.objectStore("covers").delete(id),
      tx.objectStore("locations").delete(id),
      ...bookmarks.map((k) => tx.objectStore("bookmarks").delete(k)),
      ...notes.map((k) => tx.objectStore("notes").delete(k)),
    ];
    for (const c of collections) {
      if (c.bookIds.includes(id)) {
        ops.push(
          tx.objectStore("collections").put({ ...c, bookIds: c.bookIds.filter((b) => b !== id) }),
        );
      }
    }
    await Promise.all([...ops, tx.done]);
    storageEvents.emit("books", id);
    storageEvents.emit("covers", id);
    storageEvents.emit("bookmarks", id);
    storageEvents.emit("notes", id);
    storageEvents.emit("collections");
  }

  async saveProgress(id: string, { currentPage, totalPages, currentCfi }: ReadingProgressUpdate): Promise<Book> {
    const db = await getDB();
    const existing = await db.get("books", id);
    if (!existing) throw new Error("Book not found.");

    const total = totalPages || existing.totalPages;
    const page = clamp(currentPage, 1, Math.max(1, total));
    const next: Book = {
      ...existing,
      totalPages: total,
      currentPage: page,
      currentCfi: currentCfi === undefined ? existing.currentCfi : currentCfi,
      progress: existing.status === "finished" ? 100 : computeProgress(page, total),
      lastOpenedAt: now(),
      updatedAt: now(),
    };
    // Opening a "Want to Read" book for the first time moves it to Reading.
    if (existing.status === "want-to-read") next.status = "reading";

    await db.put("books", next);
    storageEvents.emit("books", id);
    return next;
  }

  // ---------------------------------------------------------------- Files

  async getFile(fileId: string): Promise<Blob | undefined> {
    const db = await getDB();
    return db.get("files", fileId);
  }

  async setFile(bookId: string, file: Blob, fileName: string, totalPages: number): Promise<Book> {
    const db = await getDB();
    const existing = await db.get("books", bookId);
    if (!existing) throw new Error("Book not found.");
    const tx = db.transaction(["books", "files", "locations"], "readwrite");
    const next: Book = {
      ...existing,
      fileId: bookId,
      fileName,
      fileSize: file.size,
      totalPages: totalPages || existing.totalPages,
      updatedAt: now(),
    };
    await Promise.all([
      tx.objectStore("files").put(file, bookId),
      tx.objectStore("locations").delete(bookId),
      tx.objectStore("books").put(next),
      tx.done,
    ]);
    storageEvents.emit("books", bookId);
    return next;
  }

  async getLocations(bookId: string): Promise<string | undefined> {
    const db = await getDB();
    return db.get("locations", bookId);
  }

  async setLocations(bookId: string, json: string): Promise<void> {
    const db = await getDB();
    await db.put("locations", json, bookId);
  }

  async getCover(coverId: string): Promise<Blob | undefined> {
    const db = await getDB();
    return db.get("covers", coverId);
  }

  async setCover(bookId: string, cover: Blob | null, kind: Book["coverKind"]): Promise<Book> {
    const db = await getDB();
    const existing = await db.get("books", bookId);
    if (!existing) throw new Error("Book not found.");
    const tx = db.transaction(["books", "covers"], "readwrite");
    const next: Book = {
      ...existing,
      coverId: cover ? bookId : null,
      coverKind: cover ? kind : "none",
      updatedAt: now(),
    };
    await Promise.all([
      cover ? tx.objectStore("covers").put(cover, bookId) : tx.objectStore("covers").delete(bookId),
      tx.objectStore("books").put(next),
      tx.done,
    ]);
    storageEvents.emit("books", bookId);
    storageEvents.emit("covers", bookId);
    return next;
  }

  // ------------------------------------------------------------ Bookmarks

  async addBookmark(bookId: string, page: number, label = "", cfi?: string): Promise<Bookmark> {
    const db = await getDB();
    const bookmark: Bookmark = { id: createId(), bookId, page, label: label.trim(), createdAt: now() };
    if (cfi) bookmark.cfi = cfi;
    await db.put("bookmarks", bookmark);
    storageEvents.emit("bookmarks", bookId);
    return bookmark;
  }

  async removeBookmark(id: string): Promise<void> {
    const db = await getDB();
    const existing = await db.get("bookmarks", id);
    await db.delete("bookmarks", id);
    storageEvents.emit("bookmarks", existing?.bookId);
  }

  async getBookmarks(bookId: string): Promise<Bookmark[]> {
    const db = await getDB();
    const list = await db.getAllFromIndex("bookmarks", "by-book", bookId);
    return list.sort((a, b) => a.page - b.page);
  }

  // ---------------------------------------------------------------- Notes

  async addNote(bookId: string, page: number, content: string, cfi?: string): Promise<Note> {
    const db = await getDB();
    const timestamp = now();
    const note: Note = { id: createId(), bookId, page, content: content.trim(), createdAt: timestamp, updatedAt: timestamp };
    if (cfi) note.cfi = cfi;
    await db.put("notes", note);
    storageEvents.emit("notes", bookId);
    return note;
  }

  async updateNote(id: string, content: string): Promise<Note> {
    const db = await getDB();
    const existing = await db.get("notes", id);
    if (!existing) throw new Error("Note not found.");
    const next: Note = { ...existing, content: content.trim(), updatedAt: now() };
    await db.put("notes", next);
    storageEvents.emit("notes", existing.bookId);
    return next;
  }

  async deleteNote(id: string): Promise<void> {
    const db = await getDB();
    const existing = await db.get("notes", id);
    await db.delete("notes", id);
    storageEvents.emit("notes", existing?.bookId);
  }

  async getNotes(bookId: string): Promise<Note[]> {
    const db = await getDB();
    const list = await db.getAllFromIndex("notes", "by-book", bookId);
    return list.sort((a, b) => a.page - b.page || a.createdAt.localeCompare(b.createdAt));
  }

  // ---------------------------------------------------------- Collections

  async getCollections(): Promise<Collection[]> {
    const db = await getDB();
    const list = await db.getAll("collections");
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }

  async createCollection(name: string, description = ""): Promise<Collection> {
    const db = await getDB();
    const collection: Collection = {
      id: createId(),
      name: name.trim(),
      description: description.trim(),
      bookIds: [],
      createdAt: now(),
    };
    await db.put("collections", collection);
    storageEvents.emit("collections", collection.id);
    return collection;
  }

  async updateCollection(id: string, patch: Partial<Omit<Collection, "id" | "createdAt">>): Promise<Collection> {
    const db = await getDB();
    const existing = await db.get("collections", id);
    if (!existing) throw new Error("Collection not found.");
    const next: Collection = { ...existing, ...patch, id, createdAt: existing.createdAt };
    await db.put("collections", next);
    storageEvents.emit("collections", id);
    return next;
  }

  async deleteCollection(id: string): Promise<void> {
    const db = await getDB();
    await db.delete("collections", id);
    storageEvents.emit("collections", id);
  }

  async setBookCollections(bookId: string, collectionIds: string[]): Promise<void> {
    const db = await getDB();
    const tx = db.transaction("collections", "readwrite");
    const all = await tx.store.getAll();
    const ops: Promise<unknown>[] = [];
    for (const c of all) {
      const shouldContain = collectionIds.includes(c.id);
      const contains = c.bookIds.includes(bookId);
      if (shouldContain && !contains) ops.push(tx.store.put({ ...c, bookIds: [...c.bookIds, bookId] }));
      if (!shouldContain && contains) ops.push(tx.store.put({ ...c, bookIds: c.bookIds.filter((b) => b !== bookId) }));
    }
    await Promise.all([...ops, tx.done]);
    storageEvents.emit("collections");
  }

  // ------------------------------------------------------------- Settings

  async getSettings(): Promise<Settings> {
    const db = await getDB();
    const stored = await db.get("settings", SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...stored };
  }

  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    const db = await getDB();
    const current = await this.getSettings();
    const next = { ...current, ...patch };
    await db.put("settings", next, SETTINGS_KEY);
    storageEvents.emit("settings");
    return next;
  }

  // --------------------------------------------------------------- Backup

  async exportLibrary(): Promise<LibraryBackup> {
    const db = await getDB();
    const [books, bookmarks, notes, collections, settings] = await Promise.all([
      db.getAll("books"),
      db.getAll("bookmarks"),
      db.getAll("notes"),
      db.getAll("collections"),
      this.getSettings(),
    ]);
    return {
      format: "the-shelf-library",
      version: 2,
      exportedAt: now(),
      books,
      bookmarks,
      notes,
      collections,
      settings,
      includesFiles: false,
    };
  }

  async importLibrary(
    backup: LibraryBackup | LibraryBackupV1,
    files: { files: Map<string, Blob>; covers: Map<string, Blob> },
  ): Promise<ImportSummary> {
    const db = await getDB();
    const summary: ImportSummary = {
      booksAdded: 0,
      booksSkipped: 0,
      booksWithoutFile: 0,
      bookmarksAdded: 0,
      notesAdded: 0,
      collectionsAdded: 0,
    };

    const existingBooks = await db.getAll("books");
    const existingIds = new Set(existingBooks.map((b) => b.id));
    const existingKeys = new Set(existingBooks.map((b) => normalizeKey(b.title, b.author)));
    const importedBookIds = new Set<string>();

    const tx = db.transaction(
      ["books", "files", "covers", "bookmarks", "notes", "collections"],
      "readwrite",
    );
    const ops: Promise<unknown>[] = [];

    for (const raw of backup.books) {
      const book = normalizeImportedBook(raw);
      // Never overwrite an existing book; also treat same title+author as a duplicate.
      if (existingIds.has(book.id) || existingKeys.has(normalizeKey(book.title, book.author))) {
        summary.booksSkipped += 1;
        continue;
      }
      const file = files.files.get(book.id);
      const cover = files.covers.get(book.id);
      const next: Book = {
        ...book,
        fileId: book.id,
        fileSize: file?.size ?? 0,
        coverId: cover ? book.id : null,
        coverKind: cover ? book.coverKind === "custom" ? "custom" : "generated" : "none",
      };
      if (!file) summary.booksWithoutFile += 1;
      ops.push(tx.objectStore("books").put(next));
      if (file) ops.push(tx.objectStore("files").put(file, book.id));
      if (cover) ops.push(tx.objectStore("covers").put(cover, book.id));
      importedBookIds.add(book.id);
      existingIds.add(book.id);
      existingKeys.add(normalizeKey(book.title, book.author));
      summary.booksAdded += 1;
    }

    const existingBookmarkIds = new Set(await tx.objectStore("bookmarks").getAllKeys());
    for (const bm of backup.bookmarks ?? []) {
      if (!existingIds.has(bm.bookId) || existingBookmarkIds.has(bm.id)) continue;
      // Only attach to books that were just imported (skipped duplicates keep their own data).
      if (!importedBookIds.has(bm.bookId)) continue;
      ops.push(tx.objectStore("bookmarks").put(bm));
      summary.bookmarksAdded += 1;
    }

    const existingNoteIds = new Set(await tx.objectStore("notes").getAllKeys());
    for (const note of backup.notes ?? []) {
      if (!importedBookIds.has(note.bookId) || existingNoteIds.has(note.id)) continue;
      ops.push(tx.objectStore("notes").put(note));
      summary.notesAdded += 1;
    }

    const existingCollections = await tx.objectStore("collections").getAll();
    const byName = new Map(existingCollections.map((c) => [c.name.toLowerCase(), c]));
    for (const col of backup.collections ?? []) {
      const validIds = col.bookIds.filter((id) => existingIds.has(id));
      const match = byName.get(col.name.toLowerCase());
      if (match) {
        const merged = Array.from(new Set([...match.bookIds, ...validIds]));
        if (merged.length !== match.bookIds.length) {
          ops.push(tx.objectStore("collections").put({ ...match, bookIds: merged }));
        }
      } else {
        const created: Collection = {
          ...col,
          id: existingCollections.some((c) => c.id === col.id) ? createId() : col.id,
          bookIds: validIds,
        };
        ops.push(tx.objectStore("collections").put(created));
        byName.set(created.name.toLowerCase(), created);
        summary.collectionsAdded += 1;
      }
    }

    await Promise.all([...ops, tx.done]);
    storageEvents.emit("books");
    storageEvents.emit("covers");
    storageEvents.emit("bookmarks");
    storageEvents.emit("notes");
    storageEvents.emit("collections");
    return summary;
  }

  async clearLibrary(): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(
      ["books", "files", "covers", "locations", "bookmarks", "notes", "collections"],
      "readwrite",
    );
    await Promise.all([
      tx.objectStore("books").clear(),
      tx.objectStore("files").clear(),
      tx.objectStore("covers").clear(),
      tx.objectStore("locations").clear(),
      tx.objectStore("bookmarks").clear(),
      tx.objectStore("notes").clear(),
      tx.objectStore("collections").clear(),
      tx.done,
    ]);
    storageEvents.emit("books");
    storageEvents.emit("covers");
    storageEvents.emit("bookmarks");
    storageEvents.emit("notes");
    storageEvents.emit("collections");
  }
}
