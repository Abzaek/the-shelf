import { bookmarks } from "@/server/repo";
import { handler, json, requireUser, type RouteParams } from "@/server/http";

export const DELETE = handler(async (_request, { params }: RouteParams<"id">) => {
  const user = await requireUser();
  const { id } = await params;
  bookmarks.remove(user.id, id);
  return json({ ok: true });
});
