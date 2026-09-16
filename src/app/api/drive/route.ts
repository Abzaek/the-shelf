import { handler, json } from "@/server/http";
import { requireDeviceUser } from "@/server/sync/security";
import { connection, driveConfigured, driveConfig, accessToken } from "@/server/drive/client";
import { getDb } from "@/server/db";
export const GET = handler(async (request) => {
  const user = await requireDeviceUser(request);
  return json(
    { configured: driveConfigured(), connected: !!connection(user.id) },
    { headers: { "Cache-Control": "no-store" } },
  );
});
/** Short-lived access token is used only by Google's picker, never persisted by the browser. */
export const POST = handler(async (request) => {
  const user = await requireDeviceUser(request),
    config = driveConfig();
  return json(
    {
      accessToken: await accessToken(user.id),
      apiKey: config.pickerKey,
      appId: config.projectNumber,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
});
export const DELETE = handler(async (request) => {
  const user = await requireDeviceUser(request),
    tokens = connection(user.id);
  getDb().prepare("DELETE FROM drive_connections WHERE user_id=?").run(user.id);
  if (tokens)
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: tokens.refresh_token }),
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);
  return json({ ok: true });
});
