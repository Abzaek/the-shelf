import { validateDocument } from "@/lib/sync/validation";
import { localDatabase } from "./runtime";
import { documentFor, documentId, type SyncType } from "@/lib/sync/documents";
import { storageEvents } from "../events";
export async function listRecords<T>(type: SyncType): Promise<T[]> {
  const local = await localDatabase();
  const docs = await local.documents.records.find({ selector: { type } }).exec();
  return docs.map((doc) => JSON.parse(doc.payload) as T);
}
export async function getRecord<T>(type: SyncType, key: string): Promise<T | undefined> {
  const local = await localDatabase();
  const doc = await local.documents.records.findOne(documentId(type, key)).exec();
  return doc ? (JSON.parse(doc.payload) as T) : undefined;
}
export async function putRecord<T>(type: SyncType, key: string, value: T, bookId = ""): Promise<T> {
  const local = await localDatabase();
  await local.documents.records.incrementalUpsert(
    validateDocument(documentFor(type, key, value, bookId)),
  );
  notify(type, bookId || key);
  return value;
}
export async function editRecord<T>(
  type: SyncType,
  key: string,
  edit: (value: T) => T,
): Promise<T> {
  const local = await localDatabase();
  const doc = await local.documents.records.findOne(documentId(type, key)).exec();
  if (!doc) throw new Error("This item is no longer in your library.");
  const result = await doc.incrementalModify((current) =>
    validateDocument({ ...current, payload: JSON.stringify(edit(JSON.parse(current.payload))) }),
  );
  notify(type, doc.bookId || key);
  return JSON.parse(result.payload) as T;
}
export async function removeRecord(type: SyncType, key: string): Promise<void> {
  const local = await localDatabase();
  const doc = await local.documents.records.findOne(documentId(type, key)).exec();
  if (doc) await doc.incrementalRemove();
  notify(type, doc?.bookId || key);
}
export function notify(type: SyncType, id?: string) {
  const topics = {
    book: "books",
    bookmark: "bookmarks",
    note: "notes",
    collection: "collections",
    membership: "collections",
    settings: "settings",
  } as const;
  storageEvents.emit(topics[type], id);
}
