import "server-only";
import { getDb } from "@/server/db";
import { books, bookmarks, notes, collections, settings } from "@/server/repo";
import { HttpError } from "@/server/http";
import { documentFor, sameDocument, type SyncDocument, type SyncWrite } from "@/lib/sync/documents";
import type { Book, Bookmark, Collection, Note, Settings } from "@/types";

type Row = { document: string; sequence: number };
function read(userId: string, id: string): SyncDocument | undefined {
  const row = getDb()
    .prepare("SELECT document FROM sync_documents WHERE user_id = ? AND id = ?")
    .get(userId, id) as Row | undefined;
  return row ? JSON.parse(row.document) : undefined;
}
function write(userId: string, doc: SyncDocument): void {
  const db = getDb();
  const current = read(userId, doc.id);
  if (current && sameDocument(current, doc)) return;
  const { sequence } = db
    .prepare("UPDATE sync_clock SET sequence = sequence + 1 WHERE id = 1 RETURNING sequence")
    .get() as { sequence: number };
  db.prepare(
    "INSERT INTO sync_documents(user_id,id,type,document,sequence) VALUES(?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET document=excluded.document,sequence=excluded.sequence",
  ).run(userId, doc.id, doc.type, JSON.stringify(doc), sequence);
}

/** Bridge legacy API writes into the same ordered change feed. Called under a SQLite transaction. */
export function captureLibrary(userId: string): void {
  const live: SyncDocument[] = [documentFor("settings", "default", settings.get(userId))];
  for (const book of books.list(userId)) live.push(documentFor("book", book.id, book));
  for (const bookmark of bookmarks.listAll(userId))
    live.push(documentFor("bookmark", bookmark.id, bookmark, bookmark.bookId));
  for (const note of notes.listAll(userId))
    live.push(documentFor("note", note.id, note, note.bookId));
  for (const collection of collections.list(userId)) {
    const { bookIds, ...meta } = collection;
    live.push(documentFor("collection", collection.id, meta));
    for (const bookId of bookIds) {
      if (books.get(userId, bookId))
        live.push(
          documentFor(
            "membership",
            `${collection.id}|${bookId}`,
            { collectionId: collection.id, bookId },
            bookId,
          ),
        );
    }
  }
  const ids = new Set(live.map((doc) => doc.id));
  for (const row of getDb()
    .prepare("SELECT document FROM sync_documents WHERE user_id = ?")
    .all(userId) as Row[]) {
    const doc: SyncDocument = JSON.parse(row.document);
    if (!ids.has(doc.id) && !doc._deleted) write(userId, { ...doc, _deleted: true });
  }
  for (const doc of live) write(userId, doc);
}

function assertIdentityAvailable(
  table: "books" | "bookmarks" | "notes" | "collections",
  userId: string,
  id: string,
): void {
  const row = getDb().prepare(`SELECT user_id FROM ${table} WHERE id = ?`).get(id) as
    { user_id: string } | undefined;
  if (row && row.user_id !== userId)
    throw new HttpError(
      409,
      "This identifier is unavailable. Export this device's library and contact support.",
    );
}

