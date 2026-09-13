"use client";

import { useEffect, useState } from "react";
import { storage, storageEvents } from "@/lib/storage";

/**
 * Cover image URL for a book. Served by the API with long cache headers; the
 * version query changes whenever the cover is replaced so the browser refetches.
 */
export function useCoverUrl(coverId: string | null | undefined, version?: string): string | null {
  const [gen, setGen] = useState(0);
  useEffect(() => {
    if (!coverId) return;
    return storageEvents.subscribe((topic, id) => {
      if (topic === "covers" && (!id || id === coverId)) setGen((g) => g + 1);
    });
  }, [coverId]);
  if (!coverId) return null;
  return storage.coverUrl(coverId, `${version ?? ""}-${gen}`);
}

/** Object URL for a transient blob (e.g. an upload preview). Revoked on change/unmount. */
export function useBlobUrl(blob: Blob | null | undefined): string | null {
  const [entry, setEntry] = useState<{ blob: Blob; url: string } | null>(null);
  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    let cancelled = false;
    queueMicrotask(() => !cancelled && setEntry({ blob, url }));
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [blob]);
  return blob && entry?.blob === blob ? entry.url : null;
}
