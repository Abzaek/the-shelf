import "server-only";
import { recordActivity } from "./analytics/tracking";
import { getDb, now } from "./db";
import { createId } from "@/lib/utils/id";
import { clamp, computeProgress } from "@/lib/utils/format";
import { DEFAULT_SETTINGS, type Book, type Bookmark, type Collection, type Note, type ReadingStatus, type Settings } from "@/types";

/**
 * Data access, always scoped by user. Nothing here trusts ids from the client
 * without also matching `user_id`.
 */

interface BookRow {
  id: string;
  user_id: string;
  format: string;
  title: string;
  author: string;
  description: string;
  category: string;
  tags: string;
  status: string;
  cover_kind: string;
  cover_size: number;
  file_name: string;
  file_size: number;
  total_pages: number;
  current_page: number;
  current_cfi: string | null;
  progress: number;
  created_at: string;
  updated_at: string;
  last_opened_at: string | null;
  finished_at: string | null;
}

function toBook(r: BookRow): Book {
  return {
    id: r.id,
    format: r.format as Book["format"],
    title: r.title,
    author: r.author,
    description: r.description,
    category: r.category,
    tags: JSON.parse(r.tags || "[]"),
    status: r.status as ReadingStatus,
    coverId: r.cover_kind === "none" ? null : r.id,
    coverKind: r.cover_kind as Book["coverKind"],
    fileId: r.id,
    fileName: r.file_name,
    fileSize: r.file_size,
    totalPages: r.total_pages,
    currentPage: r.current_page,
    currentCfi: r.current_cfi,
    progress: r.progress,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastOpenedAt: r.last_opened_at,
    finishedAt: r.finished_at,
  };
}

const BOOK_COLUMNS = `id, user_id, format, title, author, description, category, tags, status, cover_kind, cover_size,
  file_name, file_size, total_pages, current_page, current_cfi, progress, created_at, updated_at, last_opened_at, finished_at`;

