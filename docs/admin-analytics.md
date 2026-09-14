# The Shelf admin analytics

Open `/admin` using an administrator account. The library header includes an Analytics link for administrators. The existing first-account-is-admin rule is unchanged. No deployment or role changes are needed beyond deploying this code; migration 3 is applied automatically when the database opens.

## Architecture audit

Before instrumentation, SQLite contained users with creation dates, expiring authentication sessions, book creation/last-opened/finished timestamps, current progress and status, and file/cover sizes. It did not have durable activity events, session duration, page history, first opens, or cohort observations. Authentication session `last_seen_at` is refreshed on API access and is deliberately not used as meaningful engagement.

Current user and book counts, current reading/finished status, file quota usage, retained-item creation histories, and last-access cleanup hints use existing metadata. Deleted historical entities cannot be reconstructed. All session, duration, active-user, funnel, and retention metrics begin with instrumentation. There is no historical event backfill or production seed data.

## Storage model

- `analytics_users`: one row per user; permanent first milestones, last meaningful activity, product session boundary, and the current server-issued reading session and sequence.
- `analytics_daily_users`: one row per active user per UTC day. Counts, engaged seconds, PDF page advances, and EPUB location advances are updated atomically. DAU, WAU, MAU, and chart-bucket actives count distinct users over daily rows; they never sum daily unique counts.
- `analytics_daily_books`: one row per accessed copy per UTC day, containing opens, session starts, and reading seconds.
- `analytics_book_state`: first observed open per retained copy, preserved independently of raw event pruning.
- `analytics_events`: sparse login, library visit, upload, open, reading-session start, completion, and deletion milestones for profile timelines. Progress writes are coalesced into activity and do not create raw events. Timeline records older than 180 days are pruned when a storage snapshot is taken; profiles show the latest 100.
- `analytics_storage_daily`: upload/deletion byte totals and measured inventory snapshots. New upload bytes exclude replacements. Snapshots run on upload/delete and report reads. Missing dates are explicitly unavailable; no scheduled job is implied.
- `analytics_meta`: instrumentation start time.

WAL and the existing database connection are reused. Per-day composite primary keys and user/date indexes keep distinct activity and cohort queries off raw event history. Retention uses indexed daily existence queries, not the event log. The first implementation builds one aggregate row per current user in memory for classification and directory filters. It is appropriate for this single-instance SQLite application; at larger account counts, move directory ranking/filtering to paginated SQL and cache report summaries. Do not replace exact distinct user counts with summed DAU when adding rollups.

## Tracking behavior

Successful account creation records a signup event; it alone is not meaningful engagement. Session creation records login. The shelf shell records an explicit library visit, coalesced to at most one per minute. Upload, progress, status transitions to finished, and deletion are instrumented at the repository layer. Background GET requests are not analytics events.

PDF and EPUB readers start tracking only after their documents are ready. Every 30 seconds, a visible, focused reader with input in the last two minutes sends a heartbeat. The server accepts no client-provided durations. It measures elapsed time, caps increments at 35 seconds, rejects non-increasing sequences, coalesces rapid initial mounts, enforces book ownership, and permits one current session per user. A hidden/unfocused reader sends a best-effort pause. Five minutes without a heartbeat starts a new session. Lost pause requests can add at most one capped interval on return; tracking is best-effort and cannot prove attention. A superseded tab is ignored until reopened.

Time is assigned to the UTC date of the heartbeat, so intervals crossing midnight can place at most 35 seconds on the following date. A session's start count belongs to its start day; reading seconds may span days. PDF page counts are adjacent forward advances observed between heartbeat samples, not claimed total pages consumed. Skipped pages are not counted. EPUB locations are separate. These sampling limitations are visible in the UI.

Product sessions restart after 30 minutes without meaningful activity. Estimated duration sums nearby interaction gaps capped at 60 seconds. Reading starts become actual readers after positive observed time. A return to reading requires positive time in a different reading session.

## Reporting conventions

- Reporting dates are inclusive UTC calendar dates, with an exclusive next-day upper bound internally. Presets include 7/30/90/180/365 days, all time, and custom dates. Current day and partial buckets are allowed.
- Current inventory, activity classifications, and quota metrics remain current snapshots. Engagement metrics follow the selected dates. Rolling DAU/WAU/MAU end on the chosen end date.
- Prior-period comparisons require observed coverage for both entire periods. Existing signup dates support comparisons independently, among retained accounts. A zero baseline has no percentage change.
- Returned users have activity on a day after their first observed activity. DAU/MAU uses distinct active users.
- Exact Day 1/7/30/60/90 retention uses post-instrumentation signups and fully elapsed target UTC days. A cell with no eligible members is unavailable, never 0%. The date range selects signup cohorts; retention maturity is evaluated as of report generation.
- The ordered funnel selects post-instrumentation signups in the range and milestones reached through its end. Signup → upload → open → positive reading time → timed return → finish. First meaningful activity is separately counted.
- Inactivity uses whole elapsed days: Active 0–7, Recently inactive 8–30, Inactive 31–90, Dormant 91+. Thresholds can be changed per report. Missing observed activity is Unobserved, not Dormant.
- Potential abandonment is current reading status with last access more than the recently-inactive threshold ago. This is a heuristic, not a user intent claim. A profile uses the default 30 days.
- Completion counts use finished status transitions. Current completion rate is finished/current books. Time to completion uses retained books with observed first opens and finish timestamps within the period.
- Book-copy leaderboards keep owners separate. Cross-reader rankings approximate identity with normalized title + author and may merge editions.
- Storage is file bytes plus cover bytes, against `SHELF_TOTAL_QUOTA_BYTES`. Database files, backups, filesystem overhead, and free disk space are not part of this quota chart.

## Security and lifecycle

Both admin pages and every admin API request check the authenticated administrator role on the server; unverified users remain subject to the existing verification gate. Responses use `private, no-store`. Tracking accepts a small allowlisted schema, same-origin requests, an authenticated user, rate limits, and owner-scoped book IDs. Client IDs never choose the tracked user. No passwords, authentication tokens, or book contents enter analytics responses.

Account deletion cascades its analytics rows. Book deletion removes per-copy aggregates and first-open facts, while user daily totals and the sparse deletion event remain. Analytics contains names, emails, and book titles, so report exports are internal administrative data.

Cleanup recommendations are read-only. This feature provides no bulk deletion endpoint, cleanup job, notification campaign, or automatic deletion.

## Validation

Run `pnpm test:analytics` for isolated SQLite integration checks. The test creates and destroys its own temporary database; it never touches `.data`. It covers migrations, session deduplication, idle exclusion, page jumps, EPUB separation, ownership, admin authorization, date validation, exact retention, ordered funnels, distinct weekly activity, storage totals, cascades, and unavailable history. Run `pnpm typecheck` and lint the changed files as well.
