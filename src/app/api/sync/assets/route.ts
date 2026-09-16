import { handler, HttpError, json, readJson } from "@/server/http";
import { requireDeviceUser } from "@/server/sync/security";
import { books } from "@/server/repo";
import { getDb } from "@/server/db";
import { z } from "zod";
export const DELETE = handler(async (request) => {
  const user = await requireDeviceUser(request);
  const input = await readJson(request, z.object({ bookId: z.string(), revision: z.string() }));
  const book = books.get(user.id, input.bookId);
  if (!book || book.coverRevision !== input.revision || book.coverKind !== "none")
    throw new HttpError(409, "The cover changed. Sync and retry.");
  getDb().prepare("UPDATE books SET cover_size=0 WHERE user_id=? AND id=?").run(user.id, book.id);
  return json({ ok: true });
});

export const GET = handler(async (request) => {
  const user = await requireDeviceUser(request);
  const query = new URL(request.url).searchParams;
  const upload = getDb()
    .prepare(
      "SELECT id,completed FROM file_uploads WHERE user_id=? AND book_id=? AND kind=? AND revision=?",
    )
    .get(user.id, query.get("bookId"), query.get("kind"), query.get("revision")) as
    { id: string; completed: number } | undefined;
  return json(
    { upload: upload ? { url: `/api/uploads/${upload.id}`, completed: !!upload.completed } : null },
    { headers: { "Cache-Control": "no-store" } },
  );
});
