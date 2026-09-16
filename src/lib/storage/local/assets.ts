import { localDatabase } from "./runtime";
import { getRecord, editRecord } from "./records";
import type { Book } from "@/types";
import type { LocalAsset } from "./database";
import { storageEvents } from "../events";
import { ApiError } from "../httpStorage";
export const assetId = (bookId: string, kind: "file" | "cover", revision: string) =>
  `${bookId}|${kind}|${revision}`;
export async function saveAsset(
  bookId: string,
  kind: "file" | "cover",
  revision: string,
  blob: Blob | null,
): Promise<void> {
  const local = await localDatabase();
  await local.assets.persistAsset({
    id: assetId(bookId, kind, revision),
    bookId,
    kind,
    revision,
    blob,
    pending: 1,
  });
}
export async function readAsset(bookId: string, kind: "file" | "cover"): Promise<Blob | undefined> {
  const local = await localDatabase();
  const book = await getRecord<Book>("book", bookId);
  if (!book || (kind === "cover" && !book.coverId)) return undefined;
  const revision = (kind === "file" ? book.fileRevision : book.coverRevision) ?? "legacy";
  const id = assetId(bookId, kind, revision);
  const cached = await local.assets.assets.get(id);
  if (cached) return cached.blob ?? undefined;
  if (!navigator.onLine)
    throw new Error(
      "This book has not been downloaded to this device. Connect to the internet and download it first.",
    );
  const response = await fetch(
    `/api/books/${bookId}/${kind}?revision=${encodeURIComponent(revision)}`,
    { headers: { "X-Shelf-User": local.userId }, cache: "no-store" },
  );
  if (response.status === 404) return undefined;
  if (!response.ok)
    throw new ApiError(
      response.status,
      response.status === 401
        ? "Sign in again to download this book."
        : "Could not download this file. Reconnect Drive if the book is stored there.",
    );
  const blob = await response.blob();
  if (kind === "file" && book.fileSize && blob.size !== book.fileSize)
    throw new Error(
      "The file changed or the download was incomplete. Sync your library and retry.",
    );
  // Never report offline availability before IndexedDB has committed the bytes.
  await local.assets.persistAsset({ id, bookId, kind, revision, blob, pending: 0 });
  storageEvents.emit("downloads", bookId);
  return blob;
}
export async function isDownloaded(book: Book): Promise<boolean> {
  const local = await localDatabase();
  return !!(await local.assets.assets.get(assetId(book.id, "file", book.fileRevision ?? "legacy")))
    ?.blob;
}
export async function removeDownload(book: Book): Promise<void> {
  const local = await localDatabase();
  const rows = await local.assets.assets.where("bookId").equals(book.id).toArray();
  if (rows.some((row) => row.pending))
    throw new Error(
      "Sync this book before removing its download. It contains files saved only on this device.",
    );
  await local.assets.assets.bulkDelete(rows.map((row) => row.id));
  storageEvents.emit("downloads", book.id);
  storageEvents.emit("covers", book.id);
}
export async function replaceAsset(
  bookId: string,
  kind: "file" | "cover",
  blob: Blob | null,
  patch: Partial<Book>,
): Promise<Book> {
  const revision = crypto.randomUUID();
  await saveAsset(bookId, kind, revision, blob);
  const book = await editRecord<Book>("book", bookId, (old) => ({
    ...old,
    ...patch,
    [kind === "file" ? "fileRevision" : "coverRevision"]: revision,
    updatedAt: new Date().toISOString(),
  }));
  storageEvents.emit("covers", bookId);
  storageEvents.emit("downloads", bookId);
  return book;
}
export async function discardObsoleteAssets(
  local: Awaited<ReturnType<typeof localDatabase>>,
  book: Book,
): Promise<void> {
  const rows: LocalAsset[] = await local.assets.assets.where("bookId").equals(book.id).toArray();
  await local.assets.assets.bulkDelete(
    rows
      .filter(
        (row) =>
          !row.pending &&
          row.revision !== (row.kind === "file" ? book.fileRevision : book.coverRevision),
      )
      .map((row) => row.id),
  );
}

/** Recovery copies are files superseded by a concurrent edit; never silently throw them away. */
export async function recoveryFiles() {
  const local = await localDatabase();
  const records = await local.documents.records.find({ selector: { type: "book" } }).exec();
  const books = new Map(
    records.map((doc) => {
      const book = JSON.parse(doc.payload) as Book;
      return [book.id, book] as const;
    }),
  );
  return (await local.assets.assets.where("pending").equals(1).toArray())
    .filter((asset) => {
      const book = books.get(asset.bookId);
      return (
        !!asset.blob &&
        !!book &&
        asset.revision !== (asset.kind === "file" ? book.fileRevision : book.coverRevision)
      );
    })
    .map((asset) => ({
      id: asset.id,
      blob: asset.blob!,
      name:
        asset.kind === "cover"
          ? "preserved-cover.jpg"
          : (books.get(asset.bookId)?.fileName ?? "preserved-book"),
      title: books.get(asset.bookId)?.title ?? "Preserved file",
    }));
}
export async function removeRecoveryFile(id: string) {
  const files = await recoveryFiles();
  if (!files.some((file) => file.id === id))
    throw new Error("This file is still needed by your library.");
  await (await localDatabase()).assets.assets.delete(id);
}
