import { z } from "zod";
import { books, collections } from "@/server/repo";
import { handler, HttpError, json, readJson, requireUser, type RouteParams } from "@/server/http";

export const PUT = handler(async (request, { params }: RouteParams<"id">) => {
  const user = await requireUser();
  const { id } = await params;
  if (!books.get(user.id, id)) throw new HttpError(404, "Book not found.");
  const { collectionIds } = await readJson(request, z.object({ collectionIds: z.array(z.string()).max(200) }));
  collections.setBookMembership(user.id, id, collectionIds);
  return json({ collections: collections.list(user.id) });
});