export const books = {
  list(userId: string): Book[] {
    return (getDb().prepare(`SELECT ${BOOK_COLUMNS} FROM books WHERE user_id = ? ORDER BY title`).all(userId) as BookRow[]).map(toBook);
  },

  get(userId: string, id: string): Book | null {
    const row = getDb().prepare(`SELECT ${BOOK_COLUMNS} FROM books WHERE user_id = ? AND id = ?`).get(userId, id) as BookRow | undefined;
    return row ? toBook(row) : null;
  },

  /** Inserts the metadata row. File and cover sizes are recorded once the bytes are on disk. */
  create(
    userId: string,
    input: Pick<Book, "format" | "title" | "author" | "description" | "category" | "tags" | "status" | "totalPages"> & {
      currentPage?: number;
      fileName: string;
      fileSize: number;
      coverKind: Book["coverKind"];
      coverSize: number;
      id?: string;
    },
  ): Book {
    const id = input.id ?? createId();
    const ts = now();
    const finished = input.status === "finished";
    const currentPage = finished ? Math.max(1, input.totalPages) : clamp(input.currentPage ?? 1, 1, Math.max(1, input.totalPages));
    getDb()
      .prepare(
        `INSERT INTO books (id, user_id, format, title, author, description, category, tags, status, cover_kind, cover_size,
          file_name, file_size, total_pages, current_page, current_cfi, progress, created_at, updated_at, last_opened_at, finished_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, ?)`,
      )
      .run(
        id, userId, input.format, input.title.trim(), input.author.trim(), input.description.trim(),
        input.category.trim() || "Other", JSON.stringify(input.tags.map((t) => t.trim()).filter(Boolean)), input.status,
        input.coverKind, input.coverSize, input.fileName, input.fileSize, input.totalPages, currentPage,
        finished ? 100 : computeProgress(currentPage, input.totalPages), ts, ts, finished ? ts : null,
      );
    recordActivity(userId, "book_uploaded", id, input.title, input.fileSize + input.coverSize);
    return books.get(userId, id)!;
  },

  update(userId: string, id: string, patch: Partial<Omit<Book, "id" | "createdAt" | "fileId" | "coverId">>): Book | null {
    const existing = books.get(userId, id);
    if (!existing) return null;
    const next: Book = { ...existing, ...patch, id, createdAt: existing.createdAt, updatedAt: now() };
    if (patch.status && patch.status !== existing.status) {
      if (patch.status === "finished") {
        next.finishedAt = next.finishedAt ?? now();
        next.progress = 100;
        if (next.totalPages) next.currentPage = next.totalPages;
      } else {
        next.finishedAt = null;
        if (existing.status === "finished") {
          next.currentPage = 1;
          next.currentCfi = null;
          next.progress = 0;
        } else next.progress = computeProgress(next.currentPage, next.totalPages);
      }
    }
    getDb()
      .prepare(
        `UPDATE books SET title = ?, author = ?, description = ?, category = ?, tags = ?, status = ?, total_pages = ?,
           current_page = ?, current_cfi = ?, progress = ?, updated_at = ?, last_opened_at = ?, finished_at = ?
         WHERE user_id = ? AND id = ?`,
      )
      .run(
        next.title.trim(), next.author.trim(), next.description.trim(), next.category.trim() || "Other", JSON.stringify(next.tags),
        next.status, next.totalPages, next.currentPage, next.currentCfi, next.progress, next.updatedAt, next.lastOpenedAt,
        next.finishedAt, userId, id,
      );
    if (patch.status === "finished" && existing.status !== "finished") recordActivity(userId, "book_completed", id, next.title);
    return books.get(userId, id);
  },

  saveProgress(userId: string, id: string, currentPage: number, totalPages: number, currentCfi?: string | null): Book | null {
    const existing = books.get(userId, id);
    if (!existing) return null;
    const total = totalPages || existing.totalPages;
    const page = clamp(currentPage, 1, Math.max(1, total));
    const status = existing.status === "want-to-read" ? "reading" : existing.status;
    const ts = now();
    getDb()
      .prepare(
        `UPDATE books SET total_pages = ?, current_page = ?, current_cfi = ?, progress = ?, status = ?, last_opened_at = ?, updated_at = ?
         WHERE user_id = ? AND id = ?`,
      )
      .run(
        total, page, currentCfi === undefined ? existing.currentCfi : currentCfi,
        existing.status === "finished" ? 100 : computeProgress(page, total), status, ts, ts, userId, id,
      );
    recordActivity(userId, "reading_progress_updated", id);
    return books.get(userId, id);
  },

  setFile(userId: string, id: string, fileName: string, fileSize: number, totalPages: number): Book | null {
    const existing = books.get(userId, id);
    if (!existing) return null;
    getDb()
      .prepare("UPDATE books SET file_name = ?, file_size = ?, total_pages = ?, locations = NULL, updated_at = ? WHERE user_id = ? AND id = ?")
      .run(fileName, fileSize, totalPages || existing.totalPages, now(), userId, id);
    return books.get(userId, id);
  },

  setCover(userId: string, id: string, kind: Book["coverKind"], size: number): Book | null {
    getDb()
      .prepare("UPDATE books SET cover_kind = ?, cover_size = ?, updated_at = ? WHERE user_id = ? AND id = ?")
      .run(kind, size, now(), userId, id);
    return books.get(userId, id);
  },

  remove(userId: string, id: string): Book | null {
    const existing = books.get(userId, id);
    if (!existing) return null;
    const db = getDb();
    db.transaction(() => {
      const size = db.prepare("SELECT file_size + cover_size bytes FROM books WHERE user_id = ? AND id = ?").get(userId, id) as { bytes: number };
      db.prepare("DELETE FROM books WHERE user_id = ? AND id = ?").run(userId, id);
      recordActivity(userId, "book_deleted", id, existing.title, size.bytes);
      for (const c of collections.list(userId)) {
        if (c.bookIds.includes(id)) collections.update(userId, c.id, { bookIds: c.bookIds.filter((b) => b !== id) });
      }
    })();
    return existing;
  },

  getLocations(userId: string, id: string): string | null {
    const row = getDb().prepare("SELECT locations FROM books WHERE user_id = ? AND id = ?").get(userId, id) as { locations: string | null } | undefined;
    return row?.locations ?? null;
  },

  setLocations(userId: string, id: string, json: string): void {
    getDb().prepare("UPDATE books SET locations = ? WHERE user_id = ? AND id = ?").run(json, userId, id);
  },
};

// ------------------------------------------------------------ bookmarks

interface BookmarkRow { id: string; book_id: string; page: number; cfi: string | null; label: string; created_at: string }
const toBookmark = (r: BookmarkRow): Bookmark => ({ id: r.id, bookId: r.book_id, page: r.page, ...(r.cfi ? { cfi: r.cfi } : {}), label: r.label, createdAt: r.created_at });

