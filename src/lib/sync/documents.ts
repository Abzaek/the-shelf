/** Versioned wire contract. No browser, React, or server imports in this module. */
export const SYNC_VERSION = 1;
export const SYNC_TYPES = [
  "book",
  "bookmark",
  "note",
  "collection",
  "membership",
  "settings",
] as const;
export type SyncType = (typeof SYNC_TYPES)[number];
export interface SyncDocument {
  id: string;
  type: SyncType;
  key: string;
  bookId: string;
  payload: string;
  _deleted: boolean;
}
export interface SyncCheckpoint {
  sequence: number;
}
export interface SyncWrite {
  newDocumentState: SyncDocument;
  assumedMasterState?: SyncDocument;
}
export const documentId = (type: SyncType, key: string) => `${type}|${key}`;
export function documentFor(
  type: SyncType,
  key: string,
  value: unknown,
  bookId = "",
): SyncDocument {
  return {
    id: documentId(type, key),
    type,
    key,
    bookId,
    payload: JSON.stringify(value),
    _deleted: false,
  };
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function sameDocument(a: SyncDocument, b: SyncDocument): boolean {
  return (
    a.id === b.id &&
    a.type === b.type &&
    a.key === b.key &&
    a.bookId === b.bookId &&
    a._deleted === b._deleted &&
    canonical(JSON.parse(a.payload)) === canonical(JSON.parse(b.payload))
  );
}
