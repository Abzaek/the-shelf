"use client";

import { useCallback, useEffect, useRef } from "react";
import { storage } from "@/lib/storage";

/**
 * Debounced progress persistence. Writes the latest page after a short pause
 * and flushes immediately on unmount / tab hide so nothing is lost.
 */
export function useReadingProgress(bookId: string | undefined, delay = 600) {
  const pending = useRef<{ currentPage: number; totalPages: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (!bookId || !pending.current) return;
    const payload = pending.current;
    pending.current = null;
    void storage.saveProgress(bookId, payload).catch(() => {
      /* progress is best-effort */
    });
  }, [bookId]);

  const saveProgress = useCallback(
    (currentPage: number, totalPages: number) => {
      pending.current = { currentPage, totalPages };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [flush, delay],
  );

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  return { saveProgress, flush };
}
