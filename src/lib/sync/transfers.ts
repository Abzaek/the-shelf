import { Upload } from "tus-js-client";
import type { LocalDatabase, LocalAsset } from "@/lib/storage/local/database";
import { documentId } from "./documents";
import type { Book } from "@/types";
export async function uploadAsset(
  local: LocalDatabase,
  asset: LocalAsset,
  signal: AbortSignal,
): Promise<void> {
  const headers = { "X-Shelf-User": local.userId };
  if (!asset.blob) {
    const response = await fetch("/api/sync/assets", {
      method: "DELETE",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: asset.bookId, revision: asset.revision }),
      signal,
    });
    if (!response.ok) throw new Error("Could not synchronize the cover removal.");
  } else {
    const query = new URLSearchParams({
      bookId: asset.bookId,
      kind: asset.kind,
      revision: asset.revision,
    });
    const lookup = await fetch(`/api/sync/assets?${query}`, { headers, signal, cache: "no-store" });
    if (!lookup.ok) throw new Error("Sign in again to resume this upload.");
    const { upload: previous } = (await lookup.json()) as {
      upload: { url: string; completed: boolean } | null;
    };
    if (previous?.completed) {
      await local.assets.assets.update(asset.id, { pending: 0, uploadUrl: undefined });
      return;
    }
    const url = await new Promise<string>((resolve, reject) => {
      const upload = new Upload(asset.blob!, {
        endpoint: "/api/uploads",
        uploadUrl: previous?.url ?? asset.uploadUrl,
        headers,
        chunkSize: 2 * 1024 ** 2,
        retryDelays: [0, 1000, 3000, 10000],
        metadata: { bookId: asset.bookId, kind: asset.kind, revision: asset.revision },
        storeFingerprintForResuming: false,
        onAfterResponse: async () => {
          if (upload.url) await local.assets.assets.update(asset.id, { uploadUrl: upload.url });
        },
        onError: (error) => {
          signal.removeEventListener("abort", abort);
          reject(error);
        },
        onSuccess: () => {
          signal.removeEventListener("abort", abort);
          resolve(upload.url!);
        },
      });
      const abort = () => {
        void upload.abort();
        reject(new DOMException("Transfer paused", "AbortError"));
      };
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener("abort", abort, { once: true });
      upload.start();
    });
    const response = await fetch(`${url}/complete`, { method: "POST", headers, signal });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(
        error?.error ?? "Upload could not be completed. Your local file has been kept.",
      );
    }
  }
  await local.assets.assets.update(asset.id, { pending: 0, uploadUrl: undefined });
}
export async function nextUpload(local: LocalDatabase): Promise<LocalAsset | undefined> {
  for (const asset of await local.assets.assets.where("pending").equals(1).toArray()) {
    const doc = await local.documents.records.findOne(documentId("book", asset.bookId)).exec();
    if (!doc) continue;
    const book: Book = JSON.parse(doc.payload);
    if (asset.revision !== (asset.kind === "file" ? book.fileRevision : book.coverRevision))
      continue;
    const ack = await local.assets.acknowledgements.get(doc.id);
    // Only send bytes after the server knows the exact file revision. Reading edits needn't block uploads.
    if (ack && !ack.deleted) {
      const remote: Book = JSON.parse(ack.payload);
      if (asset.revision === (asset.kind === "file" ? remote.fileRevision : remote.coverRevision))
        return asset;
    }
  }
}
