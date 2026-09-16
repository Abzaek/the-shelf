import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/server/db";
import { env } from "@/server/env";
import { books } from "@/server/repo";
import { assertCommittedQuota, assertQuota, removeFile, writeStream } from "@/server/files";
import { HttpError } from "@/server/http";
import { assetPath, assetState } from "./uploads";
import { captureLibrary } from "./store";

/** Compatibility writes publish immutable revisions, just like resumable uploads. */
export async function replaceLegacyAsset(
  userId: string,
  quota: number,
  bookId: string,
  kind: "file" | "cover",
  body: ReadableStream<Uint8Array>,
  metadata: { fileName?: string; totalPages?: number; coverKind?: "generated" | "custom" },
) {
  if (!books.get(userId, bookId)) throw new HttpError(404, "Book not found.");
  await assertQuota(userId, quota, 0);
  const revision = randomUUID(),
    target = assetPath(userId, bookId, kind, revision);
  try {
    const size = await writeStream(
      target,
      body,
      kind === "cover" ? 5 * 1024 ** 2 : Math.min(quota, env.maxUploadBytes),
    );
    if (!size) throw new HttpError(400, "Empty file.");
    return getDb().transaction(() => {
      const current = books.get(userId, bookId),
        state = assetState(userId, bookId);
      if (!current || !state) throw new HttpError(404, "Book not found.");
      const previous =
        kind === "cover" ? state.cover_size : current.fileSource === "drive" ? 0 : state.file_size;
      assertCommittedQuota(userId, quota, size - previous);
      const extra = { ...state.extra };
      if (kind === "file") {
        books.setFile(
          userId,
          bookId,
          metadata.fileName || current.fileName,
          size,
          metadata.totalPages ?? 0,
        );
        Object.assign(extra, {
          fileSource: "hosted",
          fileRevision: revision,
          uploadedFileRevision: revision,
          expectedFileSize: size,
        });
        delete extra.driveFileId;
      } else {
        books.setCover(userId, bookId, metadata.coverKind ?? "custom", size);
        Object.assign(extra, { coverRevision: revision, uploadedCoverRevision: revision });
      }
      getDb()
        .prepare("UPDATE books SET sync_extra=? WHERE user_id=? AND id=?")
        .run(JSON.stringify(extra), userId, bookId);
      captureLibrary(userId);
      return books.get(userId, bookId)!;
    })();
  } catch (error) {
    await removeFile(target);
    throw error;
  }
}
export function removeLegacyCover(userId: string, bookId: string) {
  return getDb().transaction(() => {
    const state = assetState(userId, bookId);
    if (!state) throw new HttpError(404, "Book not found.");
    books.setCover(userId, bookId, "none", 0);
    const extra = { ...state.extra, coverRevision: randomUUID() };
    getDb()
      .prepare("UPDATE books SET sync_extra=? WHERE user_id=? AND id=?")
      .run(JSON.stringify(extra), userId, bookId);
    captureLibrary(userId);
    return books.get(userId, bookId)!;
  })();
}
