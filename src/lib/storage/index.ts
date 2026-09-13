import type { BookStorage } from "./bookStorage";
import { IndexedDbBookStorage } from "./indexedDbStorage";

/**
 * Single storage instance used by hooks and app logic.
 * Swap the implementation here (e.g. SQLite) without touching the UI.
 */
export const storage: BookStorage & IndexedDbBookStorage = new IndexedDbBookStorage();
export { storageEvents } from "./events";
export type { BookStorage } from "./bookStorage";
