import { z } from "zod";
import { bookmarks } from "@/server/repo";
import { handler, HttpError, json, readJson, requireUser } from "@/server/http";

export const GET = handler(async (request) => {
  const user = await requireUser();
  const bookId = new URL(request.url).searchParams.get("bookId");
  return json({ bookmarks: bookId ? bookmarks.list(user.id, bookId) : bookmarks.listAll(user.id) });
});

const schema = z.object({
  bookId: z.string(),
  page: z.number().int().min(1),
  label: z.string().trim().max(200).default(""),
  cfi: z.string().max(2000).optional(),
  id: z.string().regex(/^[a-zA-Z0-9-]{1,64}$/).optional(),
  createdAt: z.string().optional(),
});

export const POST = handler(async (request) => {
  const user = await requireUser();
  const b = await readJson(request, schema);
  const created = bookmarks.add(user.id, b.bookId, b.page, b.label, b.cfi, b.id, b.createdAt);
  if (!created) throw new HttpError(404, "Book not found.");
  return json({ bookmark: created }, { status: 201 });
});
