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
  getFile(fileId: string): Promise<Blob | undefined>;
  /** Direct URL for streaming the file (used by the readers). */
  fileUrl(fileId: string): string;
  /** Direct URL for the cover thumbnail; `version` busts caches after a cover change. */
  coverUrl(coverId: string, version?: string): string;
  setFile(bookId: string, file: Blob, fileName: string, totalPages: number): Promise<Book>;
  getCover(coverId: string): Promise<Blob | undefined>;
  setCover(bookId: string, cover: Blob | null, kind: Book["coverKind"]): Promise<Book>;

  // EPUB location cache
  getLocations(bookId: string): Promise<string | undefined>;
  setLocations(bookId: string, json: string): Promise<void>;

  // Bookmarks
  addBookmark(bookId: string, page: number, label?: string, cfi?: string): Promise<Bookmark>;
  removeBookmark(id: string): Promise<void>;
  getBookmarks(bookId: string): Promise<Bookmark[]>;

  // Notes
  addNote(bookId: string, page: number, content: string, cfi?: string): Promise<Note>;
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
  exportLibrary(): Promise<LibraryBackup>;
  importLibrary(
    backup: LibraryBackup | LibraryBackupV1,
    files: { files: Map<string, Blob>; covers: Map<string, Blob> },
  ): Promise<ImportSummary>;
  clearLibrary(): Promise<void>;
}
