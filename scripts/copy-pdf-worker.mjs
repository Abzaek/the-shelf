// Copies the pdf.js worker that matches the installed pdfjs-dist into /public
// so the reader can load it from a stable same-origin URL.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const workerPath = require.resolve("pdfjs-dist/build/pdf.worker.min.mjs");
const publicDir = join(root, "public");
if (!existsSync(publicDir)) mkdirSync(publicDir);
copyFileSync(workerPath, join(publicDir, "pdf.worker.min.mjs"));
console.log("Copied pdf.js worker to public/pdf.worker.min.mjs");
