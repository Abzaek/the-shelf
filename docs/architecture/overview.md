# The Shelf architecture

Read `AGENTS.md` first. Scope is private personal reading plus an invite-only community pilot. Commerce remains deferred. Read `community.md` for the separate membership and publication boundary.

## Runtime boundaries

| Module | Responsibility |
| --- | --- |
| `src/components`, `src/hooks` | UI and view state; use the storage contract, never database drivers |
| `src/lib/storage/bookStorage.ts` | Stable reader/library storage interface |
| `src/lib/storage/local` | Account-scoped RxDB metadata; Dexie binary files and EPUB location caches; local CRUD and backups |
| `src/lib/sync` | Versioned wire documents, validation, three-way conflict policy, RxDB replication lifecycle, tus client |
| `src/server/sync` | SQLite compare-and-swap, ordered change feed, compatibility projections, uploads, cleanup |
| `src/server/repo.ts` | User-scoped relational reads and legacy APIs |
| `src/server/drive`, `src/lib/drive` | OAuth, encrypted credentials, Google file access, user-triggered picker |
| `src/components/offline` | Installation, sync state, download management, offline shell |
| `src/app/sw.ts` | Serwist service worker: app assets and a public offline shell only |
| `src/lib/community`, `src/server/community`, `src/components/community` | Shared contracts/client, membership-authorized services, and community UI; separate from private replication |
| `src/server/analytics` | Existing online engagement instrumentation and reports |

## Read and write flow

1. Online login caches account identity (not credentials), then opens that account's local databases.
2. UI reads and writes locally, regardless of connectivity. RxDB persists changes and replication checkpoints.
3. RxDB pushes and pulls through `/api/sync`. The server authenticates the session, matches the intended account, validates documents, and applies writes atomically.
4. Book bytes are stored separately. Imported files remain durable in IndexedDB while tus uploads chunks; an explicit completion step publishes the file.
5. Selecting a Drive file creates metadata and a reference, not a server-side copy. Downloads stream through an authenticated endpoint into device storage.
6. Serwist precaches the application. Offline document navigation renders `/offline`, whose client UI opens the same local account database.

## Identity and storage

Each account has `shelf-v1-<id>` (RxDB) and `shelf-assets-v1-<id>` (Dexie). Sign-out locks local access and stops replication, but retains pending work for the same account's next online login. This is account separation in the application, not encryption against someone with access to the browser profile. Explicit account deletion also erases that account’s local databases on the current device. Other offline devices cannot be remotely erased. Clearing browser data can destroy unsynced work; backups remain important.

`Book.fileSource` distinguishes hosted files from Drive files. Revisioned file and cover IDs prevent an old download from being mistaken for a newer file. A book can exist on the server before its bytes arrive; the UI reports local/pending state and unavailable downloads honestly.

Hosted storage defaults to 50 MiB (52,428,800 bytes), including hosted covers. Existing accounts using the former default 250 MiB migrate to 50 MiB without deleting books. Explicit other quotas remain. Operators must also review environment overrides.

## Existing database and compatibility

SQLite and the standalone Next.js deployment are retained to avoid adding an operating burden. The old relational tables remain readable by admin reports and legacy APIs. `captureLibrary` projects their state into a monotonic, user-scoped change feed inside a transaction. This intentionally performs a library-sized scan; see the ADR before replacing it with triggers or a separate service.

No browser component should know the replication document layout. Public `BookStorage` operations are the extension point for future features.
