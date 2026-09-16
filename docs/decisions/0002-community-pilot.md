# ADR 0002: Invite-only book discussion pilot

Status: accepted implementation default, 2026-09-16. The user authorized work on a community pilot after deploying personal reading. Invite-only access was proposed as the initial default; broader enrollment is a future product decision.

## Decision

Start with admin-curated book rooms, explicit pseudonymous membership, flat discussions/replies, spoiler disclosures, reporting and moderator controls. Use the existing SQLite service and authentication. Keep community publication separate from personal offline replication. No file sharing, direct messages, recommendation feed, commerce, push notifications, or third-party community service is included.

## Why

The pilot asks whether conversations about books bring readers back. A small invited group and a few curated rooms make that question measurable while providing moderation before wider access. Shared discussion authorization differs from personal device synchronization: revocations, moderation, and deliberate publication must be checked by the server.

A public forum would need a broader abuse/discovery strategy. A full social network would introduce several untested product assumptions. An external hosted forum would introduce another identity boundary and possibly a subscription. None is necessary to learn from this pilot.

## Consequences

Users choose what to publish and which name to use. Their existing library remains private. Community requires a connection and drafts are limited to the current view; durable offline community drafts need a separate design. Existing admins moderate, reports are private, and the entire pilot can be paused. Room membership is pilot-wide, not per-room. Text-only storage and bounded enrollment keep the first release small.

Migration 6 is additive and leaves existing sync schemas unchanged. Existing users are not automatically enrolled. Rollback can keep the added tables intact. Published personal-reading migrations must never be rewritten.

## Evaluation

Run the first pilot for four weeks with roughly 10–20 invited readers and two or three book rooms. Hosts should publish useful opening questions and review reports regularly. Review weekly participation, replies from other readers, returning visitors, qualitative feedback, and moderator workload. Treat the numbers as signals, not proof of product-market fit; set the next experiment from observed behavior.

Author commerce remains deferred until at least 2027-09-16. Starting this pilot does not authorize commerce or public sharing of uploaded books.
