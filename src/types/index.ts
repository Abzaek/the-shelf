export type ReadingStatus = "want-to-read" | "reading" | "finished" | "paused";

export const READING_STATUSES: ReadingStatus[] = [
  "want-to-read",
  "reading",
  "paused",
  "finished",
];

export const STATUS_LABELS: Record<ReadingStatus, string> = {
  "want-to-read": "Want to Read",
  reading: "Reading",
  paused: "Paused",
  finished: "Finished",
};

export const DEFAULT_CATEGORIES = [
  "Psychology",
  "Persuasion",
  "Finance",
  "Business",
  "History",
  "Philosophy",
  "Other",
] as const;

export type BookFormat = "pdf" | "epub";

export const FORMAT_LABELS: Record<BookFormat, string> = { pdf: "PDF", epub: "EPUB" };

/** Accepted upload types per format. */
export const FORMAT_ACCEPT: Record<BookFormat, { mime: string[]; ext: string }> = {
  pdf: { mime: ["application/pdf"], ext: ".pdf" },
  epub: { mime: ["application/epub+zip", "application/epub"], ext: ".epub" },
};

export interface ReadingPosition {
  currentPage: number;
  totalPages: number;
  currentCfi: string | null;
  updatedAt: string;
}

export interface Book {
  fileSource?: "hosted" | "drive";
  driveFileId?: string;
  fileRevision?: string;
  coverRevision?: string;
  readingPositions?: Record<string, ReadingPosition>;
  id: string;
  format: BookFormat;
  title: string;
  author: string;
  description: string;
  category: string;
  tags: string[];
  status: ReadingStatus;
  /** Key into the covers blob store, or null when no cover exists yet. */
  coverId: string | null;
  coverKind: "custom" | "generated" | "none";
  /** Key into the files blob store (PDF or EPUB). */
  fileId: string;
  fileName: string;
  fileSize: number;
  /** PDF: page count. EPUB: number of generated locations (0 until first open). */
  totalPages: number;
  /** PDF: 1-based page. EPUB: 1-based location index. */
  currentPage: number;
  /** EPUB only: exact CFI to resume from. */
  currentCfi: string | null;
  /** 0–100 */
  progress: number;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
  finishedAt: string | null;
}

export type NewBookInput = Omit<
  Book,
  | "id"
  | "coverId"
  | "coverKind"
  | "fileId"
  | "fileName"
  | "fileSize"
  | "currentCfi"
  | "createdAt"
  | "updatedAt"
  | "lastOpenedAt"
  | "finishedAt"
  | "progress"
  | "currentPage"
> & {
  file: Blob;
  fileName: string;
  cover?: Blob | null;
  coverKind?: Book["coverKind"];
  currentPage?: number;
};

export interface Bookmark {
  id: string;
  bookId: string;
  /** PDF page or EPUB location index (1-based). */
  page: number;
  /** EPUB only: exact CFI. */
  cfi?: string;
  label: string;
  createdAt: string;
}

export interface Note {
  /** Exact concurrent edits, retained until the reader explicitly resolves them. */
  conflictCopies?: string[];
  id: string;
  bookId: string;
  page: number;
  cfi?: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface Collection {
  id: string;
  name: string;
  description: string;
  bookIds: string[];
  createdAt: string;
}

export type ThemePreference = "light" | "dark" | "system";
export type ReadingMode = "single" | "continuous";
export type ZoomPreset = "fit-width" | "fit-page" | number;

export interface Settings {
  theme: ThemePreference;
  defaultZoom: ZoomPreset;
  defaultReadingMode: ReadingMode;
  rememberLastPage: boolean;
  customCategories: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  defaultZoom: "fit-width",
  defaultReadingMode: "single",
  rememberLastPage: true,
  customCategories: [],
};

export interface ReadingProgressUpdate {
  currentPage: number;
  totalPages: number;
  currentCfi?: string | null;
}

export interface LibraryStats {
  total: number;
  reading: number;
  finished: number;
  wantToRead: number;
}

/** Versioned backup format — library-backup-v2.json (v1 files are still importable). */
export interface LibraryBackup {
  format: "the-shelf-library";
  version: 2;
  exportedAt: string;
  books: Book[];
  bookmarks: Bookmark[];
  notes: Note[];
  collections: Collection[];
  settings: Settings;
  /** Present when book files/covers were exported alongside (zip). */
  includesFiles: boolean;
}

/** Shape of the original v1 export, accepted by the importer. */
export type LibraryBackupV1 = Omit<LibraryBackup, "version" | "books"> & {
  version: 1;
  books: Array<Omit<Book, "format" | "fileId" | "fileName" | "fileSize" | "currentCfi"> & {
    pdfId: string;
    pdfName: string;
    pdfSize: number;
  }>;
};

export interface ImportSummary {
  booksAdded: number;
  booksSkipped: number;
  booksWithoutFile: number;
  bookmarksAdded: number;
  notesAdded: number;
  collectionsAdded: number;
}
