import { z } from "zod";
import { notes } from "@/server/repo";
import { handler, HttpError, json, readJson, requireUser } from "@/server/http";

export const GET = handler(async (request) => {
  const user = await requireUser();
  const bookId = new URL(request.url).searchParams.get("bookId");
  return json({ notes: bookId ? notes.list(user.id, bookId) : notes.listAll(user.id) });
});

const schema = z.object({
  bookId: z.string(),
  page: z.number().int().min(1),
  content: z.string().trim().min(1).max(20_000),
  cfi: z.string().max(2000).optional(),
  id: z.string().regex(/^[a-zA-Z0-9-]{1,64}$/).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const POST = handler(async (request) => {
  const user = await requireUser();
  const n = await readJson(request, schema);
  const created = notes.add(user.id, n.bookId, n.page, n.content, n.cfi, n.id, n.createdAt, n.updatedAt);
  if (!created) throw new HttpError(404, "Book not found.");
  return json({ note: created }, { status: 201 });
});
