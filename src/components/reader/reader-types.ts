export type ZoomState = { mode: "fit-width" } | { mode: "fit-page" } | { mode: "custom"; scale: number };

export type SidebarTab = "contents" | "bookmarks" | "notes" | "search";

/** 1pt at scale 1 equals 1 CSS px in pdf.js; readers conventionally treat 100% as 96 dpi. */
export const CSS_UNITS = 96 / 72;
export const MIN_SCALE = 0.4;
export const MAX_SCALE = 4;
export const ZOOM_STEP = 1.15;
