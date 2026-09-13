import { z } from "zod";
import { settings } from "@/server/repo";
import { handler, json, readJson, requireUser } from "@/server/http";

export const GET = handler(async () => {
  const user = await requireUser();
  return json({ settings: settings.get(user.id) });
});

const schema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  defaultZoom: z.union([z.literal("fit-width"), z.literal("fit-page"), z.number().min(0.25).max(5)]).optional(),
  defaultReadingMode: z.enum(["single", "continuous"]).optional(),
  rememberLastPage: z.boolean().optional(),
  customCategories: z.array(z.string().trim().max(80)).max(100).optional(),
});

export const PATCH = handler(async (request) => {
  const user = await requireUser();
  const patch = await readJson(request, schema);
  return json({ settings: settings.update(user.id, patch) });
});
