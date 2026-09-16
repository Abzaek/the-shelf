import { maintainFiles } from "@/server/sync/maintenance";
import { z } from "zod";
import { handler, HttpError, json, readJson, requireUser } from "@/server/http";
import { pullDocuments, pushDocuments } from "@/server/sync/store";
import { syncDocumentSchema } from "@/lib/sync/validation";
import { SYNC_VERSION } from "@/lib/sync/documents";
import { assertSameOrigin } from "@/server/sync/security";

const requestSchema = z.object({
  version: z.literal(SYNC_VERSION),
  userId: z.string(),
  action: z.enum(["pull", "push"]),
  sequence: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(200).default(100),
  writes: z
    .array(
      z.object({
        newDocumentState: syncDocumentSchema,
        assumedMasterState: syncDocumentSchema.optional(),
      }),
    )
    .max(100)
    .default([]),
  parents: z.array(syncDocumentSchema).max(200).default([]),
});
export const POST = handler(async (request) => {
  assertSameOrigin(request);
  const user = await requireUser();
  if (Number(request.headers.get("content-length")) > 4_000_000)
    throw new HttpError(413, "Sync batch is too large.");
  const body = await readJson(request, requestSchema);
  if (body.userId !== user.id)
    throw new HttpError(401, "The signed-in account changed. Sign in again to sync this library.");
  const result =
    body.action === "pull"
      ? pullDocuments(user.id, body.sequence, body.limit)
      : { conflicts: pushDocuments(user.id, body.writes, body.parents) };
  maintainFiles(user.id);
  return json(result, { headers: { "Cache-Control": "no-store" } });
});
