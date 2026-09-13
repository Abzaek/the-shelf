import { books } from "@/server/repo";
import { assertQuota, coverPath, fileResponse, removeFile, writeBuffer } from "@/server/files";
import { handler, HttpError, json, requireUser, type RouteParams } from "@/server/http";

export const GET = handler(async (request, { params }: RouteParams<"id">) => {
  const user = await requireUser();
  const { id } = await params;
  const book = books.get(user.id, id);
  if (!book || !book.coverId) throw new HttpError(404, "No cover.");
  const res = await fileResponse(coverPath(user.id, id), "image/jpeg", null);
  res.headers.set("Cache-Control", "private, max-age=31536000, immutable");
  return res;
});

export const PUT = handler(async (request, { params }: RouteParams<"id">) => {
  const user = await requireUser();
  const { id } = await params;
  const book = books.get(user.id, id);
  if (!book) throw new HttpError(404, "Book not found.");
  const kind = request.headers.get("x-cover-kind") === "custom" ? "custom" : "generated";
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.byteLength) throw new HttpError(400, "Empty cover.");
  if (bytes.byteLength > 5 * 1024 * 1024) throw new HttpError(413, "Cover must be under 5 MB.");
  await assertQuota(user.id, user.quotaBytes, bytes.byteLength);
  await writeBuffer(coverPath(user.id, id), bytes);
  return json({ book: books.setCover(user.id, id, kind, bytes.byteLength) });
});

export const DELETE = handler(async (_request, { params }: RouteParams<"id">) => {
  const user = await requireUser();
  const { id } = await params;
  if (!books.get(user.id, id)) throw new HttpError(404, "Book not found.");
  await removeFile(coverPath(user.id, id));
  return json({ book: books.setCover(user.id, id, "none", 0) });
});
