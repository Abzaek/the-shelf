/**
 * Deterministic, muted "cloth binding" palette for generated typographic covers.
 * Each entry: [background, foreground, accent]. Kept desaturated so books
 * read as a real shelf rather than a rainbow.
 */
const PALETTES: [string, string, string][] = [
  ["#2f3a4a", "#f3ede2", "#c8a96a"], // slate blue
  ["#4a3b32", "#f4ecdf", "#d6b27a"], // oxblood brown
  ["#2d4a3e", "#f1efe4", "#c9b07a"], // forest
  ["#5a2f33", "#f6eee6", "#d8b58c"], // wine
  ["#3d3a52", "#f2eef4", "#c9b48e"], // plum grey
  ["#6b4b2b", "#f7efe1", "#e0c08a"], // tan leather
  ["#22333b", "#eef1f0", "#b9a77b"], // deep teal
  ["#4d4a3e", "#f4f1e8", "#d0b880"], // olive
  ["#3a2c40", "#f3edf3", "#c8a97a"], // aubergine
  ["#284b63", "#eef3f5", "#c2a878"], // navy
];

export function paletteFor(seed: string): { bg: string; fg: string; accent: string } {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const [bg, fg, accent] = PALETTES[hash % PALETTES.length];
  return { bg, fg, accent };
}
