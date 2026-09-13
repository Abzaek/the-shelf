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

export interface Book {
  id: string;
  title: string;
  author: string;
  description: string;
  category: string;
  tags: string[];
  status: ReadingStatus;
  /** Key into the covers blob store, or null when no cover exists yet. */
  coverId: string | null;
  coverKind: "custom" | "generated" | "none";
  /** Key into the pdfs blob store. */
  pdfId: string;
  pdfName: string;
  pdfSize: number;
  totalPages: number;
  currentPage: number;
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
  | "pdfId"
  | "pdfName"
  | "pdfSize"
  | "createdAt"
  | "updatedAt"
  | "lastOpenedAt"
  | "finishedAt"
  | "progress"
  | "currentPage"
> & {
  pdf: Blob;
  pdfName: string;
  cover?: Blob | null;
  coverKind?: Book["coverKind"];
  currentPage?: number;
};

export interface Bookmark {
  id: string;
  bookId: string;
  page: number;
  label: string;
  createdAt: string;
}

export interface Note {
  id: string;
  bookId: string;
  page: number;
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
}

export interface LibraryStats {
  total: number;
  reading: number;
  finished: number;
  wantToRead: number;
}

/** Versioned backup format — library-backup-v1.json */
export interface LibraryBackupV1 {
  format: "the-shelf-library";
  version: 1;
  exportedAt: string;
  books: Book[];
  bookmarks: Bookmark[];
  notes: Note[];
  collections: Collection[];
  settings: Settings;
  /** Present when PDFs/covers were exported alongside (zip). */
  includesFiles: boolean;
}

export interface ImportSummary {
  booksAdded: number;
  booksSkipped: number;
  booksWithoutPdf: number;
  bookmarksAdded: number;
  notesAdded: number;
  collectionsAdded: number;
}
