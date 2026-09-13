"use client";

import { unzip, zip, type Unzipped, type Zippable } from "fflate";
import type { ImportSummary, LibraryBackup, LibraryBackupV1 } from "@/types";
import { storage } from "@/lib/storage";

export const BACKUP_JSON_NAME = "library-backup-v2.json";

export interface ParsedBackup {
  backup: LibraryBackup | LibraryBackupV1;
  files: Map<string, Blob>;
  covers: Map<string, Blob>;
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Metadata-only backup as JSON. */
export async function exportLibraryJson(): Promise<{ blob: Blob; fileName: string }> {
  const backup = await storage.exportLibrary();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  return { blob, fileName: `the-shelf-${todayStamp()}-${BACKUP_JSON_NAME}` };
}

/** Full backup: metadata + book files + covers in one zip. */
export async function exportLibraryZip(
  onProgress?: (done: number, total: number) => void,
): Promise<{ blob: Blob; fileName: string }> {
  const backup = await storage.exportLibrary();
  backup.includesFiles = true;

  const files: Zippable = {
    [BACKUP_JSON_NAME]: [new TextEncoder().encode(JSON.stringify(backup, null, 2)), { level: 6 }],
  };
  let done = 0;
  for (const book of backup.books) {
    const file = await storage.getFile(book.fileId);
    if (file) files[`files/${book.id}.${book.format}`] = [new Uint8Array(await file.arrayBuffer()), { level: 0 }];
    if (book.coverId) {
      const cover = await storage.getCover(book.coverId);
      if (cover) files[`covers/${book.id}.jpg`] = [new Uint8Array(await cover.arrayBuffer()), { level: 0 }];
    }
    done += 1;
    onProgress?.(done, backup.books.length);
  }

  const zipped = await new Promise<Uint8Array>((resolve, reject) =>
    zip(files, (err, data) => (err ? reject(err) : resolve(data))),
  );
  return {
    blob: new Blob([zipped as BlobPart], { type: "application/zip" }),
    fileName: `the-shelf-${todayStamp()}-library-backup-v2.zip`,
  };
}

function validateBackup(value: unknown): LibraryBackup | LibraryBackupV1 {
  if (!value || typeof value !== "object") throw new Error("This file is not a Shelf backup.");
  const v = value as { format?: string; version?: number; books?: unknown; bookmarks?: unknown; notes?: unknown; collections?: unknown };
  if (v.format !== "the-shelf-library") throw new Error("This file is not a Shelf backup.");
  if (v.version !== 1 && v.version !== 2) throw new Error(`Unsupported backup version (${String(v.version)}).`);
  if (!Array.isArray(v.books)) throw new Error("Backup is missing its book list.");
  return {
    ...v,
    bookmarks: v.bookmarks ?? [],
    notes: v.notes ?? [],
    collections: v.collections ?? [],
  } as LibraryBackup | LibraryBackupV1;
}

/** Accepts either the JSON file or the zip produced by exportLibraryZip. */
export async function parseBackupFile(file: File): Promise<ParsedBackup> {
  const isZip =
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed" ||
    /\.zip$/i.test(file.name);

  if (!isZip) {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Could not read this file as JSON.");
    }
    return { backup: validateBackup(parsed), files: new Map(), covers: new Map() };
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const entries = await new Promise<Unzipped>((resolve, reject) =>
    unzip(buffer, (err, data) => (err ? reject(err) : resolve(data))),
  );
  const jsonEntry = Object.keys(entries).find((k) => k.endsWith(".json"));
  if (!jsonEntry) throw new Error("The zip does not contain a library backup.");
  const backup = validateBackup(JSON.parse(new TextDecoder().decode(entries[jsonEntry])));

  const files = new Map<string, Blob>();
  const covers = new Map<string, Blob>();
  for (const [path, bytes] of Object.entries(entries)) {
    // v2: files/<id>.<pdf|epub>; v1: pdfs/<id>.pdf
    const fileMatch = path.match(/^(?:files|pdfs)\/(.+)\.(pdf|epub)$/);
    if (fileMatch) {
      const type = fileMatch[2] === "epub" ? "application/epub+zip" : "application/pdf";
      files.set(fileMatch[1], new Blob([bytes as BlobPart], { type }));
    }
    const coverMatch = path.match(/^covers\/(.+)\.(jpg|jpeg|png|webp)$/);
    if (coverMatch) covers.set(coverMatch[1], new Blob([bytes as BlobPart], { type: "image/jpeg" }));
  }
  return { backup, files, covers };
}

export async function importParsedBackup(parsed: ParsedBackup): Promise<ImportSummary> {
  return storage.importLibrary(parsed.backup, { files: parsed.files, covers: parsed.covers });
}