export const bookmarks = {
  list(userId: string, bookId: string): Bookmark[] {
    return (getDb().prepare("SELECT * FROM bookmarks WHERE user_id = ? AND book_id = ? ORDER BY page").all(userId, bookId) as BookmarkRow[]).map(toBookmark);
  },
  listAll(userId: string): Bookmark[] {
    return (getDb().prepare("SELECT * FROM bookmarks WHERE user_id = ? ORDER BY page").all(userId) as BookmarkRow[]).map(toBookmark);
  },
  add(userId: string, bookId: string, page: number, label = "", cfi?: string, id?: string, createdAt?: string): Bookmark | null {
    if (!books.get(userId, bookId)) return null;
    const row: BookmarkRow = { id: id ?? createId(), book_id: bookId, page, cfi: cfi ?? null, label: label.trim(), created_at: createdAt ?? now() };
    getDb().prepare("INSERT INTO bookmarks (id, user_id, book_id, page, cfi, label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(row.id, userId, bookId, page, row.cfi, row.label, row.created_at);
    return toBookmark(row);
  },
  remove(userId: string, id: string): void {
    getDb().prepare("DELETE FROM bookmarks WHERE user_id = ? AND id = ?").run(userId, id);
  },
};

// ------------------------------------------------------------ notes

interface NoteRow { id: string; book_id: string; page: number; cfi: string | null; content: string; created_at: string; updated_at: string }
const toNote = (r: NoteRow): Note => ({ id: r.id, bookId: r.book_id, page: r.page, ...(r.cfi ? { cfi: r.cfi } : {}), content: r.content, createdAt: r.created_at, updatedAt: r.updated_at });

export const notes = {
  list(userId: string, bookId: string): Note[] {
    return (getDb().prepare("SELECT * FROM notes WHERE user_id = ? AND book_id = ? ORDER BY page, created_at").all(userId, bookId) as NoteRow[]).map(toNote);
  },
  listAll(userId: string): Note[] {
    return (getDb().prepare("SELECT * FROM notes WHERE user_id = ? ORDER BY page, created_at").all(userId) as NoteRow[]).map(toNote);
  },
  add(userId: string, bookId: string, page: number, content: string, cfi?: string, id?: string, createdAt?: string, updatedAt?: string): Note | null {
    if (!books.get(userId, bookId)) return null;
    const ts = now();
    const row: NoteRow = { id: id ?? createId(), book_id: bookId, page, cfi: cfi ?? null, content: content.trim(), created_at: createdAt ?? ts, updated_at: updatedAt ?? ts };
    getDb().prepare("INSERT INTO notes (id, user_id, book_id, page, cfi, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(row.id, userId, bookId, page, row.cfi, row.content, row.created_at, row.updated_at);
    return toNote(row);
  },
  update(userId: string, id: string, content: string): Note | null {
    getDb().prepare("UPDATE notes SET content = ?, updated_at = ? WHERE user_id = ? AND id = ?").run(content.trim(), now(), userId, id);
    const row = getDb().prepare("SELECT * FROM notes WHERE user_id = ? AND id = ?").get(userId, id) as NoteRow | undefined;
    return row ? toNote(row) : null;
  },
  remove(userId: string, id: string): void {
    getDb().prepare("DELETE FROM notes WHERE user_id = ? AND id = ?").run(userId, id);
  },
};

// ------------------------------------------------------------ collections

interface CollectionRow { id: string; name: string; description: string; book_ids: string; created_at: string }
const toCollection = (r: CollectionRow): Collection => ({ id: r.id, name: r.name, description: r.description, bookIds: JSON.parse(r.book_ids || "[]"), createdAt: r.created_at });

export const collections = {
  list(userId: string): Collection[] {
    return (getDb().prepare("SELECT * FROM collections WHERE user_id = ? ORDER BY name").all(userId) as CollectionRow[]).map(toCollection);
  },
  get(userId: string, id: string): Collection | null {
    const row = getDb().prepare("SELECT * FROM collections WHERE user_id = ? AND id = ?").get(userId, id) as CollectionRow | undefined;
    return row ? toCollection(row) : null;
  },
  create(userId: string, name: string, description = "", bookIds: string[] = [], id?: string, createdAt?: string): Collection {
    const row: CollectionRow = { id: id ?? createId(), name: name.trim(), description: description.trim(), book_ids: JSON.stringify(bookIds), created_at: createdAt ?? now() };
    getDb().prepare("INSERT INTO collections (id, user_id, name, description, book_ids, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(row.id, userId, row.name, row.description, row.book_ids, row.created_at);
    return toCollection(row);
  },
  update(userId: string, id: string, patch: Partial<Omit<Collection, "id" | "createdAt">>): Collection | null {
    const existing = collections.get(userId, id);
    if (!existing) return null;
    const next = { ...existing, ...patch };
    getDb().prepare("UPDATE collections SET name = ?, description = ?, book_ids = ? WHERE user_id = ? AND id = ?")
      .run(next.name.trim(), next.description.trim(), JSON.stringify(next.bookIds), userId, id);
    return collections.get(userId, id);
  },
  remove(userId: string, id: string): void {
    getDb().prepare("DELETE FROM collections WHERE user_id = ? AND id = ?").run(userId, id);
  },
  setBookMembership(userId: string, bookId: string, collectionIds: string[]): void {
    const db = getDb();
    db.transaction(() => {
      for (const c of collections.list(userId)) {
        const should = collectionIds.includes(c.id);
        const has = c.bookIds.includes(bookId);
        if (should && !has) collections.update(userId, c.id, { bookIds: [...c.bookIds, bookId] });
        if (!should && has) collections.update(userId, c.id, { bookIds: c.bookIds.filter((b) => b !== bookId) });
      }
    })();
  },
};

// ------------------------------------------------------------ settings

export const settings = {
  get(userId: string): Settings {
    const row = getDb().prepare("SELECT settings FROM users WHERE id = ?").get(userId) as { settings: string } | undefined;
    let stored: Partial<Settings> = {};
    try {
      stored = row ? JSON.parse(row.settings) : {};
    } catch {
      stored = {};
    }
    return { ...DEFAULT_SETTINGS, ...stored };
  },
  update(userId: string, patch: Partial<Settings>): Settings {
    const next = { ...settings.get(userId), ...patch };
    getDb().prepare("UPDATE users SET settings = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(next), now(), userId);
    return next;
  },
};
