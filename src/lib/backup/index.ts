"use client";

import { unzip, zip, type Unzipped, type Zippable } from "fflate";
import type { ImportSummary, LibraryBackupV1 } from "@/types";
import { storage } from "@/lib/storage";

export const BACKUP_JSON_NAME = "library-backup-v1.json";

export interface ParsedBackup {
  backup: LibraryBackupV1;
  pdfs: Map<string, Blob>;
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

/** Full backup: metadata + PDFs + covers in one zip. */
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
    const pdf = await storage.getPdf(book.pdfId);
    if (pdf) files[`pdfs/${book.id}.pdf`] = [new Uint8Array(await pdf.arrayBuffer()), { level: 0 }];
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
    fileName: `the-shelf-${todayStamp()}-library-backup-v1.zip`,
  };
}

function validateBackup(value: unknown): LibraryBackupV1 {
  if (!value || typeof value !== "object") throw new Error("This file is not a Shelf backup.");
  const v = value as Partial<LibraryBackupV1>;
  if (v.format !== "the-shelf-library") throw new Error("This file is not a Shelf backup.");
  if (v.version !== 1) throw new Error(`Unsupported backup version (${String(v.version)}).`);
  if (!Array.isArray(v.books)) throw new Error("Backup is missing its book list.");
  return {
    ...v,
    bookmarks: v.bookmarks ?? [],
    notes: v.notes ?? [],
    collections: v.collections ?? [],
  } as LibraryBackupV1;
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
    return { backup: validateBackup(parsed), pdfs: new Map(), covers: new Map() };
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const entries = await new Promise<Unzipped>((resolve, reject) =>
    unzip(buffer, (err, data) => (err ? reject(err) : resolve(data))),
  );
  const jsonEntry = Object.keys(entries).find((k) => k.endsWith(".json"));
  if (!jsonEntry) throw new Error("The zip does not contain a library backup.");
  const backup = validateBackup(JSON.parse(new TextDecoder().decode(entries[jsonEntry])));

  const pdfs = new Map<string, Blob>();
  const covers = new Map<string, Blob>();
  for (const [path, bytes] of Object.entries(entries)) {
    const pdfMatch = path.match(/^pdfs\/(.+)\.pdf$/);
    if (pdfMatch) pdfs.set(pdfMatch[1], new Blob([bytes as BlobPart], { type: "application/pdf" }));
    const coverMatch = path.match(/^covers\/(.+)\.(jpg|jpeg|png|webp)$/);
    if (coverMatch) covers.set(coverMatch[1], new Blob([bytes as BlobPart], { type: "image/jpeg" }));
  }
  return { backup, pdfs, covers };
}

export async function importParsedBackup(parsed: ParsedBackup): Promise<ImportSummary> {
  return storage.importLibrary(parsed.backup, { pdfs: parsed.pdfs, covers: parsed.covers });
}
