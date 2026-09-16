# Offline reading and synchronization

## Protocol v1

`SyncDocument` has a stable composite ID, type, entity key, optional book reference, JSON payload, and `_deleted`. Entity types are books, notes, bookmarks, collections, memberships, and settings. Schema validation lives in `src/lib/sync/validation.ts`.

- Pull uses a monotonically increasing **server** sequence, not device timestamps.
- Push includes the client's assumed server state and proposed state. SQLite compares and writes in one transaction.
- Retrying a previously accepted value succeeds without duplicate effects. The client splits oversized metadata batches below the API’s 4 MB body limit; accepted sub-batches remain safe to retry.
- RxDB owns replication retries, checkpoints, multi-tab leadership, and local persistence. Our conflict handler expresses product policy. The UI derives pending removals from durable acknowledgements, so a pulled tombstone does not look like an unsent local deletion and reloads do not hide pending removals.
- Parent metadata accompanies child writes when needed, so an offline note can synchronize even if its book is new.
- Tombstones remain indefinitely in v1. A future retention policy must define a minimum checkpoint and a safe full-resync path first.

## Conflict rules

- Independent fields use three-way merging against the assumed state.
- Simultaneous scalar changes prefer the server value.
- Notes preserve concurrent text in `conflictCopies`, displayed in the reader and retained in exports.
- Resume page/CFI/progress form one unit. Concurrent resume edits prefer the server's position, while `readingPositions` retains per-device positions for explicit selection.
- Collection membership is a separate record per book/collection. Explicit re-add after observing a removed membership is allowed; stale edits cannot resurrect a deleted book or collection.
- Deletions win over concurrent edits. Restoring a backup uses new book IDs.
- PDF pages and EPUB locations are different units. Reading backwards is valid.

## File transfer

Metadata replication never includes base64 book files. Dexie retains binary file data. It normally stores Blobs; WebKit profiles that reject Blob writes use an ArrayBuffer plus MIME type, decoded by the storage adapter. This fallback requires an in-memory byte copy. An import first persists its bytes and then metadata; it is never reported as saved before both succeed. An unreferenced blob after a failed metadata write is recoverable storage, not a completed import.

Files use tus with 2 MiB chunks. The server binds each upload to account, book, kind, and revision. The server reserves quota before accepting a transfer; requests can look up the same upload to recover a lost creation response. Completion is idempotent and checks actual size, current revision, and quota before publishing. Never delete a pending local file after a failed upload. Superseded local files are exposed as recovery copies in Settings, so the reader can download them before explicitly removing them. Legacy file-replacement routes publish the same immutable revisions.

The server stores a previous committed file while a replacement is pending. Cleanup removes retired files and seven-day-old staging uploads. An expired staging upload must restart, but the original device Blob remains. Deployment uses one Node process; multi-process tus requires a shared lock provider and deserves its own ADR.

## Offline availability

A first online visit and verified sign-in are required. Only downloaded books are available offline. Service-worker installation and file download are separate readiness conditions. Safari/iOS do not guarantee sync while the app is suspended or closed; launch, resume, and reconnect trigger synchronization.

No auth, admin, API, or private file response is runtime-cached by the service worker. `/offline` contains no user data. IndexedDB is account-scoped. Explicit logout blocks cached identity restoration until another successful login. A cached identity never authorizes a server operation.

A new service worker waits for old windows to close. Do not add unconditional `skipWaiting`/reload-on-connect: unsaved editor drafts and schema compatibility need an explicit upgrade plan.

## Honest limits

Browser storage is quota-limited and may be removed. Request persistence, expose download state, and preserve JSON/ZIP backup tools. Stored data is not encrypted against access to the device profile. Remote account revocation cannot retract already downloaded content from an offline device.

Existing admin engagement analytics remain online observations; offline reading progress synchronizes but historical offline reading duration is not inferred or replayed as online heartbeats. Do not describe those analytics as complete offline engagement totals. A future duration queue needs event IDs, original observation times, bounded durations, and server deduplication.

## Required regression scenarios

Offline cold launch; two-device note edits; independent collection membership edits; removal then explicit re-add; remote deletion vs stale edit; duplicate pushes; account switch during transfer; expired session; incomplete uploads; lost responses; quota rejection; browser restart; both PDF and EPUB; schema/service-worker update while edits are pending.
