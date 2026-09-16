import { z } from "zod";
import { createHash } from "node:crypto";
import { handler, HttpError, json, readJson } from "@/server/http";
import { requireDeviceUser } from "@/server/sync/security";
import { getDriveFile } from "@/server/drive/client";
import { books } from "@/server/repo";
import { getDb } from "@/server/db";
import { assetState } from "@/server/sync/uploads";
import { captureLibrary } from "@/server/sync/store";
export const POST = handler(async (request) => {
  const user = await requireDeviceUser(request);
  const { fileId } = await readJson(
    request,
    z.object({ fileId: z.string().regex(/^[\w-]{1,200}$/) }),
  );
  const file = await getDriveFile(user.id, fileId);
  const format =
    file.mimeType === "application/pdf"
      ? "pdf"
      : /\.epub$/i.test(file.name) &&
          ["application/epub+zip", "application/octet-stream", "application/zip"].includes(
            file.mimeType,
          )
        ? "epub"
        : null;
  if (!format || file.trashed || !Number(file.size) || Number(file.size) > 1024 ** 3)
    throw new HttpError(400, "Choose an available PDF or EPUB smaller than 1 GB.");
  const book = getDb().transaction(() => {
    let book = books.list(user.id).find((item) => item.driveFileId === file.id);
    if (!book)
      book = books.create(user.id, {
        format,
        title: file.name.replace(/\.(pdf|epub)$/i, "").slice(0, 300),
        author: "",
        description: "",
        category: "Other",
        tags: [],
        status: "want-to-read",
        totalPages: 0,
        fileName: file.name.slice(0, 300),
        fileSize: 0,
        coverKind: "none",
        coverSize: 0,
      });
    const revision = createHash("sha256")
      .update(`${file.id}|${file.modifiedTime}|${file.size}`)
      .digest("hex");
    const extra = {
      ...assetState(user.id, book.id)?.extra,
      fileSource: "drive",
      driveFileId: file.id,
      fileRevision: revision,
      coverRevision: book.coverRevision ?? "legacy",
      readingPositions: book.readingPositions ?? {},
      expectedFileSize: Number(file.size),
    };
    getDb()
      .prepare("UPDATE books SET sync_extra=?,file_name=? WHERE user_id=? AND id=?")
      .run(JSON.stringify(extra), file.name.slice(0, 300), user.id, book.id);
    captureLibrary(user.id);
    return books.get(user.id, book.id)!;
  })();
  return json({ book });
});
