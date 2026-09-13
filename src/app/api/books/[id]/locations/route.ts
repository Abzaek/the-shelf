import { books } from "@/server/repo";
import { handler, HttpError, json, requireUser, type RouteParams } from "@/server/http";

export const GET = handler(async (_request, { params }: RouteParams<"id">) => {
  const user = await requireUser();
  const { id } = await params;
  if (!books.get(user.id, id)) throw new HttpError(404, "Book not found.");
  return json({ locations: books.getLocations(user.id, id) });
});

export const PUT = handler(async (request, { params }: RouteParams<"id">) => {
  const user = await requireUser();
  const { id } = await params;
  if (!books.get(user.id, id)) throw new HttpError(404, "Book not found.");
  const text = await request.text();
  if (text.length > 5_000_000) throw new HttpError(413, "Location map too large.");
  books.setLocations(user.id, id, text);
  return json({ ok: true });
});
