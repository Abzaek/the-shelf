import { replaceLegacyAsset } from "@/server/sync/legacy-assets";
import { assetPath, assetState } from "@/server/sync/uploads";
import { driveFileResponse } from "@/server/drive/client";
import { books } from "@/server/repo";
import { bookFilePath, fileResponse } from "@/server/files";
import { handler, HttpError, json, requireUser, type RouteParams } from "@/server/http";

const MIME = { pdf: "application/pdf", epub: "application/epub+zip" } as const;

export const GET = handler(async (request, { params }: RouteParams<"id">) => {
  const user = await requireUser();
  const { id } = await params;
  const book = books.get(user.id, id);
  if (request.headers.has("x-shelf-user") && request.headers.get("x-shelf-user") !== user.id) throw new HttpError(401, "Account changed.");
  if (!book || !book.fileSize) throw new HttpError(404, "File not found.");
  const revision = new URL(request.url).searchParams.get("revision");
  if (revision && revision !== book.fileRevision) throw new HttpError(409, "The file changed. Sync and retry.");
  if (book.fileSource === "drive" && book.driveFileId) return driveFileResponse(user.id, book.driveFileId, request.headers.get("range"));
  const state = assetState(user.id, id);
  if (book.fileRevision !== "legacy" && state?.extra.uploadedFileRevision !== book.fileRevision) throw new HttpError(404, "This file has not finished uploading.");
  const wantsDownload = new URL(request.url).searchParams.has("download");
  const download = wantsDownload ? book.fileName || `${book.title}.${book.format}` : undefined;
  return fileResponse(book.fileRevision && book.fileRevision !== "legacy" ? assetPath(user.id, id, "file", book.fileRevision) : bookFilePath(user.id, id, book.format), MIME[book.format], request.headers.get("range"), download);
});

/** Replace (or attach) the book file. Body is the raw file; headers carry name and page count. */
export const PUT = handler(async (request, { params }: RouteParams<"id">) => {
  const user = await requireUser();
  const { id } = await params;
  const book = books.get(user.id, id);
  if (!book) throw new HttpError(404, "Book not found.");
  if (!request.body) throw new HttpError(400, "Missing file body.");
  const fileName = decodeURIComponent(request.headers.get("x-file-name") ?? "") || book.fileName;
  const totalPages = Number(request.headers.get("x-total-pages") ?? "0") || 0;
  if (!Number.isSafeInteger(totalPages) || totalPages < 0 || fileName.length > 300) throw new HttpError(400, "Invalid file metadata.");
  return json({ book: await replaceLegacyAsset(user.id, user.quotaBytes, id, "file", request.body, { fileName, totalPages }) });
});
