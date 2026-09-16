import { replicateRxCollection } from "rxdb/plugins/replication";
import type { LocalDatabase } from "@/lib/storage/local/database";
import {
  canonical,
  documentId,
  SYNC_VERSION,
  type SyncCheckpoint,
  type SyncDocument,
  type SyncWrite,
} from "./documents";
import { syncStatus } from "./status";
import { notify } from "@/lib/storage/local/records";
import { nextUpload, uploadAsset } from "./transfers";
import { storageEvents } from "@/lib/storage/events";
export interface SyncController {
  retry: () => void;
  stop: () => Promise<void>;
}
export function startSync(local: LocalDatabase, isCurrent: () => boolean): SyncController {
  const abort = new AbortController();
  let uploading = false,
    stopped = false,
    active = false,
    authFailed = false;
  let transferError: string | null = null;
  const deleted = new Set<string>();
  const acknowledge = async (doc: SyncDocument) => {
    await local.assets.acknowledgements.put({
      id: doc.id,
      payload: doc.payload,
      deleted: doc._deleted,
    });
    if (doc._deleted) {
      deleted.delete(doc.id);
      if (doc.type === "book") await local.assets.assets.where("bookId").equals(doc.key).delete();
    }
  };
  const transport = async <T>(body: object): Promise<T> => {
    if (stopped || !isCurrent() || authFailed)
      throw new Error("Sign in again to sync this library.");
    const response = await fetch("/api/sync", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      signal: abort.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: SYNC_VERSION, userId: local.userId, ...body }),
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) authFailed = true;
      throw new Error(data.error ?? "Could not synchronize this library.");
    }
    if (isCurrent()) syncStatus.set({ error: null, lastSyncedAt: new Date().toISOString() });
    return data;
  };
  const refreshStatus = async () => {
    if (!isCurrent() || stopped) return;
    const [docs, acks, assets] = await Promise.all([
      local.documents.records.find().exec(),
      local.assets.acknowledgements.toArray(),
      local.assets.assets.where("pending").equals(1).toArray(),
    ]);
    const byId = new Map(acks.map((ack) => [ack.id, ack]));
    const liveIds = new Set(docs.map((doc) => doc.id));
    // A pull acknowledges tombstones before RxDB emits its local deletion event.
    // Derive pending removals from durable acknowledgements, including after reload.
    for (const id of deleted) if (byId.get(id)?.deleted) deleted.delete(id);
    const pendingRemovals = new Set([
      ...deleted,
      ...acks.filter((ack) => !ack.deleted && !liveIds.has(ack.id)).map((ack) => ack.id),
    ]);
    const pending =
      docs.filter((doc) => {
        const ack = byId.get(doc.id);
        return (
          !ack ||
          ack.deleted ||
          canonical(JSON.parse(ack.payload)) !== canonical(JSON.parse(doc.payload))
        );
      }).length +
      assets.length +
      pendingRemovals.size;
    if (!isCurrent()) return;
    if (transferError) syncStatus.set({ error: transferError });
    const phase = authFailed
      ? "sign-in"
      : !navigator.onLine
        ? "offline"
        : syncStatus.get().error
          ? "error"
          : active || uploading || pending
            ? "syncing"
            : !syncStatus.get().initialPullComplete
              ? "starting"
              : "saved";
    syncStatus.set({ pending, phase });
  };
  const transfer = async () => {
    if (
      uploading ||
      stopped ||
      !isCurrent() ||
      !navigator.onLine ||
      authFailed ||
      !local.documents.isLeader()
    )
      return;
    uploading = true;
    try {
      let asset = await nextUpload(local);
      while (asset && !stopped && isCurrent()) {
        await uploadAsset(local, asset, abort.signal);
        transferError = null;
        storageEvents.emit("downloads", asset.bookId);
        asset = await nextUpload(local);
      }
    } catch (error) {
      if (!stopped && isCurrent()) {
        transferError = error instanceof Error ? error.message : "File upload paused.";
        syncStatus.set({ error: transferError });
      }
    } finally {
      uploading = false;
      await refreshStatus();
    }
  };
  const replication = replicateRxCollection<SyncDocument, SyncCheckpoint>({
    replicationIdentifier: `shelf-v${SYNC_VERSION}-${local.userId}`,
    collection: local.documents.records,
    live: true,
    retryTime: 10000,
    // RxDB elects one active replication/transfer tab; followers share IndexedDB.
    waitForLeadership: true,
    pull: {
      batchSize: 100,
      handler: async (checkpoint, batchSize) => {
        const result = await transport<{ documents: SyncDocument[]; checkpoint: SyncCheckpoint }>({
          action: "pull",
          sequence: checkpoint?.sequence ?? 0,
          limit: batchSize,
        });
        await Promise.all(result.documents.map(acknowledge));
        if (isCurrent())
          syncStatus.set({ initialPullComplete: result.documents.length < batchSize });
        return result;
      },
    },
    push: {
      batchSize: 100,
      handler: async function pushBatch(writes: SyncWrite[]): Promise<SyncDocument[]> {
        const parents = new Map<string, SyncDocument>();
        for (const write of writes) {
          const doc = write.newDocumentState;
          const value = JSON.parse(doc.payload);
          const ids = [
            doc.bookId ? documentId("book", doc.bookId) : "",
            doc.type === "membership" ? documentId("collection", value.collectionId) : "",
          ].filter(Boolean);
          for (const id of ids) {
            const parent = await local.documents.records.findOne(id).exec();
            if (parent) parents.set(id, { ...parent.toJSON(), _deleted: false } as SyncDocument);
          }
        }
        const body = { action: "push", writes, parents: [...parents.values()] };
        // Large notes must fit the bounded API body without blocking the whole replica.
        // Partial success is safe: accepted sub-batches are idempotent on a retry.
        if (
          writes.length > 1 &&
          new TextEncoder().encode(JSON.stringify(body)).byteLength > 3_800_000
        ) {
          const middle = Math.ceil(writes.length / 2);
          return [
            ...(await pushBatch(writes.slice(0, middle))),
            ...(await pushBatch(writes.slice(middle))),
          ];
        }
        const result = await transport<{ conflicts: SyncDocument[] }>(body);
        const conflicted = new Set(result.conflicts.map((doc) => doc.id));
        await Promise.all(
          writes
            .filter((row) => !conflicted.has(row.newDocumentState.id))
            .map((row) => acknowledge(row.newDocumentState)),
        );
        return result.conflicts;
      },
    },
  });
  const subscriptions = [
    local.documents.records.$.subscribe((event) => {
      if (event.documentData._deleted) deleted.add(event.documentId);
      notify(event.documentData.type, event.documentData.bookId || event.documentData.key);
      void refreshStatus();
    }),
    replication.active$.subscribe((value) => {
      active = value;
      void refreshStatus();
      if (!value) void transfer();
    }),
    replication.error$.subscribe((error) => {
      if (!isCurrent() || stopped) return;
      syncStatus.set({ error: error.parameters?.errors?.[0]?.message ?? error.message });
      void refreshStatus();
    }),
    replication.received$.subscribe((doc) => {
      notify(doc.type, doc.bookId || doc.key);
      void refreshStatus();
    }),
    replication.sent$.subscribe(() => {
      void refreshStatus();
      void transfer();
    }),
  ];
  const retry = () => {
    if (!isCurrent() || stopped) return;
    authFailed = false;
    transferError = null;
    syncStatus.set({ error: null });
    replication.reSync();
    void transfer();
    void refreshStatus();
  };
  const visible = () => {
    if (document.visibilityState === "visible") retry();
  };
  const offline = () => {
    void refreshStatus();
  };
  window.addEventListener("online", retry);
  window.addEventListener("offline", offline);
  document.addEventListener("visibilitychange", visible);
  const timer = setInterval(() => {
    if (navigator.onLine && document.visibilityState === "visible" && !authFailed) {
      replication.reSync();
      void transfer();
    }
    void refreshStatus();
  }, 15000);
  return {
    retry,
    stop: async () => {
      stopped = true;
      abort.abort();
      clearInterval(timer);
      window.removeEventListener("online", retry);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visible);
      subscriptions.forEach((sub) => sub.unsubscribe());
      await replication.cancel();
    },
  };
}
