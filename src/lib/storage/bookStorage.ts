import type {
  Book,
  Bookmark,
  Collection,
  ImportSummary,
  LibraryBackupV1,
  NewBookInput,
  Note,
  ReadingProgressUpdate,
  Settings,
} from "@/types";

/**
 * Storage contract for The Shelf.
 *
 * The UI talks only to this interface. Today it is backed by IndexedDB
 * (see ./indexedDbStorage.ts); a SQLite-backed implementation can be dropped
 * in later without touching components or hooks.
 */
export interface BookStorage {
  // Books
  addBook(input: NewBookInput): Promise<Book>;
  getBook(id: string): Promise<Book | undefined>;
  getBooks(): Promise<Book[]>;
  updateBook(id: string, patch: Partial<Omit<Book, "id" | "createdAt">>): Promise<Book>;
  deleteBook(id: string): Promise<void>;
  saveProgress(id: string, progress: ReadingProgressUpdate): Promise<Book>;

  // Files
  getPdf(pdfId: string): Promise<Blob | undefined>;
  getCover(coverId: string): Promise<Blob | undefined>;
  setCover(bookId: string, cover: Blob | null, kind: Book["coverKind"]): Promise<Book>;

  // Bookmarks
  addBookmark(bookId: string, page: number, label?: string): Promise<Bookmark>;
  removeBookmark(id: string): Promise<void>;
  getBookmarks(bookId: string): Promise<Bookmark[]>;

  // Notes
  addNote(bookId: string, page: number, content: string): Promise<Note>;
  updateNote(id: string, content: string): Promise<Note>;
  deleteNote(id: string): Promise<void>;
  getNotes(bookId: string): Promise<Note[]>;

  // Collections
  getCollections(): Promise<Collection[]>;
  createCollection(name: string, description?: string): Promise<Collection>;
  updateCollection(id: string, patch: Partial<Omit<Collection, "id" | "createdAt">>): Promise<Collection>;
  deleteCollection(id: string): Promise<void>;
  setBookCollections(bookId: string, collectionIds: string[]): Promise<void>;

  // Settings
  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;

  // Backup
  exportLibrary(): Promise<LibraryBackupV1>;
  importLibrary(
    backup: LibraryBackupV1,
    files: { pdfs: Map<string, Blob>; covers: Map<string, Blob> },
  ): Promise<ImportSummary>;
  clearLibrary(): Promise<void>;
}
