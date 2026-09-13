# The Shelf

A private, personal digital bookshelf for the PDFs you own. Open The Shelf, browse your books, pick one, read.

Everything runs in the browser. Books, covers, notes, bookmarks and reading progress are stored in IndexedDB on your device. There is no backend, no account and no network access beyond loading the app itself.

## Run it

```bash
pnpm install
pnpm dev
```

Then open http://localhost:3000. `pnpm build && pnpm start` serves a production build.

The `predev` / `prebuild` scripts copy the pdf.js worker that matches the installed `pdfjs-dist` into `public/pdf.worker.min.mjs`.

## What it does

- **Shelf** — cover-first grid (2 columns on phones, up to 7 on wide screens), Continue Reading and Recently Added sections, filters for Reading / Want to Read / Finished, collections, global search (`⌘K`).
- **Add a book** — drag a PDF in or choose one. Title, author and page count are read from the PDF; the first page becomes the cover unless you upload your own. Categories, tags, description and status are editable.
- **Reader** — single page or continuous scroll, fit width / fit page / zoom, fullscreen, table of contents, full-text search with on-page highlights, bookmarks, per-page notes, keyboard shortcuts. Progress is saved automatically; reopening a book resumes where you left off. Opening a Want to Read book moves it to Reading; reaching the last page offers to mark it Finished.
- **Backup** — export metadata as `library-backup-v1.json`, or everything including PDFs as a zip. Import restores a backup without overwriting books you already have.
- **Sample books** — seven placeholder books with generated PDFs so the flow can be tried without your own files. No copyrighted PDFs are included.

### Keyboard shortcuts in the reader

| Keys | Action |
| --- | --- |
| `←` / `PageUp`, `→` / `PageDown` | Previous / next page |
| `Home` / `End` | First / last page |
| `⌘F` / `Ctrl+F` | Search in book |
| `⌘+` / `⌘-` / `⌘0` | Zoom in / out / fit width |
| `B` | Bookmark current page |
| `F` | Fullscreen |
| `Esc` | Exit fullscreen or close the panel |

## Architecture

```
src/
  app/                 routes (App Router)
    (shelf)/           shelf pages that share the header shell
    read/[id]/         distraction-free reader
  components/
    shelf/             header, grid, cards, continue reading, search
    books/             add / edit / details dialogs, cover, status
    reader/            PdfReader, toolbar, sidebar, page views
    collections/       collections pages
    settings/          settings page
    ui/                shadcn/ui primitives
  hooks/               useBooks, useBookmarks, useNotes, useReadingProgress, useCoverUrl…
  lib/
    storage/           BookStorage interface + IndexedDB implementation
    pdf/               pdf.js setup, metadata, thumbnails, outline, text search, placeholder generator
    backup/            versioned export / import (JSON and zip)
    utils/
  types/               data model
```

The UI never touches IndexedDB directly. Everything goes through the `BookStorage` interface in `src/lib/storage/bookStorage.ts`; the IndexedDB implementation lives next to it and a SQLite-backed one could replace it without changing components or hooks. Storage changes are broadcast through a tiny event bus so hooks refresh automatically.

PDFs and cover thumbnails are stored as Blobs in dedicated object stores, never in `localStorage`. Shelf cards only load the small cover thumbnail; the full PDF is read only when the reader opens.

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui · Lucide · react-pdf / pdf.js · idb · fflate · sonner · next-themes
