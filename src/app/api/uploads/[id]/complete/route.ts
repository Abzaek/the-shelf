import { handler, json, type RouteParams } from "@/server/http";
import { requireDeviceUser } from "@/server/sync/security";
import { finishUpload } from "@/server/sync/uploads";
export const POST = handler(async (request, { params }: RouteParams<"id">) => {
  const user = await requireDeviceUser(request);
  finishUpload(user.id, (await params).id);
  return json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
});
