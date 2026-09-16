# The Shelf

A private, personal digital bookshelf for the PDFs and EPUBs you own. Open The Shelf, browse your books, pick one, read.

Books, notes, bookmarks, collections and progress save on the device first and synchronize to your private account. Downloaded PDFs and EPUBs work offline after the first online setup. Hosted files have a 50 MiB default allowance per account and a 10 GiB whole-store cap; optional Google Drive books stay in the reader’s own Drive. Account libraries remain private.

## Run it

```bash
pnpm install
pnpm dev
```

Then open http://localhost:3000 and create an account (the configured `SHELF_SUPERADMIN_EMAIL` receives the super-admin role). Data goes to `./.data` in development; see `.env.example` for the knobs. `pnpm build && pnpm start` serves a production build.

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
| `SHELF_USER_QUOTA_BYTES` | 50 MiB | Hosted files and covers per account |
| `SHELF_TOTAL_QUOTA_BYTES` | 10 GB | Whole-store cap |
| `SHELF_REGISTRATION` | `open` | Default for sign-up; admins can flip it at runtime |
| `SHELF_SUPERADMIN_EMAIL` | `abzaeko@gmail.com` | The one account that manages admins |
| `RESEND_API_KEY` | — | Resend key for email. Without it, emails go to the server log |
| `SHELF_EMAIL_FROM` | `The Shelf <shelf@abzaek.dev>` | Sender; the domain must be verified in Resend |
| `SHELF_APP_URL` | `https://shelf.abzaek.dev` | Origin used in email links |
| `SHELF_REQUIRE_EMAIL_VERIFICATION` | on when key set | Force verification on/off |

### Roles and admin

Three roles: `user`, `admin`, `superadmin`. The super admin is pinned to `SHELF_SUPERADMIN_EMAIL` (default `abzaeko@gmail.com`): that account gets the role automatically when it registers, can't be demoted, disabled or deleted, and is the only one who can promote or demote admins. Admins can see `/admin` (analytics) and `/admin/users` (accounts): set quotas, mark emails verified, disable/enable, sign out everywhere, delete readers, and toggle registration at runtime. Every admin action is written to an audit log shown on the page. All admin pages and `/api/admin/*` routes check the role server-side.

When email verification is enabled, new accounts receive a confirmation link (valid 24 h, single-use). Until confirmed, the account can sign in but every library route returns 403 and the app shows a "check your inbox" screen with a resend button (3 per hour).

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

## Deploying

Every push runs CI (architecture boundaries, formatting, typecheck, lint, server tests, build, and production browser tests). Pushes to `main` that pass are deployed by the same workflow: the standalone build is rsynced to the server as a new release, `deploy/activate.sh` swaps in the Linux `better-sqlite3` build, flips the `current` symlink, reloads pm2, health-checks, and rolls back the symlink if the new release doesn't answer. `./deploy/deploy.sh` does the same from a workstation. Secrets live on the server in `shelf.env`; the workflow only needs an SSH deploy key.

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
    storage/           BookStorage interface + local RxDB/Dexie implementation
    pdf/               pdf.js setup, metadata, thumbnails, outline, text search, placeholder generator
    epub/              epub.js setup, metadata, cover, TOC, locations cache, text search
    sync/              RxDB replication, protocol, conflicts, tus transfers
    drive/             Google Picker adapter
    backup/            versioned export / import (JSON and zip)
    utils/
  types/               data model
```

Library and reader UI use the `BookStorage` interface in `src/lib/storage/bookStorage.ts`, implemented by `local/bookStorage.ts`. Auth, installation, and Drive use small feature services. RxDB owns durable replication, checkpoints, retries, and tab leadership; the server applies authenticated compare-and-swap writes. Storage events refresh views automatically. The old HTTP adapter remains for compatibility, but it is not the normal reader data path.

**Server** (`src/server/`, `src/app/api/`): SQLite via `better-sqlite3` (WAL, numbered migrations), scrypt password hashes, opaque session tokens in an httpOnly cookie with sliding 30-day expiry, per-IP/per-email login rate limiting, email verification through Resend (hashed single-use tokens). Every table is scoped by `user_id` and every route resolves the session before touching data. Hosted files use immutable revisions under `<SHELF_DATA_DIR>/users/<userId>/` and stream with HTTP Range support; existing legacy file paths remain readable. Resumable tus uploads stage separately until validated completion. Uploads are checked against the account quota, the global cap, and free disk space before a byte is written.

Shelf cards only load the small cover thumbnail; the full file is fetched only when the reader opens.

Not supported: MOBI / AZW3 / KFX. Convert those to EPUB first (e.g. with Calibre).

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui · Lucide · react-pdf / pdf.js · epub.js · RxDB / Dexie · Serwist · tus · better-sqlite3 · zod · fflate · sonner · next-themes

## Offline personal reading

The Shelf now uses account-scoped local storage and RxDB synchronization. Install the app from your browser, download books in Settings or book details, and keep reading offline. Imports and edits save on the device before synchronizing; keep the app open while files upload. Hosted storage defaults to 50 MiB per account. Google Drive is optional and requires operator configuration.

Contributor entry point: [AGENTS.md](AGENTS.md). Read the [architecture](docs/architecture/overview.md), [offline protocol](docs/architecture/offline-sync.md), [change workflow](docs/contributing.md), and [Drive setup](docs/google-drive-setup.md) before making changes. Community and author commerce are outside this release.

Verification details and manual coverage limits: [offline reading test report](docs/testing/offline-reading-2026-09-16.md).
