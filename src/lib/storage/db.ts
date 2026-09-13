import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Book, Bookmark, Collection, Note, Settings } from "@/types";

export const DB_NAME = "the-shelf";
export const DB_VERSION = 1;

export interface ShelfDB extends DBSchema {
  books: {
    key: string;
    value: Book;
    indexes: { "by-status": string; "by-updatedAt": string; "by-createdAt": string };
  };
  pdfs: { key: string; value: Blob };
  covers: { key: string; value: Blob };
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
      upgrade(db) {
        if (!db.objectStoreNames.contains("books")) {
          const books = db.createObjectStore("books", { keyPath: "id" });
          books.createIndex("by-status", "status");
          books.createIndex("by-updatedAt", "updatedAt");
          books.createIndex("by-createdAt", "createdAt");
        }
        if (!db.objectStoreNames.contains("pdfs")) db.createObjectStore("pdfs");
        if (!db.objectStoreNames.contains("covers")) db.createObjectStore("covers");
        if (!db.objectStoreNames.contains("bookmarks")) {
          const bookmarks = db.createObjectStore("bookmarks", { keyPath: "id" });
          bookmarks.createIndex("by-book", "bookId");
        }
        if (!db.objectStoreNames.contains("notes")) {
          const notes = db.createObjectStore("notes", { keyPath: "id" });
          notes.createIndex("by-book", "bookId");
        }
        if (!db.objectStoreNames.contains("collections")) {
          db.createObjectStore("collections", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings");
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
