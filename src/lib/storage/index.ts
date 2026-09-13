import type { BookStorage } from "./bookStorage";
import { HttpBookStorage } from "./httpStorage";

/**
 * Single storage instance used by hooks and app logic. The UI only knows the
 * BookStorage interface; today it talks to the server API.
 */
export const storage: BookStorage & HttpBookStorage = new HttpBookStorage();
export { storageEvents } from "./events";
export { ApiError } from "./httpStorage";
export type { BookStorage } from "./bookStorage";
