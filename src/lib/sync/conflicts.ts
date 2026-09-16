import type { RxConflictHandler, RxConflictHandlerInput } from "rxdb";
import { canonical, sameDocument, type SyncDocument } from "./documents";

/** Three-way field merges: independent edits survive, concurrent scalar edits prefer the server. */
export function resolveDocumentConflict(input: RxConflictHandlerInput<SyncDocument>): SyncDocument {
  const { realMasterState: remote, newDocumentState: local, assumedMasterState: base } = input;
  // Deletion wins, including edits made by a device offline before the deletion.
  if (local.type === "membership" && base?._deleted && remote._deleted && !local._deleted)
    return local;
  if (remote._deleted || local._deleted) return { ...remote, _deleted: true };
  const before = base ? JSON.parse(base.payload) : {};
  const left = JSON.parse(local.payload);
  const right = JSON.parse(remote.payload);
  const merged = { ...right };
  for (const key of Object.keys(left)) {
    if (canonical(right[key]) === canonical(before[key])) merged[key] = left[key];
  }
  if (
    local.type === "note" &&
    left.content !== right.content &&
    left.content !== before.content &&
    right.content !== before.content
  ) {
    // Preserve both exact versions. Do not silently discard a concurrent note edit.
    const variants = new Set<string>([
      ...(left.conflictCopies ?? []),
      ...(right.conflictCopies ?? []),
      left.content,
    ]);
    variants.delete(right.content);
    merged.conflictCopies = [...variants].sort();
  }
  if (local.type === "book") {
    merged.readingPositions = { ...right.readingPositions };
    for (const [device, position] of Object.entries(left.readingPositions ?? {})) {
      if (
        canonical(right.readingPositions?.[device]) === canonical(before.readingPositions?.[device])
      )
        merged.readingPositions[device] = position;
    }
    if (
      right.fileRevision !== before.fileRevision &&
      left.fileRevision !== before.fileRevision &&
      right.fileRevision !== left.fileRevision
    ) {
      for (const key of [
        "fileRevision",
        "fileName",
        "fileSize",
        "fileSource",
        "driveFileId",
        "totalPages",
      ])
        merged[key] = right[key];
    }
    // Resume fields form a unit; never combine a page from one edit with another edit's CFI.
    const keys = ["currentPage", "currentCfi", "progress", "totalPages", "lastOpenedAt"];
    if (keys.some((key) => canonical(right[key]) !== canonical(before[key]))) {
      for (const key of keys) merged[key] = right[key];
    }
  }
  return { ...remote, payload: JSON.stringify(merged) };
}
export const conflictHandler: RxConflictHandler<SyncDocument> = {
  isEqual: sameDocument,
  resolve: async (input) => resolveDocumentConflict(input),
};
