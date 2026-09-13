/**
 * Tiny pub/sub so hooks can refresh when storage changes,
 * without the UI ever touching IndexedDB directly.
 */
export type StorageTopic = "books" | "covers" | "bookmarks" | "notes" | "collections" | "settings";

type Listener = (topic: StorageTopic, id?: string) => void;

const listeners = new Set<Listener>();

export const storageEvents = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  emit(topic: StorageTopic, id?: string): void {
    for (const l of listeners) l(topic, id);
  },
};
