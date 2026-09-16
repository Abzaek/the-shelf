"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { syncStatus } from "@/lib/sync/status";
import { retrySync } from "@/lib/storage/local/runtime";
import { Button } from "@/components/ui/button";
import { useLibrary } from "@/components/library-provider";
import { formatBytes } from "@/lib/utils/format";
import { FileRecovery } from "./file-recovery";
import { InstallApp } from "./install-app";
import { BookDownload } from "./book-download";
import { DriveLibrary } from "@/components/offline/drive-library";
export function OfflineSettings() {
  const state = useSyncExternalStore(syncStatus.subscribe, syncStatus.get, syncStatus.server);
  const { books } = useLibrary();
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null),
    [persistent, setPersistent] = useState<boolean | null>(null);
  useEffect(() => {
    void navigator.storage?.estimate().then(setEstimate);
    void navigator.storage?.persisted().then(setPersistent);
  }, []);
  return (
    <section id="offline" className="space-y-6 border-t py-8 scroll-mt-20">
      <h2 className="font-serif text-xl">Reading anywhere</h2>
      <InstallApp />
      <div className="space-y-2">
        <h3 className="font-medium">Synchronization</h3>
        <p className="text-sm text-muted-foreground">
          Changes save on this device first. Sync resumes when you open The Shelf with a connection.
          Keep the app open while uploading books.
        </p>
        <p className="text-sm" role="status">
          {state.pending} pending ·{" "}
          {state.lastSyncedAt
            ? `Last connected ${new Date(state.lastSyncedAt).toLocaleString()}`
            : "Not yet connected"}
        </p>
        {state.error && (
          <p className="break-words text-sm text-destructive" role="alert">
            {state.error}
          </p>
        )}
        {state.phase === "sign-in" ? (
          <a className="text-sm underline" href="/login?next=/settings">
            Sign in again — keep this device’s changes
          </a>
        ) : (
          <Button variant="outline" onClick={retrySync}>
            Sync now
          </Button>
        )}
      </div>
      <div className="space-y-2">
        <h3 className="font-medium">Device storage</h3>
        <p className="text-sm text-muted-foreground">
          {estimate
            ? `${formatBytes(estimate.usage ?? 0)} used · ${formatBytes(estimate.quota ?? 0)} browser allowance`
            : "Storage information is unavailable."}
        </p>
        <p className="text-sm text-muted-foreground">
          {persistent
            ? "Persistent storage is enabled."
            : "Your browser may remove downloaded data when storage is low. You can ask it to keep your library."}{" "}
          Clearing browser data also removes unsynced work. Export a backup before clearing it.
        </p>
        {!persistent && (
          <Button
            variant="outline"
            onClick={async () => setPersistent((await navigator.storage?.persist?.()) ?? false)}
          >
            Keep library on this device
          </Button>
        )}
      </div>
      <FileRecovery />
      <DriveLibrary />
      <details>
        <summary className="cursor-pointer font-medium">Downloads ({books.length} books)</summary>
        <ul className="mt-4 space-y-5">
          {books.map((book) => (
            <li key={book.id} className="space-y-2 border-b pb-4">
              <p className="font-serif">{book.title}</p>
              <BookDownload book={book} />
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
