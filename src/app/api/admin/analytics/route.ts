import { z } from "zod";
import { handler, HttpError, json, requireUser } from "@/server/http";
import { defaultFilter, getAnalytics } from "@/server/analytics/report";
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s);
const schema = z.object({ start: day, end: day, bucket: z.enum(["day", "week", "month"]), active: z.coerce.number().int().min(1).max(365), inactive: z.coerce.number().int().min(2).max(730), dormant: z.coerce.number().int().min(3).max(3650) })
    .refine(v => v.start <= v.end && v.end <= new Date().toISOString().slice(0, 10) && Date.parse(v.end) - Date.parse(v.start) <= 36525 * 86400000, "Invalid date range (maximum 100 years).")
    .refine(v => v.active < v.inactive && v.inactive < v.dormant, "Activity thresholds must increase.");
export const GET = handler(async (request) => {
    const user = await requireUser();
    if (user.role !== "admin")
        throw new HttpError(403, "Administrator access required.");
    const parsed = schema.safeParse({ ...defaultFilter(), ...Object.fromEntries(new URL(request.url).searchParams) });
    if (!parsed.success)
        throw new HttpError(400, parsed.error.issues.map(i => i.message).join(" "));
    return json(getAnalytics(parsed.data), { headers: { "Cache-Control": "private, no-store" } });
});
