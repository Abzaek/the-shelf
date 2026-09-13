# The Shelf

A private, personal digital bookshelf for the PDFs and EPUBs you own. Open The Shelf, browse your books, pick one, read.

Books, covers, notes, bookmarks and reading progress live on the server, per account. Sign up with an email and password; each account gets its own quota (250 MB by default), and the whole store has a hard cap (10 GB by default). Nothing is shared between accounts.

## Run it

```bash
pnpm install
pnpm dev
```

Then open http://localhost:3000 and create the first account (it becomes the admin). Data goes to `./.data` in development; see `.env.example` for the knobs. `pnpm build && pnpm start` serves a production build.

The `predev` / `prebuild` scripts copy the pdf.js worker that matches the installed `pdfjs-dist` into `public/pdf.worker.min.mjs`.

## What it does

- **Shelf** — cover-first grid (2 columns on phones, up to 7 on wide screens), Continue Reading and Recently Added sections, filters for Reading / Want to Read / Finished, collections, global search (`⌘K`).
- **Add a book** — drag a PDF or EPUB in or choose one. Title, author (and for EPUB, description) come from the file's metadata; the first PDF page or the EPUB cover image becomes the cover unless you upload your own. Categories, tags, description and status are editable.
- **PDF reader** — single page or continuous scroll, fit width / fit page / zoom, fullscreen, table of contents, full-text search with on-page highlights, bookmarks, per-page notes, keyboard shortcuts.
- **EPUB reader** — paginated or scrolled, adjustable text size, light/dark themed content, table of contents, full-text search with in-text highlights, bookmarks and notes pinned to exact positions (CFIs). Progress is tracked in "locations" (roughly a paragraph each), generated once per book and cached.
- Progress is saved automatically for both formats; reopening a book resumes where you left off. Opening a Want to Read book moves it to Reading; reaching the end offers to mark it Finished.
- **Backup** — export metadata as `library-backup-v2.json`, or everything including the PDF/EPUB files as a zip. Import restores a backup (v1 or v2) without overwriting books you already have.
- **Sample books** — seven placeholder books with generated PDFs so the flow can be tried without your own files. No copyrighted PDFs are included.

### Accounts and quotas

| Env | Default | Meaning |
| --- | --- | --- |
| `SHELF_DATA_DIR` | `./.data` | SQLite file + uploaded files |
| `SHELF_SESSION_SECRET` | — | Required in production, ≥ 32 chars |
| `SHELF_USER_QUOTA_BYTES` | 250 MB | Per-account cap |
| `SHELF_TOTAL_QUOTA_BYTES` | 10 GB | Whole-store cap |
| `SHELF_REGISTRATION` | `open` | `closed` disables sign-up |

### Keyboard shortcuts in the reader

| Keys | Action |
| --- | --- |
| `←` / `PageUp`, `→` / `PageDown` | Previous / next page |
| `Home` / `End` | First / last page |
| `⌘F` / `Ctrl+F` | Search in book |
| `⌘+` / `⌘-` / `⌘0` | Zoom in / out / reset (text size for EPUB) |
| `B` | Bookmark current page |
| `F` | Fullscreen |
| `Esc` | Exit fullscreen or close the panel |

## Architecture

```
src/
  app/                 routes (App Router)
    api/               REST routes (auth, books, files, bookmarks, notes, collections, settings, library)
    (auth)/            sign in / create account
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
  server/              env, SQLite, auth/sessions, file store + quotas, user-scoped repo
  lib/
    storage/           BookStorage interface + HTTP implementation
    pdf/               pdf.js setup, metadata, thumbnails, outline, text search, placeholder generator
    epub/              epub.js setup, metadata, cover, TOC, locations cache, text search
    backup/            versioned export / import (JSON and zip)
    utils/
  types/               data model
```

The UI never talks to the API directly. Everything goes through the `BookStorage` interface in `src/lib/storage/bookStorage.ts`, implemented by `httpStorage.ts`. Storage changes are broadcast through a tiny event bus so hooks refresh automatically.

**Server** (`src/server/`, `src/app/api/`): SQLite via `better-sqlite3` (WAL, numbered migrations), scrypt password hashes, opaque session tokens in an httpOnly cookie with sliding 30-day expiry, per-IP/per-email login rate limiting. Every table is scoped by `user_id` and every route resolves the session before touching data. Files are stored at `<SHELF_DATA_DIR>/users/<userId>/<bookId>.<pdf|epub>` and streamed back with HTTP Range support. Uploads are checked against the account quota, the global cap, and free disk space before a byte is written.

Shelf cards only load the small cover thumbnail; the full file is fetched only when the reader opens.

Not supported: MOBI / AZW3 / KFX. Convert those to EPUB first (e.g. with Calibre).

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui · Lucide · react-pdf / pdf.js · epub.js · better-sqlite3 · zod · fflate · sonner · next-themes
