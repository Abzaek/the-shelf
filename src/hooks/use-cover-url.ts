"use client";

import { useEffect, useState } from "react";
import { storage, storageEvents } from "@/lib/storage";

/**
 * Shared object-URL cache for cover thumbnails. Every card asking for the
 * same cover gets the same URL. Entries are invalidated only when a cover
 * actually changes (the "covers" storage topic), never on progress updates.
 */
const cache = new Map<string, Promise<string | null>>();

function invalidate(coverId: string) {
  const entry = cache.get(coverId);
  cache.delete(coverId);
  // Revoke lazily so components that still hold the old URL can swap first.
  entry?.then((url) => url && setTimeout(() => URL.revokeObjectURL(url), 5000));
}

storageEvents.subscribe((topic, id) => {
  if (topic !== "covers") return;
  if (id) invalidate(id);
  else for (const key of Array.from(cache.keys())) invalidate(key);
});

function getCoverUrl(coverId: string): Promise<string | null> {
  let entry = cache.get(coverId);
  if (!entry) {
    entry = storage
      .getCover(coverId)
      .then((blob) => (blob ? URL.createObjectURL(blob) : null))
      .catch(() => null);
    cache.set(coverId, entry);
  }
  return entry;
}

export function useCoverUrl(coverId: string | null | undefined): string | null {
  const [resolved, setResolved] = useState<{ coverId: string; gen: number; url: string | null } | null>(null);
  const [gen, setGen] = useState(0);

  // Re-fetch when this cover is replaced.
  useEffect(() => {
    if (!coverId) return;
    return storageEvents.subscribe((topic, id) => {
      if (topic === "covers" && (!id || id === coverId)) setGen((g) => g + 1);
    });
  }, [coverId]);

  useEffect(() => {
    if (!coverId) return;
    let active = true;
    getCoverUrl(coverId).then((url) => active && setResolved({ coverId, gen, url }));
    return () => {
      active = false;
    };
  }, [coverId, gen]);

  if (!coverId) return null;
  // Keep showing the previous URL for the same cover while a refresh is in flight.
  return resolved?.coverId === coverId ? resolved.url : null;
}

/** Object URL for a transient blob (e.g. an upload preview). Revoked on change/unmount. */
export function useBlobUrl(blob: Blob | null | undefined): string | null {
  const [entry, setEntry] = useState<{ blob: Blob; url: string } | null>(null);
  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    let cancelled = false;
    // Defer the state update so StrictMode's mount/unmount/mount cycle never
    // leaves a revoked URL behind.
    queueMicrotask(() => !cancelled && setEntry({ blob, url }));
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [blob]);
  return blob && entry?.blob === blob ? entry.url : null;
}
