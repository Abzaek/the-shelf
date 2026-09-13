import { bookmarks, books, collections, notes, settings } from "@/server/repo";
import { bookFilePath, coverPath, removeFile } from "@/server/files";
import { handler, json, requireUser } from "@/server/http";
import type { LibraryBackup } from "@/types";

/** Everything needed for a metadata backup, in one call. */
export const GET = handler(async () => {
  const user = await requireUser();
  const backup: LibraryBackup = {
    format: "the-shelf-library",
    version: 2,
    exportedAt: new Date().toISOString(),
    books: books.list(user.id),
    bookmarks: bookmarks.listAll(user.id),
    notes: notes.listAll(user.id),
    collections: collections.list(user.id),
    settings: settings.get(user.id),
    includesFiles: false,
  };
  return json(backup);
});

/** Clear the whole library for this user (books, files, notes, bookmarks, collections). */
export const DELETE = handler(async () => {
  const user = await requireUser();
  for (const b of books.list(user.id)) {
    books.remove(user.id, b.id);
    await removeFile(bookFilePath(user.id, b.id, b.format));
    await removeFile(coverPath(user.id, b.id));
  }
  for (const c of collections.list(user.id)) collections.remove(user.id, c.id);
  return json({ ok: true });
});
