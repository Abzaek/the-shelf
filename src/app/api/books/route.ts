import { getDb } from "@/server/db";
import { env } from "@/server/env";
import { z } from "zod";
import { books } from "@/server/repo";
import { assertCommittedQuota, assertQuota, bookFilePath, coverPath, removeFile, writeBuffer, writeStream } from "@/server/files";
import { handler, HttpError, json, requireUser } from "@/server/http";
import { createId } from "@/lib/utils/id";
import { READING_STATUSES, type ReadingStatus } from "@/types";

export const GET = handler(async () => {
  const user = await requireUser();
  return json({ books: books.list(user.id) });
});

const metaSchema = z.object({
  format: z.enum(["pdf", "epub"]),
  title: z.string().trim().min(1).max(300),
  author: z.string().trim().max(300).default(""),
  description: z.string().trim().max(5000).default(""),
  category: z.string().trim().max(80).default("Other"),
  tags: z.array(z.string().trim().max(60)).max(50).default([]),
  status: z.enum(READING_STATUSES as [ReadingStatus, ...ReadingStatus[]]),
  totalPages: z.number().int().min(0).default(0),
  currentPage: z.number().int().min(1).optional(),
  fileName: z.string().trim().max(300),
  coverKind: z.enum(["custom", "generated", "none"]).default("none"),
  /** Importing a backup keeps ids and history. */
  id: z.string().regex(/^[a-zA-Z0-9-]{1,64}$/).optional(),
  lastOpenedAt: z.string().nullable().optional(),
  finishedAt: z.string().nullable().optional(),
  currentCfi: z.string().nullable().optional(),
});

/**
 * Create a book. multipart/form-data with fields:
 *   meta  — JSON (metaSchema)
 *   file  — the PDF/EPUB (required)
 *   cover — optional JPEG/PNG
 */
export const POST = handler(async (request) => {
  const user = await requireUser();
  const form = await request.formData();
  const metaRaw = form.get("meta");
  const file = form.get("file");
  const cover = form.get("cover");
  if (typeof metaRaw !== "string") throw new HttpError(400, "Missing book metadata.");
  if (!(file instanceof Blob)) throw new HttpError(400, "Missing book file.");
  if (cover !== null && !(cover instanceof Blob)) throw new HttpError(400, "Invalid cover.");
  let metaJson: unknown;
  try {
    metaJson = JSON.parse(metaRaw);
  } catch {
    throw new HttpError(400, "Invalid book metadata.");
  }
  const parsed = metaSchema.safeParse(metaJson);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => i.message).join("; "));
  const meta = parsed.data;
  if (meta.id && books.get(user.id, meta.id)) throw new HttpError(409, "A book with that id already exists.");

  if (cover && cover.size > 5 * 1024 ** 2) throw new HttpError(413, "Cover must be smaller than 5 MB.");
  if (file.size > env.maxUploadBytes) throw new HttpError(413, "File exceeds the upload limit.");
  const coverBytes = cover ? new Uint8Array(await cover.arrayBuffer()) : null;
  await assertQuota(user.id, user.quotaBytes, file.size + (coverBytes?.byteLength ?? 0));

  const id = meta.id ?? createId();
  const filePath = bookFilePath(user.id, id, meta.format);
  try {
    const written = await writeStream(filePath, file.stream(), file.size);
    if (coverBytes) await writeBuffer(coverPath(user.id, id), coverBytes);
    let book = getDb().transaction(() => {
      assertCommittedQuota(user.id, user.quotaBytes, written + (coverBytes?.byteLength ?? 0));
      return books.create(user.id, {
        ...meta,
        id,
        fileSize: written,
        coverKind: coverBytes ? (meta.coverKind === "custom" ? "custom" : "generated") : "none",
        coverSize: coverBytes?.byteLength ?? 0,
      });
    })();
    // Backup imports carry their own history.
    if (meta.currentCfi !== undefined || meta.lastOpenedAt !== undefined || meta.finishedAt !== undefined) {
      book =
        books.update(user.id, id, {
          ...(meta.currentCfi !== undefined ? { currentCfi: meta.currentCfi } : {}),
          ...(meta.lastOpenedAt !== undefined ? { lastOpenedAt: meta.lastOpenedAt } : {}),
          ...(meta.finishedAt !== undefined ? { finishedAt: meta.finishedAt } : {}),
        }) ?? book;
    }
    return json({ book }, { status: 201 });
  } catch (err) {
    await removeFile(filePath);
    await removeFile(coverPath(user.id, id));
    throw err;
  }
});
