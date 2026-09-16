import { z } from "zod";
import { SYNC_TYPES, documentId, type SyncDocument } from "./documents";
const id = z.string().regex(/^[a-zA-Z0-9-]{1,64}$/);
const date = z.string().datetime({ offset: true });
const position = z.object({
  currentPage: z.number().int().min(1),
  totalPages: z.number().int().min(0),
  currentCfi: z.string().max(4096).nullable(),
  updatedAt: date,
});
export const bookSchema = z.object({
  id,
  format: z.enum(["pdf", "epub"]),
  title: z.string().min(1).max(300),
  author: z.string().max(300),
  description: z.string().max(5000),
  category: z.string().max(80),
  tags: z.array(z.string().max(60)).max(50),
  status: z.enum(["want-to-read", "reading", "finished", "paused"]),
  coverId: id.nullable(),
  coverKind: z.enum(["custom", "generated", "none"]),
  fileId: id,
  fileName: z.string().max(300),
  fileSize: z
    .number()
    .int()
    .min(0)
    .max(1024 ** 3),
  totalPages: z.number().int().min(0),
  currentPage: z.number().int().min(1),
  currentCfi: z.string().max(4096).nullable(),
  progress: z.number().min(0).max(100),
  createdAt: date,
  updatedAt: date,
  lastOpenedAt: date.nullable(),
  finishedAt: date.nullable(),
  fileSource: z.enum(["hosted", "drive"]).optional(),
  driveFileId: z
    .string()
    .regex(/^[\w-]{1,200}$/)
    .optional(),
  fileRevision: id.optional(),
  coverRevision: id.optional(),
  readingPositions: z.record(id, position).optional(),
});
const schemas = {
  book: bookSchema,
  bookmark: z.object({
    id,
    bookId: id,
    page: z.number().int().min(1),
    cfi: z.string().max(4096).optional(),
    label: z.string().max(1000),
    createdAt: date,
  }),
  note: z.object({
    id,
    bookId: id,
    page: z.number().int().min(1),
    cfi: z.string().max(4096).optional(),
    content: z.string().max(50000),
    createdAt: date,
    updatedAt: date,
    conflictCopies: z.array(z.string().max(50000)).max(20).optional(),
  }),
  collection: z.object({
    id,
    name: z.string().min(1).max(300),
    description: z.string().max(5000),
    createdAt: date,
  }),
  membership: z.object({ collectionId: id, bookId: id }),
  settings: z.object({
    theme: z.enum(["light", "dark", "system"]),
    defaultZoom: z.union([z.enum(["fit-width", "fit-page"]), z.number().positive().max(10)]),
    defaultReadingMode: z.enum(["single", "continuous"]),
    rememberLastPage: z.boolean(),
    customCategories: z.array(z.string().max(80)).max(200),
  }),
};
export const syncDocumentSchema = z
  .object({
    id: z.string().max(160),
    type: z.enum(SYNC_TYPES),
    key: z.string().max(140),
    bookId: z.union([id, z.literal("")]),
    payload: z.string().max(256000),
    _deleted: z.boolean(),
  })
  .superRefine((doc, ctx) => {
    try {
      if (doc.id !== documentId(doc.type, doc.key)) throw new Error("Document identity mismatch.");
      const raw = JSON.parse(doc.payload);
      schemas[doc.type].parse(raw);
      const key =
        doc.type === "settings"
          ? "default"
          : doc.type === "membership"
            ? `${raw.collectionId}|${raw.bookId}`
            : raw.id;
      const bookId = ["bookmark", "note", "membership"].includes(doc.type) ? raw.bookId : "";
      if (doc.key !== key || doc.bookId !== bookId) throw new Error("Invalid document identity.");
      if (
        doc.type === "book" &&
        (raw.fileId !== raw.id || (raw.coverId !== null && raw.coverId !== raw.id))
      )
        throw new Error("Invalid file identity.");
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "Invalid document.",
      });
    }
  });
export function validateDocument(doc: SyncDocument): SyncDocument {
  return syncDocumentSchema.parse(doc);
}
