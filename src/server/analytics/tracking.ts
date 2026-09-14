import "server-only";
import { randomUUID } from "node:crypto";
import { getDb, now } from "../db";
const MINUTE = 60000;
type Kind = "user_registered" | "login" | "library_opened" | "book_uploaded" | "book_opened" | "book_completed" | "book_deleted" | "reading_progress_updated";
interface State {
    last_activity: string | null;
    session_started: string | null;
    session_seen: string | null;
    reading_id: string | null;
    reading_book: string | null;
    reading_seen: string | null;
    first_read_session: string | null;
    pulse_sequence: number;
    pulse_page: number;
}
function state(userId: string) {
    const db = getDb();
    db.prepare("INSERT OR IGNORE INTO analytics_users (user_id) VALUES (?)").run(userId);
    return db.prepare("SELECT * FROM analytics_users WHERE user_id = ?").get(userId) as State;
}
function event(userId: string, kind: string, ts: string, bookId?: string, label = "") {
    getDb().prepare("INSERT INTO analytics_events(user_id, book_id, kind, at, label) VALUES (?, ?, ?, ?, ?)").run(userId, bookId ?? null, kind, ts, label.slice(0, 300));
}
function activity(userId: string, ts: string) {
    const db = getDb(), previous = state(userId);
    const elapsed = previous.session_seen ? Date.parse(ts) - Date.parse(previous.session_seen) : Infinity;
    const starts = elapsed >= 30 * MINUTE;
    // Time between nearby meaningful interactions is an estimate, capped at 60s per interaction.
    const seconds = starts ? 0 : Math.max(0, Math.min(60, Math.floor(elapsed / 1000)));
    db.prepare(`INSERT INTO analytics_daily_users(day, user_id, sessions, session_seconds) VALUES (?, ?, ?, ?)
    ON CONFLICT(day, user_id) DO UPDATE SET sessions = sessions + excluded.sessions, session_seconds = session_seconds + excluded.session_seconds`)
        .run(ts.slice(0, 10), userId, Number(starts), seconds);
    db.prepare(`UPDATE analytics_users SET last_activity = ?, first_activity = COALESCE(first_activity, ?),
    session_started = ?, session_seen = ? WHERE user_id = ?`).run(ts, ts, starts ? ts : previous.session_started, ts, userId);
    return previous;
}
export function snapshotStorage(ts = now()) {
    const db = getDb();
    db.prepare(`INSERT INTO analytics_storage_daily(day, used_bytes, book_count, measured_at)
    SELECT ?, COALESCE(SUM(file_size + cover_size), 0), COUNT(*), ? FROM books WHERE true
    ON CONFLICT(day) DO UPDATE SET used_bytes = excluded.used_bytes, book_count = excluded.book_count, measured_at = excluded.measured_at`)
        .run(ts.slice(0, 10), ts);
    // Timeline is diagnostic, aggregates and milestones survive pruning.
    db.prepare("DELETE FROM analytics_events WHERE at < ?").run(new Date(Date.parse(ts) - 180 * 86400000).toISOString());
}
export function recordActivity(userId: string, kind: Kind, bookId?: string, label = "", bytes = 0) {
    const db = getDb(), ts = now();
    db.transaction(() => {
        const previous = state(userId);
        // Coalesce library visits / progress writes to one observation per minute.
        if ((kind === "library_opened" || kind === "reading_progress_updated") && previous.last_activity && Date.parse(ts) - Date.parse(previous.last_activity) < MINUTE)
            return;
        if (kind === "user_registered") {
            event(userId, kind, ts);
            return;
        }
        activity(userId, ts);
        const columns: Partial<Record<Kind, string>> = { book_uploaded: "uploads", book_opened: "opens", book_completed: "completions" };
        const milestones: Partial<Record<Kind, string>> = { book_uploaded: "first_upload", book_opened: "first_open", book_completed: "first_completion" };
        const column = columns[kind], milestone = milestones[kind];
        if (column)
            db.prepare(`UPDATE analytics_daily_users SET ${column} = ${column} + 1 WHERE day = ? AND user_id = ?`).run(ts.slice(0, 10), userId);
        if (milestone)
            db.prepare(`UPDATE analytics_users SET ${milestone} = COALESCE(${milestone}, ?) WHERE user_id = ?`).run(ts, userId);
        if (kind === "book_completed")
            db.prepare("UPDATE analytics_users SET completed_after_return = COALESCE(completed_after_return, ?) WHERE user_id = ? AND return_read IS NOT NULL").run(ts, userId);
        if (kind === "book_opened" && bookId) {
            db.prepare("INSERT OR IGNORE INTO analytics_book_state(book_id, first_open) VALUES (?, ?)").run(bookId, ts);
            db.prepare(`INSERT INTO analytics_daily_books(day, book_id, opens) VALUES (?, ?, 1)
        ON CONFLICT(day, book_id) DO UPDATE SET opens = opens + 1`).run(ts.slice(0, 10), bookId);
            db.prepare("UPDATE books SET last_opened_at = ? WHERE id = ? AND user_id = ?").run(ts, bookId, userId);
        }
        if (kind !== "reading_progress_updated")
            event(userId, kind, ts, bookId, label);
        if (kind === "book_uploaded" || kind === "book_deleted") {
            db.prepare(`INSERT INTO analytics_storage_daily(day, added_bytes, removed_bytes, uploaded_books) VALUES (?, ?, ?, ?)
        ON CONFLICT(day) DO UPDATE SET added_bytes = added_bytes + excluded.added_bytes,
        removed_bytes = removed_bytes + excluded.removed_bytes, uploaded_books = uploaded_books + excluded.uploaded_books`)
                .run(ts.slice(0, 10), kind === "book_uploaded" ? bytes : 0, kind === "book_deleted" ? bytes : 0, Number(kind === "book_uploaded"));
            snapshotStorage(ts);
        }
    })();
}
/** Heartbeats have a server-issued session and monotonic sequence. No client durations are accepted. */
export function readingPulse(userId: string, bookId: string, page: number, sessionId?: string, sequence = 0) {
    const db = getDb(), ts = now();
    return db.transaction(() => {
        const book = db.prepare("SELECT title, format, total_pages FROM books WHERE id = ? AND user_id = ?").get(bookId, userId) as {
            title: string;
            format: string;
            total_pages: number;
        } | undefined;
        if (!book)
            return null;
        const previous = state(userId);
        const elapsed = previous.reading_seen ? Date.parse(ts) - Date.parse(previous.reading_seen) : Infinity;
        // A stale tab cannot take over the current session except with a new explicit open.
        if (sessionId && previous.reading_id !== sessionId)
            return { stale: true };
        const fresh = !sessionId || elapsed >= 5 * MINUTE || previous.reading_book !== bookId;
        const id = fresh ? randomUUID() : previous.reading_id!;
        // Coalesce rapid mounts/retries of the initial reader open (including React Strict Mode).
        if (!sessionId && previous.reading_book === bookId && elapsed < 5000)
            return { sessionId: previous.reading_id!, sequence: previous.pulse_sequence };
        if (!fresh && sequence <= previous.pulse_sequence)
            return { sessionId: id, sequence: previous.pulse_sequence };
        const oldPage = previous.pulse_page;
        // Count observed single-page advances, never a jumped distance or an EPUB location as a PDF page.
        const pages = !fresh && page === oldPage + 1 ? 1 : 0;
        const seconds = fresh ? 0 : Math.max(0, Math.min(35, Math.floor(elapsed / 1000)));
        activity(userId, ts);
        if (fresh) {
            recordActivity(userId, "book_opened", bookId, book.title);
            event(userId, "reading_session_started", ts, bookId, book.title);
        }
        db.prepare(`UPDATE analytics_users SET reading_id = ?, reading_book = ?, reading_seen = ?,
      last_read_at = CASE WHEN ? > 0 THEN ? ELSE last_read_at END, pulse_sequence = ?, pulse_page = ?,
      first_read = CASE WHEN ? > 0 THEN COALESCE(first_read, ?) ELSE first_read END,
      first_read_session = CASE WHEN ? > 0 THEN COALESCE(first_read_session, ?) ELSE first_read_session END,
      return_read = CASE WHEN ? > 0 AND first_read_session IS NOT NULL AND first_read_session != ? THEN COALESCE(return_read, ?) ELSE return_read END WHERE user_id = ?`)
            .run(id, bookId, ts, seconds, ts, sequence, page, seconds, ts, seconds, id, seconds, id, ts, userId);
        db.prepare(`UPDATE analytics_daily_users SET reading_sessions = reading_sessions + ?, reading_seconds = reading_seconds + ?,
      pages = pages + ?, locations = locations + ? WHERE day = ? AND user_id = ?`)
            .run(Number(fresh), seconds, book.format === "pdf" ? pages : 0, book.format === "epub" ? pages : 0, ts.slice(0, 10), userId);
        db.prepare(`INSERT INTO analytics_daily_books(day, book_id, sessions, seconds) VALUES (?, ?, ?, ?)
      ON CONFLICT(day, book_id) DO UPDATE SET sessions = sessions + excluded.sessions, seconds = seconds + excluded.seconds`)
            .run(ts.slice(0, 10), bookId, Number(fresh), seconds);
        return { sessionId: id, sequence };
    })();
}
