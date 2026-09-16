# Community pilot

Read AGENTS.md and ADR 0002 first. The user authorized this pilot after the personal reading release; the earlier exclusion of community in ADR 0001 describes that earlier release. Author commerce remains deferred until at least 2027-09-16.

## Ownership and access

- `src/lib/community/contracts.ts`: validated commands and response DTOs. `client.ts`: account-bound, no-store HTTP transport.
- `src/server/community/schema.ts`: additive migration 6. `access.ts`: membership and moderator checks. `queries.ts`: bounded, authorized reads and response projection. `commands.ts`: transactional writes, moderation, limits, and duplicate prevention.
- `src/app/api/community/route.ts`: authenticated, verified account, intended-account header, same-origin checks, bounded JSON validation, no-store responses including errors.
- `src/components/community`: page coordinator, forms, post presentation, moderator desk. Components do not call database code.

Existing Shelf admins moderate the pilot. Other readers must be invited by an admin using an existing account email, then explicitly choose a unique community alias and accept the rules. Invitations enable access in the app; no messages are sent. A suspended reader cannot rejoin by choosing a different name or leaving. Pausing denies non-admin community reads and publishing; admins can continue moderation.

All active members can see all pilot rooms. Rooms are not independently private clubs. Public visitors and nonmembers cannot retrieve room or post content. Community names and intentionally published text are shared; account names, email addresses, uploaded files, private notes, and reading progress are not exposed to members. Moderators see account emails and private reports. No community query joins personal library tables. Architecture checks reject direct imports of private library services; review SQL and transitive dependencies too.

## Data and lifecycle

Community has separate membership, room, post, report, and daily-visit tables. Posts use one root discussion plus flat replies. React renders plain text; HTML and file attachments are unsupported. Spoilers use collapsed disclosure elements; spoiler text is delivered to authorized readers and is not a security boundary. Titles must remain spoiler-free.

Publishing uses a client-generated UUID. Retrying identical content under the same ID returns the existing post; altered content, another owner, or removed content conflicts. Forms retain the ID after a failed request and reset it after an acknowledged save. There is no community outbox and reconnect never publishes a draft. Room creation is also idempotent.

Owner removal erases the body and leaves a tombstone; removed roots are no longer accessible and cannot receive replies. Hiding a root also hides its replies from nonmoderators. Closing a thread stops replies server-side. Reports are unique per reporter/post and visible only to admins, who can hide/restore and resolve them. Moderation is recorded in the existing admin audit log.

Leaving explicitly deletes the member's posts, their reports, visits, and public alias, and requires a new invitation to return. Deleting a root cascades its replies, including replies from others; the leave confirmation states this. Account deletion also cascades community content and membership. Suspension remains in place after leaving. Personal library content is unaffected.

## Boundaries and operations

No new dependency or managed service is required. The existing single-process SQLite deployment owns transactions. The pilot caps invited accounts at 200 and rooms at 50. Posts are limited to 4,000 characters, 10 per minute and 100 per day per member; reports to 10 per day. Removed posts continue counting toward posting limits. APIs page discussions/replies in batches of 25. Moderation shows up to 100 oldest open reports; reviewing them reveals the next batch.

Room and discussion selections are encoded in `/community?room=…&thread=…&page=…` links. Next.js URL state drives reload, native browser history, and navigation; URLs grant no access by themselves.

Community is online-only. Already displayed content remains in the current view during a network interruption. Publishing is disabled when the browser knows it is offline; failed writes retain the current draft. Requests time out after eight seconds in an active page, including when the browser still reports online. A timeout never causes automatic publication; an explicit retry keeps the same operation ID because the server may already have committed. Drafts exist only in component memory and are lost when leaving the view, reloading, or switching accounts. No community response is stored in the service-worker cache, RxDB, or Dexie. Offline navigation uses the public offline shell and renders a community connection notice, not the personal shelf. Changing these decisions requires a draft retention/access-revocation design.

Metrics are admin-only: current joined readers; visible contributors and new discussions in the past seven rolling days; those discussions receiving a visible reply from someone else; and readers visiting community on at least two different UTC days over the past seven calendar days. Visits are deduplicated per account/day and retained for 90 days. This is not personal reading analytics or a cohort retention calculation. Deletion/moderation can reduce these counts.

## Verification

`pnpm test:community` exercises migration from v5, private-record preservation, invitations, consent validation, isolation, moderator authorization, suspension, pause, idempotency, rate limits, pagination, and deletion. Playwright exercises the actual production UI and endpoints on Chromium, WebKit, and an iPhone preset. Run the full existing offline suite when changing shell/navigation behavior.
