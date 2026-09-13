import { books } from "@/server/repo";
import { assertQuota, bookFilePath, fileResponse, writeStream } from "@/server/files";
import { handler, HttpError, json, requireUser, type RouteParams } from "@/server/http";

const MIME = { pdf: "application/pdf", epub: "application/epub+zip" } as const;

export const GET = handler(async (request, { params }: RouteParams<"id">) => {
  const user = await requireUser();
  const { id } = await params;
  const book = books.get(user.id, id);
  if (!book || !book.fileSize) throw new HttpError(404, "File not found.");
  const wantsDownload = new URL(request.url).searchParams.has("download");
  const download = wantsDownload ? book.fileName || `${book.title}.${book.format}` : undefined;
  return fileResponse(bookFilePath(user.id, id, book.format), MIME[book.format], request.headers.get("range"), download);
});

/** Replace (or attach) the book file. Body is the raw file; headers carry name and page count. */
export const PUT = handler(async (request, { params }: RouteParams<"id">) => {
  const user = await requireUser();
  const { id } = await params;
  const book = books.get(user.id, id);
  if (!book) throw new HttpError(404, "Book not found.");
  if (!request.body) throw new HttpError(400, "Missing file body.");
  const declared = Number(request.headers.get("content-length") ?? "0");
  const fileName = decodeURIComponent(request.headers.get("x-file-name") ?? "") || book.fileName;
  const totalPages = Number(request.headers.get("x-total-pages") ?? "0") || 0;
  await assertQuota(user.id, user.quotaBytes, Math.max(0, declared - book.fileSize));
  const written = await writeStream(bookFilePath(user.id, id, book.format), request.body, user.quotaBytes);
  return json({ book: books.setFile(user.id, id, fileName, written, totalPages) });
});
