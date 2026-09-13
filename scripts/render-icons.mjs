// Renders the bookshelf icon to PNG without any image library:
// shapes are rasterized with 4x supersampling and encoded via zlib.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const SHAPES = [
  // x, y, w, h, radius, color, rotation(deg) about bottom-center
  { bg: true, r: 14, color: "#1c1a17" },
  { x: 12, y: 46, w: 40, h: 4, r: 1.5, color: "#c8a96a" },
  { x: 14, y: 16, w: 8, h: 30, r: 1.5, color: "#4a3b32" },
  { x: 24, y: 12, w: 9, h: 34, r: 1.5, color: "#c8a96a" },
  { x: 35, y: 20, w: 7, h: 26, r: 1.5, color: "#5a2f33" },
  { x: 44, y: 18, w: 7, h: 28, r: 1.5, color: "#2f3a4a", rot: 8, cx: 47.5, cy: 46 },
  { x: 26, y: 18, w: 5, h: 1.6, r: 0.8, color: "#1c1a17", alpha: 0.55 },
  { x: 26, y: 36, w: 5, h: 1.6, r: 0.8, color: "#1c1a17", alpha: 0.55 },
];

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

function insideRounded(px, py, x, y, w, h, r) {
  if (px < x || px > x + w || py < y || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

function render(size) {
  const SS = 4;
  const S = size / 64;
  const px = new Float32Array(size * size * 4);
  for (const s of SHAPES) {
    const [cr, cg, cb] = hex(s.color);
    const a = s.alpha ?? 1;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let hits = 0;
        for (let sy = 0; sy < SS; sy++) {
          for (let sx = 0; sx < SS; sx++) {
            let ux = (x + (sx + 0.5) / SS) / S;
            let uy = (y + (sy + 0.5) / SS) / S;
            if (s.rot) {
              const t = (-s.rot * Math.PI) / 180;
              const dx = ux - s.cx, dy = uy - s.cy;
              ux = s.cx + dx * Math.cos(t) - dy * Math.sin(t);
              uy = s.cy + dx * Math.sin(t) + dy * Math.cos(t);
            }
            const inside = s.bg ? insideRounded(ux, uy, 0, 0, 64, 64, s.r) : insideRounded(ux, uy, s.x, s.y, s.w, s.h, s.r);
            if (inside) hits++;
          }
        }
        if (!hits) continue;
        const cov = (hits / (SS * SS)) * a;
        const i = (y * size + x) * 4;
        const da = px[i + 3];
        const outA = cov + da * (1 - cov);
        for (let c = 0; c < 3; c++) px[i + c] = ([cr, cg, cb][c] * cov + px[i + c] * da * (1 - cov)) / (outA || 1);
        px[i + 3] = outA;
      }
    }
  }
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4, o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = Math.round(px[i]); raw[o + 1] = Math.round(px[i + 1]); raw[o + 2] = Math.round(px[i + 2]); raw[o + 3] = Math.round(px[i + 3] * 255);
    }
  }
  const crcTable = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (buf) => { let c = -1; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

writeFileSync("src/app/apple-icon.png", render(180));
writeFileSync("src/app/icon1.png", render(192));
console.log("icons rendered");
