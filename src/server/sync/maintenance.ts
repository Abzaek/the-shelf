import "server-only";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "@/server/db";
import { env } from "@/server/env";
import { userDir, bookFilePath, coverPath } from "@/server/files";
import { books } from "@/server/repo";
import { assetPath, assetState } from "./uploads";
const checked = new Map<string, number>();
/** Bounded per-account cleanup: preserve the previous committed file during a replacement. */
export function maintainFiles(userId: string): void {
  if (Date.now() - (checked.get(userId) ?? 0) < 60000) return;
  checked.set(userId, Date.now());
  const keep = new Set<string>();
  for (const book of books.list(userId)) {
    const state = assetState(userId, book.id)!;
    const file = state.extra.uploadedFileRevision as string | undefined;
    const cover = state.extra.uploadedCoverRevision as string | undefined;
    if (book.fileSource !== "drive")
      keep.add(
        file && file !== "legacy"
          ? assetPath(userId, book.id, "file", file)
          : bookFilePath(userId, book.id, book.format),
      );
    if (book.coverKind !== "none")
      keep.add(
        cover && cover !== "legacy"
          ? assetPath(userId, book.id, "cover", cover)
          : coverPath(userId, book.id),
      );
  }
  const directory = userDir(userId);
  if (fs.existsSync(directory))
    for (const name of fs.readdirSync(directory)) {
      const target = path.join(directory, name);
      if (
        /^[\w-]+\.(?:[\w-]+\.(?:file|cover)|pdf|epub|cover\.jpg)$/.test(name) &&
        !keep.has(target)
      )
        fs.rmSync(target, { force: true });
    }
  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
  const stale = getDb()
    .prepare(
      "SELECT id,book_id,kind,revision,completed,created_at FROM file_uploads WHERE user_id=?",
    )
    .all(userId) as {
    id: string;
    book_id: string;
    kind: string;
    revision: string;
    completed: number;
    created_at: string;
  }[];
  for (const upload of stale) {
    const book = books.get(userId, upload.book_id);
    const obsolete =
      !book ||
      upload.revision !== (upload.kind === "file" ? book.fileRevision : book.coverRevision);
    if (!obsolete && upload.created_at >= cutoff) continue;
    for (const suffix of ["", ".json"])
      fs.rmSync(path.join(env.dataDir, "uploads", upload.id + suffix), { force: true });
    getDb().prepare("DELETE FROM file_uploads WHERE id=? AND user_id=?").run(upload.id, userId);
  }
}

export function removeAccountUploads(userId: string): void {
  const uploads = getDb().prepare("SELECT id FROM file_uploads WHERE user_id=?").all(userId) as {
    id: string;
  }[];
  for (const { id } of uploads)
    for (const suffix of ["", ".json"])
      fs.rmSync(path.join(env.dataDir, "uploads", id + suffix), { force: true });
}
