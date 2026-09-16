import Dexie, { type Table } from "dexie";
import {
  createRxDatabase,
  type RxCollection,
  type RxDatabase,
  type RxJsonSchema,
} from "rxdb/plugins/core";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";
import { conflictHandler } from "@/lib/sync/conflicts";
import { SYNC_TYPES, type SyncDocument } from "@/lib/sync/documents";

export interface LocalAsset {
  id: string;
  bookId: string;
  kind: "file" | "cover";
  revision: string;
  blob: Blob | null;
  pending: number;
  uploadUrl?: string;
  /** Fallback representation for WebKit profiles that reject IndexedDB Blob values. */
  bytes?: ArrayBuffer;
  mimeType?: string;
}
export class AssetDatabase extends Dexie {
  assets!: Table<LocalAsset, string>;
  locations!: Table<{ bookId: string; value: string }, string>;
  acknowledgements!: Table<{ id: string; payload: string; deleted: boolean }, string>;
  private binaryFallback = false;
  constructor(userId: string) {
    super(`shelf-assets-v1-${userId}`);
    this.version(1).stores({
      assets: "id,bookId,pending",
      locations: "bookId",
      acknowledgements: "id",
    });
    this.assets.hook("reading", (asset: LocalAsset | undefined) =>
      asset?.bytes ? { ...asset, blob: new Blob([asset.bytes], { type: asset.mimeType }) } : asset,
    );
  }
  async persistAsset(asset: LocalAsset): Promise<void> {
    if (!this.binaryFallback || !asset.blob) {
      try {
        await this.assets.put(asset);
        return;
      } catch (error) {
        if (!asset.blob || !(error instanceof Error) || error.name !== "UnknownError") throw error;
        this.binaryFallback = true;
      }
    }
    // Preserve bytes and MIME type; consumers still receive a Blob through the reading hook.
    await this.assets.put({
      ...asset,
      blob: null,
      bytes: await asset.blob!.arrayBuffer(),
      mimeType: asset.blob!.type,
    });
  }
}
export type LibraryDatabase = RxDatabase<{ records: RxCollection<SyncDocument> }>;
export interface LocalDatabase {
  documents: LibraryDatabase;
  assets: AssetDatabase;
  userId: string;
}
const schema: RxJsonSchema<SyncDocument> = {
  title: "Shelf replicated metadata",
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 160 },
    type: { type: "string", enum: [...SYNC_TYPES], maxLength: 20 },
    key: { type: "string", maxLength: 140 },
    bookId: { type: "string", maxLength: 64 },
    payload: { type: "string" },
    _deleted: { type: "boolean" },
  },
  required: ["id", "type", "key", "bookId", "payload"],
  indexes: ["type", "bookId"],
};
const databases = new Map<string, Promise<LocalDatabase>>();
export function openLocalDatabase(userId: string): Promise<LocalDatabase> {
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(userId)) throw new Error("Invalid local account identifier.");
  const existing = databases.get(userId);
  if (existing) return existing;
  const opening = (async () => {
    const documents = await createRxDatabase<{ records: RxCollection<SyncDocument> }>({
      name: `shelf-v1-${userId.toLowerCase()}`,
      storage: getRxStorageDexie(),
      multiInstance: true,
    });
    await documents.addCollections({ records: { schema, conflictHandler } });
    const assets = new AssetDatabase(userId);
    await assets.open();
    return { documents, assets, userId };
  })();
  databases.set(userId, opening);
  opening.catch(() => databases.delete(userId));
  return opening;
}

/** Called only after the user explicitly deletes their account. Ordinary logout retains edits. */
export async function deleteLocalAccount(userId: string): Promise<void> {
  const local = await openLocalDatabase(userId);
  await local.documents.remove();
  await local.assets.delete();
  databases.delete(userId);
}
