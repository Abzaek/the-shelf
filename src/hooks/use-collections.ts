"use client";

import { useLibrary } from "@/components/library-provider";

export function useCollections() {
  const { collections, collectionsLoading } = useLibrary();
  return { collections, loading: collectionsLoading };
}