function project(userId: string, doc: SyncDocument): SyncDocument {
  const db = getDb();
  const value = JSON.parse(doc.payload);
  if (doc.type === "book") {
    const book = value as Book;
    assertIdentityAvailable("books", userId, book.id);
    if (doc._deleted) {
      books.remove(userId, book.id);
      // Keep file cleanup outside the transaction; the maintenance task removes unreferenced bytes.
      return doc;
    }
    const existing = books.get(userId, book.id);
    if (
      book.fileSource === "drive" &&
      (!existing || existing.driveFileId !== book.driveFileId || existing.fileSource !== "drive")
    ) {
      throw new HttpError(400, "Connect Drive and select a book through the Drive picker first.");
    }
    if (existing && existing.format !== book.format)
      throw new HttpError(400, "A book's file format cannot change.");
    if (!existing) {
      books.create(userId, { ...book, fileSize: 0, coverSize: 0, coverKind: "none" });
    }
    const old = db
      .prepare("SELECT sync_extra FROM books WHERE user_id=? AND id=?")
      .get(userId, book.id) as { sync_extra: string };
    const extra = {
      ...JSON.parse(old.sync_extra),
      fileSource: book.fileSource ?? "hosted",
      driveFileId: book.driveFileId,
      fileRevision: book.fileRevision ?? "legacy",
      coverRevision: book.coverRevision ?? "legacy",
      readingPositions: book.readingPositions ?? {},
      expectedFileSize: book.fileSize,
    };
    db.prepare(
      `UPDATE books SET title=?,author=?,description=?,category=?,tags=?,status=?,cover_kind=?,file_name=?,total_pages=?,current_page=?,current_cfi=?,progress=?,created_at=?,updated_at=?,last_opened_at=?,finished_at=?,sync_extra=? WHERE user_id=? AND id=?`,
    ).run(
      book.title,
      book.author,
      book.description,
      book.category,
      JSON.stringify(book.tags),
      book.status,
      book.coverKind,
      book.fileName,
      book.totalPages,
      book.currentPage,
      book.currentCfi,
      book.progress,
      book.createdAt,
      book.updatedAt,
      book.lastOpenedAt,
      book.finishedAt,
      JSON.stringify(extra),
      userId,
      book.id,
    );
  } else if (doc.type === "bookmark") {
    const bookmark = value as Bookmark;
    assertIdentityAvailable("bookmarks", userId, bookmark.id);
    if (doc._deleted || !books.get(userId, bookmark.bookId)) {
      bookmarks.remove(userId, bookmark.id);
      return { ...doc, _deleted: true };
    }
    db.prepare(
      "INSERT INTO bookmarks(id,user_id,book_id,page,cfi,label,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET label=excluded.label,page=excluded.page,cfi=excluded.cfi",
    ).run(
      bookmark.id,
      userId,
      bookmark.bookId,
      bookmark.page,
      bookmark.cfi ?? null,
      bookmark.label,
      bookmark.createdAt,
    );
  } else if (doc.type === "note") {
    const note = value as Note;
    assertIdentityAvailable("notes", userId, note.id);
    if (doc._deleted || !books.get(userId, note.bookId)) {
      notes.remove(userId, note.id);
      return { ...doc, _deleted: true };
    }
    db.prepare(
      "INSERT INTO notes(id,user_id,book_id,page,cfi,content,created_at,updated_at,conflict_copies) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET content=excluded.content,updated_at=excluded.updated_at,conflict_copies=excluded.conflict_copies",
    ).run(
      note.id,
      userId,
      note.bookId,
      note.page,
      note.cfi ?? null,
      note.content,
      note.createdAt,
      note.updatedAt,
      JSON.stringify(note.conflictCopies ?? []),
    );
  } else if (doc.type === "collection") {
    const collection = value as Omit<Collection, "bookIds">;
    assertIdentityAvailable("collections", userId, collection.id);
    if (doc._deleted) {
      collections.remove(userId, collection.id);
      return doc;
    }
    if (!collections.get(userId, collection.id))
      collections.create(
        userId,
        collection.name,
        collection.description,
        [],
        collection.id,
        collection.createdAt,
      );
    else collections.update(userId, collection.id, collection);
  } else if (doc.type === "membership") {
    const { collectionId, bookId } = value as { collectionId: string; bookId: string };
    const collection = collections.get(userId, collectionId);
    if (!collection || !books.get(userId, bookId)) return { ...doc, _deleted: true };
    const ids = new Set(collection.bookIds);
    if (doc._deleted) ids.delete(bookId);
    else ids.add(bookId);
    collections.update(userId, collectionId, { bookIds: [...ids] });
  } else {
    if (doc._deleted) throw new HttpError(400, "Settings cannot be deleted.");
    settings.update(userId, value as Settings);
  }
  return doc;
}

export function pullDocuments(userId: string, sequence: number, limit: number) {
  return getDb().transaction(() => {
    captureLibrary(userId);
    const rows = getDb()
      .prepare(
        "SELECT document,sequence FROM sync_documents WHERE user_id=? AND sequence>? ORDER BY sequence LIMIT ?",
      )
      .all(userId, sequence, limit) as Row[];
    return {
      documents: rows.map((row) => JSON.parse(row.document) as SyncDocument),
      checkpoint: { sequence: rows.at(-1)?.sequence ?? sequence },
    };
  })();
}

/** Atomic compare-and-swap. Content equality also makes a lost-response retry idempotent. */
export function pushDocuments(
  userId: string,
  writes: SyncWrite[],
  parents: SyncDocument[] = [],
): SyncDocument[] {
  return getDb().transaction(() => {
    captureLibrary(userId);
    for (const parent of parents) {
      if (!["book", "collection"].includes(parent.type) || parent._deleted) continue;
      if (!read(userId, parent.id)) write(userId, project(userId, parent));
    }
    const conflicts: SyncDocument[] = [];
    const order = { book: 0, collection: 1, settings: 2, bookmark: 3, note: 3, membership: 4 };
    for (const row of [...writes].sort(
      (a, b) => order[a.newDocumentState.type] - order[b.newDocumentState.type],
    )) {
      const next = row.newDocumentState;
      const current = read(userId, next.id);
      if (current && sameDocument(current, next)) continue;
      if (current && (!row.assumedMasterState || !sameDocument(current, row.assumedMasterState))) {
        conflicts.push(current);
        continue;
      }
      if (current?._deleted && !next._deleted && next.type !== "membership") {
        conflicts.push(current);
        continue;
      }
      const applied = project(userId, next);
      write(userId, applied);
      if (!sameDocument(applied, next)) conflicts.push(applied);
    }
    captureLibrary(userId);
    return conflicts;
  })();
}
