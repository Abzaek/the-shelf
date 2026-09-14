import { z } from "zod";
import { allowAttempt } from "@/server/auth";
import { getDb } from "@/server/db";
import { handler, HttpError, json, readJson, requireUser } from "@/server/http";
import { readingPulse, recordActivity } from "@/server/analytics/tracking";
const schema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("library_opened") }),
    z.object({ kind: z.literal("reading"), bookId: z.string().min(1).max(64), page: z.number().int().min(1).max(10000000), sessionId: z.string().uuid().optional(), sequence: z.number().int().min(0).max(100000000) }),
    z.object({ kind: z.literal("pause"), sessionId: z.string().uuid() })
]);
export const POST = handler(async (request) => {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
        throw new HttpError(403, "Cross-origin tracking is not allowed.");
    const user = await requireUser();
    if (!allowAttempt(`analytics:${user.id}`, 120, 60000))
        throw new HttpError(429, "Too many analytics updates.");
    if (Number(request.headers.get("content-length")) > 2048)
        throw new HttpError(413, "Analytics payload too large.");
    const body = await readJson(request, schema);
    if (body.kind === "library_opened") {
        recordActivity(user.id, "library_opened");
        return json({ ok: true });
    }
    if (body.kind === "pause") {
        getDb().prepare("UPDATE analytics_users SET reading_seen=NULL WHERE user_id=? AND reading_id=?").run(user.id, body.sessionId);
        return json({ ok: true });
    }
    const result = readingPulse(user.id, body.bookId, body.page, body.sessionId, body.sequence);
    if (!result)
        throw new HttpError(404, "Book not found.");
    return json(result);
});
