/**
 * Generates a small, valid, multi-page PDF entirely in the browser.
 * Used for sample books so the whole read/bookmark/note flow can be tried
 * without shipping any copyrighted files. Pages carry a chapter heading,
 * body text and an outline so the table of contents can be exercised too.
 */

const PAGE_W = 432; // 6in
const PAGE_H = 648; // 9in

const FILLER = [
  "Every library begins with a single book placed on a shelf with intention.",
  "This page stands in for the real text. It exists so that navigation, search,",
  "bookmarks and notes can be tried before any of your own books are added.",
  "Reading is a quiet kind of conversation: the author speaks, and the reader",
  "answers in the margins. A shelf is simply where those conversations are kept.",
  "Turn the page to continue. Nothing here is copyrighted; it is placeholder prose,",
  "written to be searched for, bookmarked, annotated and then forgotten.",
];

function escapePdfText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrap(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > maxChars) {
      lines.push(line.trim());
      line = w;
    } else {
      line += " " + w;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

export interface PlaceholderPdfOptions {
  title: string;
  author: string;
  pages: number;
  chapterEvery?: number;
}

export function createPlaceholderPdf({ title, author, pages, chapterEvery = 6 }: PlaceholderPdfOptions): Blob {
  const objects: string[] = []; // 1-indexed; objects[i-1] is object i
  const add = (body: string) => {
    objects.push(body);
    return objects.length;
  };

  const catalogId = add(""); // placeholder, filled later
  const pagesId = add("");
  const fontSerifId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>");
  const fontSerifBoldId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>");
  const fontSansId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const infoId = add(
    `<< /Title (${escapePdfText(title)}) /Author (${escapePdfText(author)}) /Producer (The Shelf) /Creator (The Shelf sample generator) >>`,
  );
  const resources = `<< /Font << /F1 ${fontSerifId} 0 R /F2 ${fontSerifBoldId} 0 R /F3 ${fontSansId} 0 R >> >>`;

  const pageIds: number[] = [];
  const chapterStarts: { page: number; title: string }[] = [];
  let chapter = 0;

  for (let p = 1; p <= pages; p++) {
    const ops: string[] = [];
    if (p === 1) {
      // Title page
      const titleLines = wrap(title, 22);
      let y = 420;
      ops.push("BT /F2 30 Tf");
      for (const line of titleLines) {
        ops.push(`1 0 0 1 48 ${y} Tm (${escapePdfText(line)}) Tj`);
        y -= 38;
      }
      ops.push("ET");
      ops.push(`BT /F1 15 Tf 1 0 0 1 48 ${y - 18} Tm (${escapePdfText(author)}) Tj ET`);
      ops.push("0.55 0.45 0.3 RG 1.2 w 48 300 m 384 300 l S");
      ops.push(`BT /F3 9 Tf 0.45 g 1 0 0 1 48 72 Tm (${escapePdfText("Sample edition. Placeholder text for The Shelf.")}) Tj ET`);
    } else {
      const isChapterStart = (p - 2) % chapterEvery === 0;
      let y = PAGE_H - 96;
      if (isChapterStart) {
        chapter += 1;
        const heading = `Chapter ${chapter}`;
        chapterStarts.push({ page: p, title: heading });
        ops.push(`BT /F3 9 Tf 0.5 g 1 0 0 1 48 ${y + 26} Tm (${escapePdfText(heading.toUpperCase())}) Tj ET`);
        ops.push(`BT /F2 22 Tf 0 g 1 0 0 1 48 ${y - 6} Tm (${escapePdfText(`On the shelf, part ${chapter}`)}) Tj ET`);
        y -= 56;
      }
      ops.push("BT /F1 11.5 Tf 0 g 15 TL");
      ops.push(`1 0 0 1 48 ${y} Tm`);
      const paragraphs = [...FILLER, `This is page ${p} of ${pages} in "${title}".`];
      for (const para of paragraphs) {
        for (const line of wrap(para, 68)) ops.push(`(${escapePdfText(line)}) Tj T*`);
        ops.push("T*");
      }
      ops.push("ET");
      ops.push(`BT /F3 9 Tf 0.5 g 1 0 0 1 ${PAGE_W / 2 - 8} 40 Tm (${p}) Tj ET`);
    }
    const stream = ops.join("\n");
    const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources ${resources} /Contents ${contentId} 0 R >>`,
    );
    pageIds.push(pageId);
  }

  // Outline
  let outlinesId = 0;
  if (chapterStarts.length) {
    outlinesId = add("");
    const itemIds = chapterStarts.map(() => add(""));
    itemIds.forEach((id, i) => {
      const { page, title: t } = chapterStarts[i];
      const prev = i > 0 ? `/Prev ${itemIds[i - 1]} 0 R` : "";
      const next = i < itemIds.length - 1 ? `/Next ${itemIds[i + 1]} 0 R` : "";
      objects[id - 1] = `<< /Title (${escapePdfText(t)}) /Parent ${outlinesId} 0 R ${prev} ${next} /Dest [${pageIds[page - 1]} 0 R /Fit] >>`;
    });
    objects[outlinesId - 1] = `<< /Type /Outlines /First ${itemIds[0]} 0 R /Last ${itemIds[itemIds.length - 1]} 0 R /Count ${itemIds.length} >>`;
  }

  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R ${outlinesId ? `/Outlines ${outlinesId} 0 R /PageMode /UseOutlines` : ""} >>`;

  // Serialize with xref
  let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${off.toString().padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  // Encode as latin1 bytes so offsets match string lengths.
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return new Blob([bytes], { type: "application/pdf" });
}
