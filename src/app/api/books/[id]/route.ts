import { z } from "zod";
import { books } from "@/server/repo";
import { bookFilePath, coverPath, removeFile } from "@/server/files";
import { handler, HttpError, json, readJson, requireUser, type RouteParams } from "@/server/http";
import { READING_STATUSES, type ReadingStatus } from "@/types";

export const GET = handler(async (_request, { params }: RouteParams<"id">) => {
  const user = await requireUser();
  const { id } = await params;
  const book = books.get(user.id, id);
  if (!book) throw new HttpError(404, "Book not found.");
  return json({ book });
});

const patchSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  author: z.string().trim().max(300).optional(),
  description: z.string().trim().max(5000).optional(),
  category: z.string().trim().max(80).optional(),
  tags: z.array(z.string().trim().max(60)).max(50).optional(),
  status: z.enum(READING_STATUSES as [ReadingStatus, ...ReadingStatus[]]).optional(),
  totalPages: z.number().int().min(0).optional(),
  currentPage: z.number().int().min(1).optional(),
  currentCfi: z.string().nullable().optional(),
  lastOpenedAt: z.string().nullable().optional(),
  finishedAt: z.string().nullable().optional(),
});

export const PATCH = handler(async (request, { params }: RouteParams<"id">) => {
  const user = await requireUser();
  const { id } = await params;
  const patch = await readJson(request, patchSchema);
  const book = books.update(user.id, id, patch);
  if (!book) throw new HttpError(404, "Book not found.");
  return json({ book });
});

export const DELETE = handler(async (_request, { params }: RouteParams<"id">) => {
  const user = await requireUser();
  const { id } = await params;
  const removed = books.remove(user.id, id);
  if (!removed) throw new HttpError(404, "Book not found.");
  await removeFile(bookFilePath(user.id, id, removed.format));
  await removeFile(coverPath(user.id, id));
  return json({ ok: true });
});
