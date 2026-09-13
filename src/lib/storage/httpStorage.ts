"use client";

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
import type { BookStorage } from "./bookStorage";
import { storageEvents } from "./events";

/** Thrown for any non-2xx API response. `status` 401 means the session is gone. */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(input: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(input, { credentials: "same-origin", ...init });
  if (res.status === 204) return undefined as T;
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    const message = (body as { error?: string } | null)?.error ?? `Request failed (${res.status}).`;
    if (res.status === 401) storageEvents.emit("auth");
    throw new ApiError(res.status, message);
  }
  return body as T;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

function normalizeKey(title: string, author: string): string {
  return `${title.trim().toLowerCase()}::${author.trim().toLowerCase()}`;
}

/**
 * BookStorage backed by the server API. Files live on the server disk,
 * metadata in SQLite, everything scoped to the signed-in user.
 */
export class HttpBookStorage implements BookStorage {
  // ---------------------------------------------------------------- Books

  async addBook(input: NewBookInput): Promise<Book> {
    const form = new FormData();
    const { file, cover, fileName, ...meta } = input;
    form.set("meta", JSON.stringify({ ...meta, fileName, coverKind: cover ? input.coverKind ?? "generated" : "none" }));
    form.set("file", file, fileName);
    if (cover) form.set("cover", cover, "cover.jpg");
    const { book } = await request<{ book: Book }>("/api/books", { method: "POST", body: form });
    storageEvents.emit("books", book.id);
    storageEvents.emit("covers", book.id);
    return book;
  }

  async getBook(id: string): Promise<Book | undefined> {
    try {
      return (await request<{ book: Book }>(`/api/books/${id}`)).book;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return undefined;
      throw err;
    }
  }

  async getBooks(): Promise<Book[]> {
    return (await request<{ books: Book[] }>("/api/books")).books;
  }

  async updateBook(id: string, patch: Partial<Omit<Book, "id" | "createdAt">>): Promise<Book> {
    const { book } = await request<{ book: Book }>(`/api/books/${id}`, jsonInit("PATCH", patch));
    storageEvents.emit("books", id);
    return book;
  }

  async deleteBook(id: string): Promise<void> {
    await request(`/api/books/${id}`, { method: "DELETE" });
    storageEvents.emit("books", id);
    storageEvents.emit("covers", id);
    storageEvents.emit("bookmarks", id);
    storageEvents.emit("notes", id);
    storageEvents.emit("collections");
  }

  async saveProgress(id: string, progress: ReadingProgressUpdate): Promise<Book> {
    const { book } = await request<{ book: Book }>(`/api/books/${id}/progress`, jsonInit("PUT", progress));
    storageEvents.emit("books", id);
    return book;
  }

  // ---------------------------------------------------------------- Files

  async getFile(fileId: string): Promise<Blob | undefined> {
    const res = await fetch(`/api/books/${fileId}/file`, { credentials: "same-origin" });
    if (res.status === 404) return undefined;
    if (res.status === 401) storageEvents.emit("auth");
    if (!res.ok) throw new ApiError(res.status, "Could not download the book file.");
    return res.blob();
  }

  /** URL the browser can stream the file from directly (range requests supported). */
  fileUrl(fileId: string): string {
    return `/api/books/${fileId}/file`;
  }

