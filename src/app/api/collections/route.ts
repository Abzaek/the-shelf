import { z } from "zod";
import { collections } from "@/server/repo";
import { handler, json, readJson, requireUser } from "@/server/http";

export const GET = handler(async () => {
  const user = await requireUser();
  return json({ collections: collections.list(user.id) });
});

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).default(""),
  bookIds: z.array(z.string()).max(1000).default([]),
  id: z.string().regex(/^[a-zA-Z0-9-]{1,64}$/).optional(),
  createdAt: z.string().optional(),
});

export const POST = handler(async (request) => {
  const user = await requireUser();
  const c = await readJson(request, schema);
  return json({ collection: collections.create(user.id, c.name, c.description, c.bookIds, c.id, c.createdAt) }, { status: 201 });
});
