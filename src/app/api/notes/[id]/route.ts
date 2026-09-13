import { z } from "zod";
import { notes } from "@/server/repo";
import { handler, HttpError, json, readJson, requireUser, type RouteParams } from "@/server/http";

export const PATCH = handler(async (request, { params }: RouteParams<"id">) => {
  const user = await requireUser();
  const { id } = await params;
  const { content } = await readJson(request, z.object({ content: z.string().trim().min(1).max(20_000) }));
  const note = notes.update(user.id, id, content);
  if (!note) throw new HttpError(404, "Note not found.");
  return json({ note });
});

export const DELETE = handler(async (_request, { params }: RouteParams<"id">) => {
  const user = await requireUser();
  const { id } = await params;
  notes.remove(user.id, id);
  return json({ ok: true });
});
