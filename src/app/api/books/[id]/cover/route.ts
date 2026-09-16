import { replaceLegacyAsset, removeLegacyCover } from "@/server/sync/legacy-assets";
import { assetPath, assetState } from "@/server/sync/uploads";
import { books } from "@/server/repo";
import { coverPath, fileResponse } from "@/server/files";
import { handler, HttpError, json, requireUser, type RouteParams } from "@/server/http";

export const GET = handler(async (request, { params }: RouteParams<"id">) => {
  const user = await requireUser();
  const { id } = await params;
  const book = books.get(user.id, id);
  if (request.headers.has("x-shelf-user") && request.headers.get("x-shelf-user") !== user.id) throw new HttpError(401, "Account changed.");
  if (!book || !book.coverId) throw new HttpError(404, "No cover.");
  const revision = new URL(request.url).searchParams.get("revision");
  if (revision && revision !== book.coverRevision) throw new HttpError(409, "The cover changed. Sync and retry.");
  if (book.coverRevision !== "legacy" && assetState(user.id, id)?.extra.uploadedCoverRevision !== book.coverRevision) throw new HttpError(404, "Cover upload pending.");
  const res = await fileResponse(book.coverRevision && book.coverRevision !== "legacy" ? assetPath(user.id, id, "cover", book.coverRevision) : coverPath(user.id, id), "image/jpeg", null);
  res.headers.set("Cache-Control", "no-store");
  return res;
});

export const PUT = handler(async (request, { params }: RouteParams<"id">) => {
  const user = await requireUser();
  const { id } = await params;
  const book = books.get(user.id, id);
  if (!book) throw new HttpError(404, "Book not found.");
  const kind = request.headers.get("x-cover-kind") === "custom" ? "custom" : "generated";
  if (!request.body) throw new HttpError(400, "Missing cover body.");
  return json({ book: await replaceLegacyAsset(user.id, user.quotaBytes, id, "cover", request.body, { coverKind: kind }) });
});

export const DELETE = handler(async (_request, { params }: RouteParams<"id">) => {
  const user = await requireUser();
  const { id } = await params;
  return json({ book: removeLegacyCover(user.id, id) });
});
