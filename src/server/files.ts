import "server-only";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { getDb } from "./db";
import { env } from "./env";
import type { BookFormat } from "@/types";

/**
 * Per-user file storage on disk:
 *   <dataDir>/users/<userId>/<bookId>.<pdf|epub>
 *   <dataDir>/users/<userId>/<bookId>.cover.jpg
 * Quotas are enforced against sizes recorded in the database.
 */

const SAFE_ID = /^[a-zA-Z0-9-]{1,64}$/;

function assertSafe(id: string): void {
  if (!SAFE_ID.test(id)) throw new Error("Invalid identifier");
}

export function userDir(userId: string): string {
  assertSafe(userId);
  return path.join(env.dataDir, "users", userId);
}

export function bookFilePath(userId: string, bookId: string, format: BookFormat): string {
  assertSafe(bookId);
  return path.join(userDir(userId), `${bookId}.${format}`);
}

export function coverPath(userId: string, bookId: string): string {
  assertSafe(bookId);
  return path.join(userDir(userId), `${bookId}.cover.jpg`);
}

export class QuotaError extends Error {
  status = 413;
  constructor(message: string) {
    super(message);
    this.name = "QuotaError";
  }
}

export interface UsageInfo {
  usedBytes: number;
  quotaBytes: number;
  totalUsedBytes: number;
  totalQuotaBytes: number;
}

export function userUsage(userId: string, quotaBytes: number): UsageInfo {
  const db = getDb();
  const used = (db.prepare("SELECT COALESCE(SUM(CASE WHEN json_extract(sync_extra, '$.fileSource') = 'drive' THEN cover_size ELSE file_size + cover_size END), 0) AS n FROM books WHERE user_id = ?").get(userId) as { n: number }).n;
  const total = (db.prepare("SELECT COALESCE(SUM(CASE WHEN json_extract(sync_extra, '$.fileSource') = 'drive' THEN cover_size ELSE file_size + cover_size END), 0) AS n FROM books").get() as { n: number }).n;
  return { usedBytes: used, quotaBytes, totalUsedBytes: total, totalQuotaBytes: env.totalQuotaBytes };
}

/** Final check inside the same SQLite transaction that commits the recorded byte count. */
export function assertCommittedQuota(userId: string, quotaBytes: number, bytes: number): void {
  const usage = userUsage(userId, quotaBytes);
  if (usage.usedBytes + bytes > quotaBytes || usage.totalUsedBytes + bytes > env.totalQuotaBytes) throw new QuotaError("Not enough hosted storage. Your local file has been kept.");
}

/** Throws QuotaError when adding `bytes` would exceed the user's, the store's, or the disk's limits. */
export async function assertQuota(userId: string, quotaBytes: number, bytes: number): Promise<void> {
  if (bytes > env.maxUploadBytes) {
    throw new QuotaError(`That file is larger than the ${formatBytes(env.maxUploadBytes)} upload limit.`);
  }
  const usage = userUsage(userId, quotaBytes);
  if (usage.usedBytes + bytes > usage.quotaBytes) {
    throw new QuotaError(
      `Not enough space. This would use ${formatBytes(usage.usedBytes + bytes)} of your ${formatBytes(usage.quotaBytes)}.`,
    );
  }
  if (usage.totalUsedBytes + bytes > usage.totalQuotaBytes) {
    throw new QuotaError("The library server is out of space. Please try again later.");
  }
  try {
    const stat = await fsp.statfs(env.dataDir);
    const free = Number(stat.bavail) * Number(stat.bsize);
    if (free - bytes < env.minFreeDiskBytes) throw new QuotaError("The library server is low on disk space.");
  } catch (err) {
    if (err instanceof QuotaError) throw err;
    // statfs unavailable on this platform: rely on the quotas above.
  }
}

/** Streams a web ReadableStream to disk, enforcing a byte ceiling. Returns bytes written. */
export async function writeStream(target: string, body: ReadableStream<Uint8Array>, maxBytes: number): Promise<number> {
  await fsp.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${randomUUID()}.part`;
  let written = 0;
  try {
    const ceiling = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        written += chunk.byteLength;
        if (written > maxBytes) callback(new QuotaError(`Upload exceeds the ${formatBytes(maxBytes)} limit.`));
        else callback(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(body as unknown as NodeReadableStream<Uint8Array>), ceiling, fs.createWriteStream(tmp, { mode: 0o640 }));
    await fsp.rename(tmp, target);
    return written;
  } catch (err) {
    await fsp.rm(tmp, { force: true });
    throw err;
  }
}

export async function writeBuffer(target: string, data: Uint8Array): Promise<void> {
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.writeFile(target, data, { mode: 0o640 });
}

export async function removeFile(target: string): Promise<void> {
  await fsp.rm(target, { force: true });
}

export async function removeUserDir(userId: string): Promise<void> {
  await fsp.rm(userDir(userId), { recursive: true, force: true });
}

/** Serve a file with HTTP Range support (pdf.js and browsers request ranges). */
export async function fileResponse(filePath: string, contentType: string, rangeHeader: string | null, download?: string): Promise<Response> {
  let stat: fs.Stats;
  try {
    stat = await fsp.stat(filePath);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const size = stat.size;
  const headers = new Headers({
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=0, must-revalidate",
    "Last-Modified": stat.mtime.toUTCString(),
    "X-Content-Type-Options": "nosniff",
  });
  if (download) headers.set("Content-Disposition", `attachment; filename="${download.replace(/[^\w.\- ]+/g, "_")}"`);

  let start = 0;
  let end = size - 1;
  let status = 200;
  if (rangeHeader) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (!m) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    if (m[1]) start = parseInt(m[1], 10);
    if (m[2]) end = parseInt(m[2], 10);
    if (!m[1] && m[2]) {
      start = Math.max(0, size - parseInt(m[2], 10));
      end = size - 1;
    }
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    end = Math.min(end, size - 1);
    status = 206;
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  }
  headers.set("Content-Length", String(end - start + 1));
  const nodeStream = fs.createReadStream(filePath, { start, end });
  const body = Readable.toWeb(nodeStream) as unknown as NodeReadableStream<Uint8Array>;
  return new Response(body as unknown as BodyInit, { status, headers });
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}
