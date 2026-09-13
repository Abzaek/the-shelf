import { z } from "zod";
import { collections } from "@/server/repo";
import { handler, HttpError, json, readJson, requireUser, type RouteParams } from "@/server/http";

const schema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).optional(),
  bookIds: z.array(z.string()).max(1000).optional(),
});

export const PATCH = handler(async (request, { params }: RouteParams<"id">) => {
  const user = await requireUser();
  const { id } = await params;
  const patch = await readJson(request, schema);
  const collection = collections.update(user.id, id, patch);
  if (!collection) throw new HttpError(404, "Collection not found.");
  return json({ collection });
});

export const DELETE = handler(async (_request, { params }: RouteParams<"id">) => {
  const user = await requireUser();
  const { id } = await params;
  collections.remove(user.id, id);
  return json({ ok: true });
});
