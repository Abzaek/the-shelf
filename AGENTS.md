<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# The Shelf: contributor contract

This file is the canonical instruction entry point for humans and AI agents. Read it before changing code. `CLAUDE.md` points here; do not maintain a second rule set for a particular model.

## Product boundary

- Current scope: reliable, private personal reading: PDF/EPUB, offline reading, synchronization, installation, and an optional user-owned Drive library.
- Community features are not part of this implementation. Author commerce is deferred for at least one year from 2026-09-16 (until 2027-09-16), and still requires an explicit product decision afterwards.
- Never turn a private upload, note, profile, or reading activity into public content implicitly.
- No paid service, extra infrastructure dependency, or credential requirement without documenting why and how it affects deployment. Drive must remain optional.

## Read before editing

1. `docs/architecture/overview.md` — module ownership and data paths.
2. `docs/architecture/offline-sync.md` — correctness invariants and conflict semantics.
3. `docs/contributing.md` — change workflow, tests, and completion checklist.
4. `docs/decisions/0001-local-first-reading.md` — accepted tradeoffs.
5. Relevant installed Next.js docs above; use installed dependency types/source for library APIs.

## Non-negotiable boundaries

- UI calls `BookStorage` and small feature services. Do not import SQLite, RxDB, Dexie, or server runtime modules into components/hooks. Type-only DTO imports are permitted.
- Browser persistence lives in `src/lib/storage/local/`. Replication transport/lifecycle lives in `src/lib/sync/`. Server sync/projections/uploads live in `src/server/sync/`. Google code lives in `src/server/drive/` and `src/lib/drive/`.
- Pure protocol types, validation, and conflict functions must not import React, browser globals, database implementations, or secrets.
- Keep API route handlers thin: authenticate, validate, call a server service, return a response.
- Never add a second outbox or custom replication algorithm alongside RxDB. Use tus for resumable binary transfer. Document any dependency replacement in a new ADR.
- Every server read/write must be scoped to the authenticated user. Device requests also bind the intended user ID. Never trust user IDs, roles, file paths, or quotas from replicated documents.
- Account caches are isolated. API responses and private files must never enter a shared service-worker cache. New offline routes must use the public data-free shell.
- Persist before reporting success. Never discard pending writes/files to recover from a network error, quota error, logout, or migration failure.
- Deletions require tombstones. Note conflicts preserve both versions. Never resolve all conflicts with device-clock last-write-wins.
- Server migrations are additive and transactional. Never rewrite an already released migration. Local schema/transport changes require a migration/version strategy and restart/upgrade tests.
- Keep secrets server-side and out of logs, fixtures, commits, browser storage, and documentation. Drive refresh tokens are encrypted at rest.

## Verification and documentation

- Run `pnpm check` for relevant code changes. Run `pnpm test:e2e` against a production build when changing reader, sync, auth, PWA, or file transfer behavior.
- Add tests for failure cases and cross-account access, not only successful requests. Do not weaken checks to make them pass.
- Update architecture/ADR/setup docs in the same change as behavior. Record limitations honestly: emulated WebKit is not a physical iPhone test; a configured OAuth flow is not a verified Google integration.
- Inspect the diff for unrelated changes and secrets. Do not modify existing user work without a task-related reason.
- State what changed, what was tested, what remains unverified, and any required deployment configuration. Do not claim a deployment, merge, or live verification you did not perform.

Instructions guide contributors; automated checks enforce what can be checked mechanically. No document guarantees that an arbitrary AI system obeys every rule.
