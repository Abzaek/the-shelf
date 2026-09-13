import { z } from "zod";
import { books } from "@/server/repo";
import { handler, HttpError, json, readJson, requireUser, type RouteParams } from "@/server/http";

const schema = z.object({
  currentPage: z.number().int().min(1),
  totalPages: z.number().int().min(0),
  currentCfi: z.string().nullable().optional(),
});

export const PUT = handler(async (request, { params }: RouteParams<"id">) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await readJson(request, schema);
  const book = books.saveProgress(user.id, id, body.currentPage, body.totalPages, body.currentCfi);
  if (!book) throw new HttpError(404, "Book not found.");
  return json({ book });
});
