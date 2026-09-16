# ADR 0001: Local-first personal reading

Status: accepted for this implementation, 2026-09-16.

## Context

The Shelf must open, read, and edit downloaded personal libraries without connectivity; synchronize later; support phone and desktop installation; and avoid a paid synchronization subscription. Hosted storage is limited to 50 MiB by default. Commerce is deferred until at least 2027-09-16 and needs a separate decision then.

## Decision

Use RxDB's free Dexie storage adapter and replication engine, with a small authenticated compare-and-swap API on the current SQLite backend. Keep blobs in a separate Dexie database; use tus for resumable uploads. Use Serwist with Next.js/Turbopack for the application shell. Offer optional Google Drive Picker access to existing user-owned books, not automatic app backups or public file distribution.

## Alternatives

- PouchDB + CouchDB supplies a ready replication server but introduces a new database and operational/migration work.
- Dexie Cloud removes backend work but conflicts with the no-paid-service constraint beyond its free tier.
- PowerSync introduces source database/service changes; not justified for this private-reader release.
- An application-written request outbox would duplicate established replication machinery and make conflict behavior harder to maintain.

## Consequences

The existing deployment remains usable and the UI storage contract remains stable. We own validation, authorization, projections, conflict policies, and hosting. Free software does not mean unlimited infrastructure. The initial relational-to-change-feed bridge scans a user's metadata; measure before optimizing. The default adapter may later need a performance decision based on real libraries.

Tombstones are retained. All account data remains private. File readiness is distinct from metadata sync. Drive requires operator-owned OAuth credentials and verification/configuration in Google Cloud; core reading works without it.

## Migration and verification

Existing accounts seed into the change feed on first sync. Existing files use a `legacy` revision until replaced. Do not delete original server data during client migration. Test real offline browser restarts, two independent device databases, conflict resolution, upload recovery, and cross-account access before deployment.
