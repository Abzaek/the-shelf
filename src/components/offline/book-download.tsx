"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Book } from "@/types";
import { isDownloaded, removeDownload } from "@/lib/storage/local/assets";
import { storage, storageEvents } from "@/lib/storage";
export function BookDownload({ book }: { book: Book }) {
  const [downloaded, setDownloaded] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    const refresh = () => {
      void isDownloaded(book)
        .then((value) => {
          if (live) setDownloaded(value);
        })
        .catch(() => {});
    };
    refresh();
    const unsubscribe = storageEvents.subscribe((topic, id) => {
      if (topic === "downloads" && (!id || id === book.id)) refresh();
    });
    return () => {
      live = false;
      unsubscribe();
    };
  }, [book]);
  const toggle = async () => {
    setBusy(true);
    try {
      if (downloaded) await removeDownload(book);
      else {
        const file = await storage.getFile(book.id);
        if (!file)
          throw new Error("The book file has not finished uploading from its original device.");
        if (book.coverId) await storage.getCover(book.id).catch(() => undefined);
      }
      setDownloaded(await isDownloaded(book));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change the download.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {downloaded ? "Downloaded on this device" : "Not downloaded on this device"} ·{" "}
        {book.fileSource === "drive" ? "Google Drive" : "Shelf storage"}
      </p>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void toggle()}>
        {busy ? "Please wait…" : downloaded ? "Remove download" : "Download for offline reading"}
      </Button>
    </div>
  );
}
