import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Server } from "@tus/server";
import { FileStore } from "@tus/file-store";
import { getDb, now } from "@/server/db";
import { env } from "@/server/env";
import { books } from "@/server/repo";
import { userDir, userUsage, assertQuota } from "@/server/files";
import { HttpError } from "@/server/http";
import { requireDeviceUser } from "./security";
import { captureLibrary } from "./store";

type UploadRow = {
  id: string;
  user_id: string;
  book_id: string;
  kind: "file" | "cover";
  revision: string;
  size: number;
  completed: number;
};
const safe = /^[a-zA-Z0-9-]{1,64}$/;
export function assetPath(
  userId: string,
  bookId: string,
  kind: "file" | "cover",
  revision: string,
) {
  if (!safe.test(bookId) || !safe.test(revision))
    throw new HttpError(400, "Invalid file identifier.");
  return path.join(/* turbopackIgnore: true */ userDir(userId), `${bookId}.${revision}.${kind}`);
}
export function assetState(userId: string, bookId: string) {
  const row = getDb()
    .prepare("SELECT sync_extra,file_size,cover_size FROM books WHERE user_id=? AND id=?")
    .get(userId, bookId) as
    { sync_extra: string; file_size: number; cover_size: number } | undefined;
  return row ? { ...row, extra: JSON.parse(row.sync_extra) as Record<string, unknown> } : null;
}
export function finishUpload(userId: string, id: string): void {
  const db = getDb();
  db.transaction(() => {
    const row = db
      .prepare("SELECT * FROM file_uploads WHERE id=? AND user_id=?")
      .get(id, userId) as UploadRow | undefined;
    if (!row) throw new HttpError(404, "Upload not found.");
    if (row.completed) return;
    const book = books.get(userId, row.book_id),
      state = assetState(userId, row.book_id);
    if (!book || !state) throw new HttpError(404, "This book was deleted.");
    const revision = row.kind === "file" ? book.fileRevision : book.coverRevision;
    if (revision !== row.revision) throw new HttpError(409, "A newer file replaced this upload.");
    const source = path.join(env.dataDir, "uploads", id);
    const destination = assetPath(userId, row.book_id, row.kind, row.revision);
    const actual = fs.existsSync(source)
      ? fs.statSync(source).size
      : fs.existsSync(/* turbopackIgnore: true */ destination)
        ? fs.statSync(/* turbopackIgnore: true */ destination).size
        : -1;
    if (actual !== row.size) throw new HttpError(409, "The upload is incomplete.");
    const quota =
      (
        db.prepare("SELECT quota_bytes FROM users WHERE id=?").get(userId) as {
          quota_bytes: number | null;
        }
      ).quota_bytes ?? env.userQuotaBytes;
    const usage = userUsage(userId, quota);
    const previous = row.kind === "file" ? state.file_size : state.cover_size;
    if (
      usage.usedBytes - previous + row.size > quota ||
      usage.totalUsedBytes - previous + row.size > env.totalQuotaBytes
    )
      throw new HttpError(
        413,
        "Storage allowance exceeded. Your local file is still safe on this device.",
      );
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    if (fs.existsSync(source)) fs.renameSync(source, destination);
    const extra = {
      ...state.extra,
      [row.kind === "file" ? "uploadedFileRevision" : "uploadedCoverRevision"]: row.revision,
    };
    const column = row.kind === "file" ? "file_size" : "cover_size";
    db.prepare(`UPDATE books SET ${column}=?,sync_extra=? WHERE user_id=? AND id=?`).run(
      row.size,
      JSON.stringify(extra),
      userId,
      row.book_id,
    );
    db.prepare("UPDATE file_uploads SET completed=1 WHERE id=?").run(id);
    captureLibrary(userId);
  })();
}
let server: Server | undefined;
export function uploadServer(): Server {
  if (server) return server;
  server = new Server({
    path: "/api/uploads",
    relativeLocation: true,
    datastore: new FileStore({
      directory: path.join(env.dataDir, "uploads"),
      expirationPeriodInMilliseconds: 7 * 86400000,
    }),
    maxSize: env.maxUploadBytes,
    onIncomingRequest: async (request, id) => {
      const user = await requireDeviceUser(request);
      if (
        request.method !== "POST" &&
        id &&
        !getDb().prepare("SELECT id FROM file_uploads WHERE id=? AND user_id=?").get(id, user.id)
      )
        throw new HttpError(404, "Upload not found.");
    },
    onUploadCreate: async (request, upload) => {
      const user = await requireDeviceUser(request);
      const { bookId, kind, revision } = upload.metadata ?? {};
      if (
        !bookId ||
        !revision ||
        !safe.test(bookId) ||
        !safe.test(revision) ||
        !["file", "cover"].includes(kind ?? "") ||
        !upload.size
      )
        throw new HttpError(400, "Invalid upload metadata.");
      const book = books.get(user.id, bookId);
      if (!book) throw new HttpError(409, "Sync the book's details before uploading its file.");
      if (revision !== (kind === "file" ? book.fileRevision : book.coverRevision))
        throw new HttpError(409, "This file was replaced by a newer version.");
      if (kind === "cover" && upload.size > 5 * 1024 ** 2)
        throw new HttpError(413, "Covers must be smaller than 5 MB.");
      if (kind === "file" && upload.size !== book.fileSize)
        throw new HttpError(400, "File length does not match its metadata.");
      await assertQuota(user.id, user.quotaBytes, 0);
      getDb().transaction(() => {
        const state = assetState(user.id, bookId)!;
        const previous = kind === "file" ? state.file_size : state.cover_size;
        const growth = Math.max(0, upload.size! - previous);
        const reserved = getDb()
          .prepare(
            "SELECT COALESCE(SUM(growth),0) AS total,COALESCE(SUM(CASE WHEN user_id=? THEN growth ELSE 0 END),0) AS mine FROM file_uploads WHERE completed=0",
          )
          .get(user.id) as { total: number; mine: number };
        const usage = userUsage(user.id, user.quotaBytes);
        if (
          usage.usedBytes + reserved.mine + growth > user.quotaBytes ||
          usage.totalUsedBytes + reserved.total + growth > env.totalQuotaBytes
        )
          throw new HttpError(
            413,
            "Not enough hosted space. Remove a hosted book or keep this file on this device until space is available.",
          );
        getDb()
          .prepare(
            "INSERT INTO file_uploads(id,user_id,book_id,kind,revision,size,growth,created_at) VALUES(?,?,?,?,?,?,?,?)",
          )
          .run(upload.id, user.id, bookId, kind, revision, upload.size, growth, now());
      })();
      return { metadata: { bookId, kind, revision } };
    },
    onResponseError: (_request, error) =>
      error instanceof HttpError ? { status_code: error.status, body: error.message } : undefined,
  });
  return server;
}
