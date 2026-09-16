import type { BookStorage } from "../bookStorage";
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
import { clamp, computeProgress } from "@/lib/utils/format";
import { getRecord, listRecords, putRecord, editRecord, removeRecord } from "./records";
import { readAsset, replaceAsset, saveAsset } from "./assets";
import { deviceId, localDatabase } from "./runtime";
import { importLocalBackup } from "./backup";
const timestamp = () => new Date().toISOString();
type Membership = { bookId: string; collectionId: string };
export class LocalBookStorage implements BookStorage {
  async addBook(input: NewBookInput): Promise<Book> {
    const id = crypto.randomUUID(),
      fileRevision = crypto.randomUUID(),
      coverRevision = crypto.randomUUID(),
      now = timestamp();
    await saveAsset(id, "file", fileRevision, input.file);
    if (input.cover) await saveAsset(id, "cover", coverRevision, input.cover);
    const currentPage =
      input.status === "finished"
        ? Math.max(1, input.totalPages)
        : clamp(input.currentPage ?? 1, 1, Math.max(1, input.totalPages));
    const book: Book = {
      id,
      format: input.format,
      title: input.title,
      author: input.author,
      description: input.description,
      category: input.category,
      tags: input.tags,
      status: input.status,
      totalPages: input.totalPages,
      currentPage,
      currentCfi: null,
      coverId: input.cover ? id : null,
      coverKind: input.cover ? (input.coverKind ?? "generated") : "none",
      fileId: id,
      fileName: input.fileName,
      fileSize: input.file.size,
      fileSource: "hosted",
      fileRevision,
      coverRevision,
      progress: input.status === "finished" ? 100 : computeProgress(currentPage, input.totalPages),
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: null,
      finishedAt: input.status === "finished" ? now : null,
      readingPositions: {},
    };
    return putRecord("book", id, book);
  }
  getBooks() {
    return listRecords<Book>("book");
  }
  getBook(id: string) {
    return getRecord<Book>("book", id);
  }
  updateBook(id: string, patch: Partial<Omit<Book, "id" | "createdAt">>) {
    return editRecord<Book>("book", id, (old) => {
      const next = { ...old, ...patch, id, createdAt: old.createdAt, updatedAt: timestamp() };
      if (patch.status && patch.status !== old.status) {
        if (patch.status === "finished") {
          next.progress = 100;
          next.finishedAt = timestamp();
          next.currentPage = Math.max(1, next.totalPages);
        } else {
          next.finishedAt = null;
          if (old.status === "finished") {
            next.currentPage = 1;
            next.currentCfi = null;
            next.progress = 0;
          }
        }
      }
      return next;
    });
  }
  async deleteBook(id: string) {
    // Tombstone children first. Keep bytes until deletion is acknowledged by the server.
    for (const type of ["bookmark", "note"] as const) {
      for (const record of await listRecords<Bookmark | Note>(type))
        if (record.bookId === id) await removeRecord(type, record.id);
    }
    for (const membership of await listRecords<Membership>("membership"))
      if (membership.bookId === id)
        await removeRecord("membership", `${membership.collectionId}|${id}`);
    await removeRecord("book", id);
  }
  saveProgress(id: string, progress: ReadingProgressUpdate) {
    const device = deviceId();
    return editRecord<Book>("book", id, (old) => {
      const totalPages = progress.totalPages || old.totalPages;
      const currentPage = clamp(progress.currentPage, 1, Math.max(1, totalPages));
      const currentCfi = progress.currentCfi === undefined ? old.currentCfi : progress.currentCfi;
      const now = timestamp();
      return {
        ...old,
        totalPages,
        currentPage,
        currentCfi,
        progress: old.status === "finished" ? 100 : computeProgress(currentPage, totalPages),
        status: old.status === "want-to-read" ? "reading" : old.status,
        lastOpenedAt: now,
        updatedAt: now,
        readingPositions: {
          ...old.readingPositions,
          [device]: { totalPages, currentPage, currentCfi, updatedAt: now },
        },
      };
    });
  }
  getFile(id: string) {
    return readAsset(id, "file");
  }
  fileUrl(id: string) {
    return `/api/books/${id}/file`;
  }
  setFile(id: string, file: Blob, fileName: string, totalPages: number) {
    return replaceAsset(id, "file", file, {
      fileName,
      fileSize: file.size,
      totalPages,
      fileSource: "hosted",
      driveFileId: undefined,
    });
  }
  getCover(id: string) {
    return readAsset(id, "cover");
  }
  coverUrl(id: string, version?: string) {
    return `/api/books/${id}/cover?v=${encodeURIComponent(version ?? "")}`;
  }
  setCover(id: string, cover: Blob | null, kind: Book["coverKind"]) {
    return replaceAsset(id, "cover", cover, {
      coverId: cover ? id : null,
      coverKind: cover ? kind : "none",
    });
  }
  async getLocations(bookId: string) {
    return (await (await localDatabase()).assets.locations.get(bookId))?.value;
  }
  async setLocations(bookId: string, value: string) {
    await (await localDatabase()).assets.locations.put({ bookId, value });
  }
  addBookmark(bookId: string, page: number, label = "", cfi?: string) {
    const bookmark: Bookmark = {
      id: crypto.randomUUID(),
      bookId,
      page,
      label,
      ...(cfi ? { cfi } : {}),
      createdAt: timestamp(),
    };
    return putRecord("bookmark", bookmark.id, bookmark, bookId);
  }
  removeBookmark(id: string) {
    return removeRecord("bookmark", id);
  }
  async getBookmarks(bookId: string) {
    return (await listRecords<Bookmark>("bookmark"))
      .filter((item) => item.bookId === bookId)
      .sort((a, b) => a.page - b.page);
  }
  addNote(bookId: string, page: number, content: string, cfi?: string) {
    const now = timestamp();
    const note: Note = {
      id: crypto.randomUUID(),
      bookId,
      page,
      content,
      ...(cfi ? { cfi } : {}),
      createdAt: now,
      updatedAt: now,
      conflictCopies: [],
    };
    return putRecord("note", note.id, note, bookId);
  }
  updateNote(id: string, content: string) {
    return editRecord<Note>("note", id, (note) => ({ ...note, content, updatedAt: timestamp() }));
  }
  deleteNote(id: string) {
    return removeRecord("note", id);
  }
  async getNotes(bookId: string) {
    return (await listRecords<Note>("note"))
      .filter((item) => item.bookId === bookId)
      .sort((a, b) => a.page - b.page);
  }
  async getCollections(): Promise<Collection[]> {
    const [collections, memberships] = await Promise.all([
      listRecords<Omit<Collection, "bookIds">>("collection"),
      listRecords<Membership>("membership"),
    ]);
    return collections.map((collection) => ({
      ...collection,
      bookIds: memberships
        .filter((item) => item.collectionId === collection.id)
        .map((item) => item.bookId),
    }));
  }
  async createCollection(name: string, description = ""): Promise<Collection> {
    const collection = { id: crypto.randomUUID(), name, description, createdAt: timestamp() };
    await putRecord("collection", collection.id, collection);
    return { ...collection, bookIds: [] };
  }
  async updateCollection(
    id: string,
    patch: Partial<Omit<Collection, "id" | "createdAt">>,
  ): Promise<Collection> {
    const { bookIds, ...meta } = patch;
    await editRecord<Omit<Collection, "bookIds">>("collection", id, (collection) => ({
      ...collection,
      ...meta,
    }));
    if (bookIds) {
      const current = (await listRecords<Membership>("membership")).filter(
        (item) => item.collectionId === id,
      );
      for (const item of current)
        if (!bookIds.includes(item.bookId))
          await removeRecord("membership", `${id}|${item.bookId}`);
      for (const bookId of bookIds)
        await putRecord("membership", `${id}|${bookId}`, { collectionId: id, bookId }, bookId);
    }
    return (await this.getCollections()).find((collection) => collection.id === id)!;
  }
  async deleteCollection(id: string) {
    for (const item of await listRecords<Membership>("membership"))
      if (item.collectionId === id) await removeRecord("membership", `${id}|${item.bookId}`);
    await removeRecord("collection", id);
  }
  async setBookCollections(bookId: string, collectionIds: string[]) {
    const existing = (await listRecords<Membership>("membership")).filter(
      (item) => item.bookId === bookId,
    );
    for (const item of existing)
      if (!collectionIds.includes(item.collectionId))
        await removeRecord("membership", `${item.collectionId}|${bookId}`);
    for (const collectionId of collectionIds)
      await putRecord("membership", `${collectionId}|${bookId}`, { collectionId, bookId }, bookId);
  }
  async getSettings() {
    return { ...DEFAULT_SETTINGS, ...(await getRecord<Settings>("settings", "default")) };
  }
  async updateSettings(patch: Partial<Settings>) {
    if (!(await getRecord("settings", "default")))
      return putRecord("settings", "default", { ...DEFAULT_SETTINGS, ...patch });
    return editRecord<Settings>("settings", "default", (value) => ({ ...value, ...patch }));
  }
  async exportLibrary(): Promise<LibraryBackup> {
    const [books, bookmarks, notes, collections, settings] = await Promise.all([
      this.getBooks(),
      listRecords<Bookmark>("bookmark"),
      listRecords<Note>("note"),
      this.getCollections(),
      this.getSettings(),
    ]);
    return {
      format: "the-shelf-library",
      version: 2,
      exportedAt: timestamp(),
      books,
      bookmarks,
      notes,
      collections,
      settings,
      includesFiles: false,
    };
  }
  importLibrary(
    backup: LibraryBackup | LibraryBackupV1,
    files: { files: Map<string, Blob>; covers: Map<string, Blob> },
  ): Promise<ImportSummary> {
    return importLocalBackup(this, backup, files);
  }
  async clearLibrary() {
    for (const book of await this.getBooks()) await this.deleteBook(book.id);
    for (const collection of await this.getCollections())
      await this.deleteCollection(collection.id);
  }
}
