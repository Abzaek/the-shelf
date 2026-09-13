import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Book, Bookmark, Collection, Note, Settings } from "@/types";

export const DB_NAME = "the-shelf";
export const DB_VERSION = 2;

export interface ShelfDB extends DBSchema {
  books: {
    key: string;
    value: Book;
    indexes: { "by-status": string; "by-updatedAt": string; "by-createdAt": string };
  };
  /** Book files (PDF or EPUB) keyed by book id. */
  files: { key: string; value: Blob };
  covers: { key: string; value: Blob };
  /** Cached EPUB location maps (epub.js `locations.save()` JSON) keyed by book id. */
  locations: { key: string; value: string };
  bookmarks: {
    key: string;
    value: Bookmark;
    indexes: { "by-book": string };
  };
  notes: {
    key: string;
    value: Note;
    indexes: { "by-book": string };
  };
  collections: { key: string; value: Collection };
  settings: { key: string; value: Settings };
}

let dbPromise: Promise<IDBPDatabase<ShelfDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<ShelfDB>> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available in this environment."));
  }
  if (!dbPromise) {
    dbPromise = openDB<ShelfDB>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          const books = db.createObjectStore("books", { keyPath: "id" });
          books.createIndex("by-status", "status");
          books.createIndex("by-updatedAt", "updatedAt");
          books.createIndex("by-createdAt", "createdAt");
          db.createObjectStore("covers");
          const bookmarks = db.createObjectStore("bookmarks", { keyPath: "id" });
          bookmarks.createIndex("by-book", "bookId");
          const notes = db.createObjectStore("notes", { keyPath: "id" });
          notes.createIndex("by-book", "bookId");
          db.createObjectStore("collections", { keyPath: "id" });
          db.createObjectStore("settings");
        }
        if (oldVersion < 2) {
          // v2: PDFs become generic "files" (EPUB support), books gain `format`.
          const files = db.createObjectStore("files");
          db.createObjectStore("locations");
          if (db.objectStoreNames.contains("pdfs" as never)) {
            const legacy = tx.objectStore("pdfs" as never) as unknown as {
              openCursor(): Promise<{ key: string; value: Blob; continue(): Promise<unknown> } | null>;
            };
            let cursor = await legacy.openCursor();
            while (cursor) {
              await files.put(cursor.value, cursor.key);
              cursor = (await cursor.continue()) as typeof cursor;
            }
            db.deleteObjectStore("pdfs" as never);
          }
          const books = tx.objectStore("books");
          let cursor = await books.openCursor();
          while (cursor) {
            const legacy = cursor.value as Book & { pdfId?: string; pdfName?: string; pdfSize?: number };
            const migrated: Book = {
              ...legacy,
              format: legacy.format ?? "pdf",
              fileId: legacy.fileId ?? legacy.pdfId ?? legacy.id,
              fileName: legacy.fileName ?? legacy.pdfName ?? "",
              fileSize: legacy.fileSize ?? legacy.pdfSize ?? 0,
              currentCfi: legacy.currentCfi ?? null,
            };
            delete (migrated as { pdfId?: string }).pdfId;
            delete (migrated as { pdfName?: string }).pdfName;
            delete (migrated as { pdfSize?: number }).pdfSize;
            await cursor.update(migrated);
            cursor = await cursor.continue();
          }
        }
      },
      blocked() {
        console.warn("The Shelf database upgrade is blocked by another open tab.");
      },
      blocking() {
        // Another tab wants to upgrade — close so it can proceed.
        dbPromise?.then((db) => db.close());
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}

export async function deleteDatabase(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}
