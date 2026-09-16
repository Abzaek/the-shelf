import type { BookStorage } from "./bookStorage";
import { LocalBookStorage } from "./local/bookStorage";

/**
 * Single storage instance used by hooks and app logic. The UI only knows the
 * BookStorage interface; reads and writes the account-scoped local database. RxDB syncs separately.
 */
export const storage: BookStorage = new LocalBookStorage();
export { storageEvents } from "./events";
export { ApiError } from "./httpStorage";
export type { BookStorage } from "./bookStorage";
