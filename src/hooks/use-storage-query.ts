"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { storageEvents } from "@/lib/storage";
import type { StorageTopic } from "@/lib/storage/events";

interface QueryState<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
}

/**
 * Runs an async storage read and re-runs it whenever one of the given
 * topics changes. Keeps the last good data while refreshing (no flicker).
 */
export function useStorageQuery<T>(
  topics: StorageTopic[],
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
  /** Only refresh when the emitted id matches (or no id was emitted). */
  filterId?: string,
) {
  const [state, setState] = useState<QueryState<T>>({ data: undefined, loading: true, error: null });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const requestId = useRef(0);

  const run = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const data = await fetcherRef.current();
      if (id === requestId.current) setState({ data, loading: false, error: null });
    } catch (err) {
      if (id === requestId.current) {
        setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err : new Error(String(err)) }));
      }
    }
  }, []);

  useEffect(() => {
    setState((s) => ({ ...s, loading: s.data === undefined }));
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, ...deps]);

  useEffect(() => {
    return storageEvents.subscribe((topic, id) => {
      if (!topics.includes(topic)) return;
      if (filterId && id && id !== filterId) return;
      void run();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, filterId, ...topics]);

  return { ...state, refresh: run };
}