  async setFile(bookId: string, file: Blob, fileName: string, totalPages: number): Promise<Book> {
    const { book } = await request<{ book: Book }>(`/api/books/${bookId}/file`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-File-Name": encodeURIComponent(fileName),
        "X-Total-Pages": String(totalPages),
      },
      body: file,
    });
    storageEvents.emit("books", bookId);
    return book;
  }

  async getCover(coverId: string): Promise<Blob | undefined> {
    const res = await fetch(`/api/books/${coverId}/cover`, { credentials: "same-origin" });
    if (!res.ok) return undefined;
    return res.blob();
  }

  coverUrl(coverId: string, version?: string): string {
    return `/api/books/${coverId}/cover${version ? `?v=${encodeURIComponent(version)}` : ""}`;
  }

  async setCover(bookId: string, cover: Blob | null, kind: Book["coverKind"]): Promise<Book> {
    const { book } = cover
      ? await request<{ book: Book }>(`/api/books/${bookId}/cover`, {
          method: "PUT",
          headers: { "Content-Type": cover.type || "image/jpeg", "X-Cover-Kind": kind },
          body: cover,
        })
      : await request<{ book: Book }>(`/api/books/${bookId}/cover`, { method: "DELETE" });
    storageEvents.emit("books", bookId);
    storageEvents.emit("covers", bookId);
    return book;
  }

  async getLocations(bookId: string): Promise<string | undefined> {
    const { locations } = await request<{ locations: string | null }>(`/api/books/${bookId}/locations`);
    return locations ?? undefined;
  }

  async setLocations(bookId: string, json: string): Promise<void> {
    await request(`/api/books/${bookId}/locations`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: json });
  }

  // ------------------------------------------------------------ Bookmarks

  async addBookmark(bookId: string, page: number, label = "", cfi?: string): Promise<Bookmark> {
    const { bookmark } = await request<{ bookmark: Bookmark }>("/api/bookmarks", jsonInit("POST", { bookId, page, label, cfi }));
    storageEvents.emit("bookmarks", bookId);
    return bookmark;
  }

  async removeBookmark(id: string): Promise<void> {
    await request(`/api/bookmarks/${id}`, { method: "DELETE" });
    storageEvents.emit("bookmarks");
  }

  async getBookmarks(bookId: string): Promise<Bookmark[]> {
    return (await request<{ bookmarks: Bookmark[] }>(`/api/bookmarks?bookId=${encodeURIComponent(bookId)}`)).bookmarks;
  }

  // ---------------------------------------------------------------- Notes

  async addNote(bookId: string, page: number, content: string, cfi?: string): Promise<Note> {
    const { note } = await request<{ note: Note }>("/api/notes", jsonInit("POST", { bookId, page, content, cfi }));
    storageEvents.emit("notes", bookId);
    return note;
  }

  async updateNote(id: string, content: string): Promise<Note> {
    const { note } = await request<{ note: Note }>(`/api/notes/${id}`, jsonInit("PATCH", { content }));
    storageEvents.emit("notes", note.bookId);
    return note;
  }

  async deleteNote(id: string): Promise<void> {
    await request(`/api/notes/${id}`, { method: "DELETE" });
    storageEvents.emit("notes");
  }

  async getNotes(bookId: string): Promise<Note[]> {
    return (await request<{ notes: Note[] }>(`/api/notes?bookId=${encodeURIComponent(bookId)}`)).notes;
  }

  // ---------------------------------------------------------- Collections

  async getCollections(): Promise<Collection[]> {
    return (await request<{ collections: Collection[] }>("/api/collections")).collections;
  }

  async createCollection(name: string, description = ""): Promise<Collection> {
    const { collection } = await request<{ collection: Collection }>("/api/collections", jsonInit("POST", { name, description }));
    storageEvents.emit("collections", collection.id);
    return collection;
  }

  async updateCollection(id: string, patch: Partial<Omit<Collection, "id" | "createdAt">>): Promise<Collection> {
    const { collection } = await request<{ collection: Collection }>(`/api/collections/${id}`, jsonInit("PATCH", patch));
    storageEvents.emit("collections", id);
    return collection;
  }

  async deleteCollection(id: string): Promise<void> {
    await request(`/api/collections/${id}`, { method: "DELETE" });
    storageEvents.emit("collections", id);
  }

  async setBookCollections(bookId: string, collectionIds: string[]): Promise<void> {
    await request(`/api/books/${bookId}/collections`, jsonInit("PUT", { collectionIds }));
    storageEvents.emit("collections");
  }

  // ------------------------------------------------------------- Settings

  async getSettings(): Promise<Settings> {
    const { settings } = await request<{ settings: Settings }>("/api/settings");
    return { ...DEFAULT_SETTINGS, ...settings };
  }

  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    const { settings } = await request<{ settings: Settings }>("/api/settings", jsonInit("PATCH", patch));
    storageEvents.emit("settings");
    return settings;
  }

  // --------------------------------------------------------------- Backup

  async exportLibrary(): Promise<LibraryBackup> {
    return request<LibraryBackup>("/api/library");
  }

  /**
   * Imports a backup by re-uploading each book. Books already present (same id
   * or same title + author) are skipped, never overwritten. Books whose file is
   * not in the backup cannot be restored on the server and are reported.
   */
  async importLibrary(
    backup: LibraryBackup | LibraryBackupV1,
    files: { files: Map<string, Blob>; covers: Map<string, Blob> },
  ): Promise<ImportSummary> {
    const summary: ImportSummary = { booksAdded: 0, booksSkipped: 0, booksWithoutFile: 0, bookmarksAdded: 0, notesAdded: 0, collectionsAdded: 0 };
    const existing = await this.getBooks();
    const ids = new Set(existing.map((b) => b.id));
    const keys = new Set(existing.map((b) => normalizeKey(b.title, b.author)));
    const imported = new Set<string>();

    for (const raw of backup.books) {
      const legacy = raw as Partial<Book> & { pdfName?: string };
      const book: Book = { ...(raw as Book), format: legacy.format ?? "pdf", fileName: legacy.fileName ?? legacy.pdfName ?? "" };
      if (ids.has(book.id) || keys.has(normalizeKey(book.title, book.author))) {
        summary.booksSkipped += 1;
        continue;
      }
      const file = files.files.get(book.id);
      if (!file) {
        summary.booksWithoutFile += 1;
        continue;
      }
      const form = new FormData();
      form.set(
        "meta",
        JSON.stringify({
          id: book.id,
          format: book.format,
          title: book.title,
          author: book.author,
          description: book.description,
          category: book.category,
          tags: book.tags,
          status: book.status,
          totalPages: book.totalPages,
          currentPage: book.currentPage,
          currentCfi: book.currentCfi ?? null,
          lastOpenedAt: book.lastOpenedAt ?? null,
          finishedAt: book.finishedAt ?? null,
          fileName: book.fileName || `${book.title}.${book.format}`,
          coverKind: book.coverKind,
        }),
      );
      form.set("file", file, book.fileName || `book.${book.format}`);
      const cover = files.covers.get(book.id);
      if (cover) form.set("cover", cover, "cover.jpg");
      await request("/api/books", { method: "POST", body: form });
      imported.add(book.id);
      ids.add(book.id);
      keys.add(normalizeKey(book.title, book.author));
      summary.booksAdded += 1;
    }

    for (const bm of backup.bookmarks ?? []) {
      if (!imported.has(bm.bookId)) continue;
      await request("/api/bookmarks", jsonInit("POST", { bookId: bm.bookId, page: bm.page, label: bm.label, cfi: bm.cfi, id: bm.id, createdAt: bm.createdAt })).catch(() => null);
      summary.bookmarksAdded += 1;
    }
    for (const note of backup.notes ?? []) {
      if (!imported.has(note.bookId)) continue;
      await request("/api/notes", jsonInit("POST", { bookId: note.bookId, page: note.page, content: note.content, cfi: note.cfi, id: note.id, createdAt: note.createdAt, updatedAt: note.updatedAt })).catch(() => null);
      summary.notesAdded += 1;
    }

    const existingCollections = await this.getCollections();
    const byName = new Map(existingCollections.map((c) => [c.name.toLowerCase(), c]));
    for (const col of backup.collections ?? []) {
      const validIds = col.bookIds.filter((id) => ids.has(id));
      const match = byName.get(col.name.toLowerCase());
      if (match) {
        const merged = Array.from(new Set([...match.bookIds, ...validIds]));
        if (merged.length !== match.bookIds.length) await this.updateCollection(match.id, { bookIds: merged });
      } else {
        await request("/api/collections", jsonInit("POST", { name: col.name, description: col.description, bookIds: validIds, createdAt: col.createdAt }));
        summary.collectionsAdded += 1;
      }
    }

    storageEvents.emit("books");
    storageEvents.emit("covers");
    storageEvents.emit("bookmarks");
    storageEvents.emit("notes");
    storageEvents.emit("collections");
    return summary;
  }

  async clearLibrary(): Promise<void> {
    await request("/api/library", { method: "DELETE" });
    storageEvents.emit("books");
    storageEvents.emit("covers");
    storageEvents.emit("bookmarks");
    storageEvents.emit("notes");
    storageEvents.emit("collections");
  }
}
