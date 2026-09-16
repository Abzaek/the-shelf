import "server-only";
import { getDb, now } from "@/server/db";
import { env } from "@/server/env";
import { HttpError } from "@/server/http";
import { seal, unseal } from "./crypto";
export const driveConfig = () => ({
  clientId: process.env.GOOGLE_DRIVE_CLIENT_ID ?? "",
  clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? "",
  pickerKey: process.env.GOOGLE_DRIVE_PICKER_API_KEY ?? "",
  projectNumber: process.env.GOOGLE_DRIVE_PROJECT_NUMBER ?? "",
  redirectUri: `${env.appUrl}/api/drive/callback`,
});
export function driveConfigured() {
  const config = driveConfig();
  return !!(
    config.clientId &&
    config.clientSecret &&
    config.pickerKey &&
    config.projectNumber &&
    process.env.SHELF_TOKEN_ENCRYPTION_KEY
  );
}
interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}
export function connection(userId: string): Tokens | null {
  const row = getDb()
    .prepare("SELECT tokens FROM drive_connections WHERE user_id=?")
    .get(userId) as { tokens: string } | undefined;
  return row ? unseal<Tokens>(row.tokens) : null;
}
export async function exchange(parameters: Record<string, string>) {
  const config = driveConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      ...parameters,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new HttpError(409, "Reconnect Google Drive to continue.");
  return response.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  }>;
}
export function saveConnection(userId: string, tokens: Tokens) {
  getDb()
    .prepare(
      "INSERT INTO drive_connections(user_id,tokens,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET tokens=excluded.tokens,updated_at=excluded.updated_at",
    )
    .run(userId, seal(tokens), now());
}
export async function accessToken(userId: string): Promise<string> {
  const tokens = connection(userId);
  if (!tokens) throw new HttpError(409, "Connect Google Drive first.");
  if (tokens.expires_at > Date.now() + 60000) return tokens.access_token;
  const refreshed = await exchange({
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
  });
  saveConnection(userId, {
    ...tokens,
    ...refreshed,
    expires_at: Date.now() + refreshed.expires_in * 1000,
  });
  return refreshed.access_token;
}
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  modifiedTime: string;
  trashed?: boolean;
}
export async function getDriveFile(userId: string, id: string): Promise<DriveFile> {
  if (!/^[\w-]{1,200}$/.test(id)) throw new HttpError(400, "Invalid Drive file.");
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType,size,modifiedTime,trashed`,
    {
      headers: { Authorization: `Bearer ${await accessToken(userId)}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok)
    throw new HttpError(404, "Choose a file you can access using the Drive picker.");
  return response.json();
}
export async function driveFileResponse(
  userId: string,
  id: string,
  range: string | null,
): Promise<Response> {
  const headers = new Headers({ Authorization: `Bearer ${await accessToken(userId)}` });
  if (range) headers.set("Range", range);
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`,
    { headers, cache: "no-store" },
  );
  if (!response.ok)
    throw new HttpError(
      response.status === 404 ? 404 : 409,
      "This Drive file is unavailable. Reconnect Drive or choose the file again.",
    );
  const output = new Headers({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  for (const name of ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"]) {
    const value = response.headers.get(name);
    if (value) output.set(name, value);
  }
  return new Response(response.body, { status: response.status, headers: output });
}
