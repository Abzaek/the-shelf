import "server-only";
import { getDb, now } from "../db";
import { env } from "../env";
import { snapshotStorage } from "./tracking";
const DAY = 86400000;
export interface AnalyticsFilter {
    start: string;
    end: string;
    bucket: "day" | "week" | "month";
    active: number;
    inactive: number;
    dormant: number;
}
export function defaultFilter(): AnalyticsFilter {
    return { start: new Date(Date.now() - 29 * DAY).toISOString().slice(0, 10), end: now().slice(0, 10), bucket: "day", active: 7, inactive: 30, dormant: 90 };
}
export interface AnalyticsUser {
    id: string;
    name: string;
    email: string;
    created_at: string;
    role: string;
    verified: number;
    last_activity: string | null;
    first_activity: string | null;
    first_upload: string | null;
    first_open: string | null;
    first_read: string | null;
    return_read: string | null;
    first_completion: string | null;
    completed_after_return: string | null;
    books: number;
    bytes: number;
    reading: number;
    completed: number;
    abandoned: number;
    last_open: string | null;
    last_book: string | null;
    last_read: string | null;
    sessions: number;
    reading_sessions: number;
    seconds: number;
    pages: number;
    opens: number;
    uploads: number;
    active_days: number;
    segment: string;
}
export interface AnalyticsBook {
    id: string;
    title: string;
    author: string;
    user_id: string;
    owner: string;
    bytes: number;
    progress: number;
    last_opened_at: string | null;
    created_at: string;
    last_activity: string | null;
    opens: number;
    sessions: number;
    seconds: number;
}
export interface SeriesPoint {
    day: string;
    users: number;
    signups: number;
    active: number | null;
    returning: number | null;
    books: number;
    uploads: number | null;
    seconds: number | null;
    sessions: number | null;
    pages: number | null;
    storage: number | null;
    added: number | null;
}
export function getAnalytics(filter: AnalyticsFilter = defaultFilter()) {
    const db = getDb(), ts = now();
    snapshotStorage(ts);
    const startedAt = (db.prepare("SELECT value FROM analytics_meta WHERE key = 'started_at'").get() as {
        value: string;
    }).value;
    const from = `${filter.start}T00:00:00.000Z`, until = new Date(Date.parse(filter.end) + DAY).toISOString();
    const duration = Date.parse(until) - Date.parse(from), previousFrom = new Date(Date.parse(from) - duration).toISOString();
    const cut = (days: number) => new Date(Date.parse(ts) - days * DAY).toISOString();
    const one = (sql: string, ...args: (string | number)[]) => (db.prepare(sql).get(...args) as {
        n: number;
    }).n;
    const users = (db.prepare(`SELECT u.id, COALESCE(NULLIF(u.display_name, ''), u.email) name, u.email, u.created_at, u.role,
    (u.email_verified_at IS NOT NULL) verified, a.last_activity, a.first_activity, a.first_upload, a.first_open, a.first_read, a.return_read, a.first_completion, a.completed_after_return,
    COALESCE(b.books,0) books, COALESCE(b.bytes,0) bytes, COALESCE(b.reading,0) reading, COALESCE(b.completed,0) completed,
    COALESCE(b.abandoned,0) abandoned, b.last_open,
    (SELECT title FROM books lb WHERE lb.user_id=u.id AND lb.last_opened_at IS NOT NULL ORDER BY lb.last_opened_at DESC LIMIT 1) last_book, a.last_read_at last_read,
    COALESCE(d.sessions,0) sessions, COALESCE(d.reading_sessions,0) reading_sessions, COALESCE(d.seconds,0) seconds,
    COALESCE(d.pages,0) pages, COALESCE(d.opens,0) opens, COALESCE(d.uploads,0) uploads, COALESCE(d.active_days,0) active_days
    FROM users u LEFT JOIN analytics_users a ON a.user_id = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) books, SUM(file_size+cover_size) bytes, SUM(status='reading') reading,
      SUM(status='finished') completed, SUM(status='reading' AND last_opened_at < ?) abandoned, MAX(last_opened_at) last_open FROM books GROUP BY user_id) b ON b.user_id=u.id
    LEFT JOIN (SELECT user_id, SUM(sessions) sessions, SUM(reading_sessions) reading_sessions, SUM(reading_seconds) seconds,
      SUM(pages) pages, SUM(opens) opens, SUM(uploads) uploads, COUNT(*) active_days FROM analytics_daily_users WHERE day >= ? AND day <= ? GROUP BY user_id) d ON d.user_id=u.id`)
        .all(cut(filter.inactive), filter.start, filter.end) as Omit<AnalyticsUser, "segment">[]).map(u => {
        // Legacy timestamps are deliberately not treated as a complete engagement history.
        const age = u.last_activity ? (Date.parse(ts) - Date.parse(u.last_activity)) / DAY : null;
        const segment = age === null ? "Unobserved" : age < filter.active + 1 ? "Active" : age < filter.inactive + 1 ? "Recently inactive" : age < filter.dormant + 1 ? "Inactive" : "Dormant";
        return { ...u, segment };
    });
    const totalUsers = users.length, totalBooks = users.reduce((n, u) => n + u.books, 0), usedBytes = users.reduce((n, u) => n + u.bytes, 0);
    const countSignups = (s: string, e: string) => one("SELECT COUNT(*) n FROM users WHERE created_at >= ? AND created_at < ?", s, e);
    const period = (s: string, e: string) => db.prepare(`SELECT COUNT(DISTINCT user_id) active, COALESCE(SUM(sessions),0) sessions,
    COALESCE(SUM(session_seconds),0) session_seconds, COALESCE(SUM(reading_sessions),0) reading_sessions,
    COALESCE(SUM(reading_seconds),0) seconds, COALESCE(SUM(pages),0) pages, COALESCE(SUM(opens),0) opens,
    COALESCE(SUM(uploads),0) uploads, COALESCE(SUM(completions),0) completions
    FROM analytics_daily_users WHERE day >= ? AND day < ?`).get(s.slice(0, 10), e.slice(0, 10)) as {
        active: number;
        sessions: number;
        session_seconds: number;
        reading_sessions: number;
        seconds: number;
        pages: number;
        opens: number;
        uploads: number;
        completions: number;
    };
    const current = period(from, until), previous = period(previousFrom, from);
    const returning = one(`SELECT COUNT(DISTINCT d.user_id) n FROM analytics_daily_users d JOIN analytics_users a ON a.user_id=d.user_id
    WHERE d.day >= ? AND d.day < ? AND substr(a.first_activity,1,10) < d.day`, filter.start, until.slice(0, 10));
    const activeWindow = (days: number) => one("SELECT COUNT(DISTINCT user_id) n FROM analytics_daily_users WHERE day >= ? AND day <= ?", new Date(Date.parse(filter.end) - (days - 1) * DAY).toISOString().slice(0, 10), filter.end);
    const segments = ["Active", "Recently inactive", "Inactive", "Dormant", "Unobserved"].map(name => {
        const list = users.filter(u => u.segment === name);
        return { name, users: list.length, percent: totalUsers ? list.length / totalUsers * 100 : 0, books: list.reduce((n, u) => n + u.books, 0), bytes: list.reduce((n, u) => n + u.bytes, 0), lastActivity: list.map(u => u.last_activity).filter(Boolean).sort().at(-1) ?? null };
    });
    const daily = db.prepare(`SELECT day, SUM(reading_seconds) seconds, SUM(reading_sessions) sessions, SUM(pages) pages FROM analytics_daily_users WHERE day >= ? AND day <= ? GROUP BY day`).all(filter.start, filter.end) as {
        day: string;
        seconds: number;
        sessions: number;
        pages: number;
    }[];
    const registrations = db.prepare("SELECT substr(created_at,1,10) day, COUNT(*) n FROM users GROUP BY day").all() as {
        day: string;
        n: number;
    }[];
    const uploads = db.prepare("SELECT substr(created_at,1,10) day, COUNT(*) n FROM books GROUP BY day").all() as {
        day: string;
        n: number;
    }[];
    const storage = db.prepare("SELECT * FROM analytics_storage_daily WHERE day >= ? AND day <= ?").all(filter.start, filter.end) as {
        day: string;
        used_bytes: number | null;
        added_bytes: number;
        uploaded_books: number;
        book_count: number | null;
    }[];
    const bucketExpr = filter.bucket === "month" ? "substr(day,1,7)||'-01'" : filter.bucket === "week" ? "date(day, '-' || ((cast(strftime('%w',day) as integer)+6)%7) || ' days')" : "day";
    const actives = db.prepare(`SELECT ${bucketExpr} bucket, COUNT(DISTINCT user_id) active, COUNT(DISTINCT CASE WHEN substr(a.first_activity,1,10)<d.day THEN d.user_id END) AS returning_users
    FROM analytics_daily_users d JOIN analytics_users a USING(user_id) WHERE day >= ? AND day <= ? GROUP BY bucket`).all(filter.start, filter.end) as {
        bucket: string;
        active: number;
        returning_users: number;
    }[];
    const key = (day: string) => filter.bucket === "month" ? day.slice(0, 7) + "-01" : filter.bucket === "week" ? new Date(Date.parse(day) - ((new Date(day).getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10) : day;
    const buckets = new Map<string, SeriesPoint>();
    let cumulativeUsers = registrations.filter(r => r.day < filter.start).reduce((n, r) => n + r.n, 0), cumulativeBooks = uploads.filter(r => r.day < filter.start).reduce((n, r) => n + r.n, 0);
    const dailyMap = new Map(daily.map(r => [r.day, r])), regMap = new Map(registrations.map(r => [r.day, r.n])), uploadMap = new Map(uploads.map(r => [r.day, r.n])), storageMap = new Map(storage.map(r => [r.day, r]));
    for (let t = Date.parse(filter.start); t < Date.parse(until); t += DAY) {
        const day = new Date(t).toISOString().slice(0, 10), k = key(day), d = dailyMap.get(day), s = storageMap.get(day), covered = day >= startedAt.slice(0, 10);
        cumulativeUsers += regMap.get(day) ?? 0;
        cumulativeBooks += uploadMap.get(day) ?? 0;
        const p = buckets.get(k) ?? { day: k, users: 0, signups: 0, active: null, returning: null, books: 0, uploads: null, seconds: null, sessions: null, pages: null, storage: null, added: null };
        p.users = cumulativeUsers;
        p.books = cumulativeBooks;
        p.signups += regMap.get(day) ?? 0;
        if (covered) {
            p.seconds = (p.seconds ?? 0) + (d?.seconds ?? 0);
            p.sessions = (p.sessions ?? 0) + (d?.sessions ?? 0);
            p.pages = (p.pages ?? 0) + (d?.pages ?? 0);
            p.uploads = (p.uploads ?? 0) + (s?.uploaded_books ?? 0);
            p.added = (p.added ?? 0) + (s?.added_bytes ?? 0);
        }
        p.storage = s?.used_bytes ?? null;
        buckets.set(k, p);
    }
    for (const a of actives) {
        const p = buckets.get(a.bucket);
        if (p) {
            p.active = a.active;
            p.returning = a.returning_users;
        }
    }
    for (const p of buckets.values())
        if (p.seconds !== null) {
            p.active ??= 0;
            p.returning ??= 0;
        }
    const cohorts = db.prepare(`WITH offsets(n) AS (VALUES(1),(7),(30),(60),(90))
    SELECT substr(u.created_at,1,7) cohort, o.n offset, COUNT(*) eligible,
    SUM(EXISTS(SELECT 1 FROM analytics_daily_users d WHERE d.user_id=u.id AND d.day=date(u.created_at,'+'||o.n||' days'))) retained
    FROM users u CROSS JOIN offsets o WHERE u.created_at >= ? AND u.created_at >= ? AND u.created_at < ?
    AND date(u.created_at,'+'||o.n||' days') < date(?) GROUP BY cohort, o.n ORDER BY cohort DESC`).all(startedAt, from, until, ts) as {
        cohort: string;
        offset: number;
        eligible: number;
        retained: number;
    }[];
    const cohortSizes = db.prepare("SELECT substr(created_at,1,7) cohort, COUNT(*) size FROM users WHERE created_at >= ? AND created_at >= ? AND created_at < ? GROUP BY cohort ORDER BY cohort DESC").all(startedAt, from, until) as {
        cohort: string;
        size: number;
    }[];
    // Ordered conversion: each milestone must follow the previous milestone, within observation time.
    const funnelUsers = users.filter(u => u.created_at >= startedAt && u.created_at >= from && u.created_at < until);
    const steps: (keyof AnalyticsUser)[] = ["created_at", "first_upload", "first_open", "first_read", "return_read", "completed_after_return"];
    const funnel = steps.map((step, i) => ({ name: ["Signed up", "Uploaded a book", "Opened a book", "Started reading", "Returned to reading", "Completed a book"][i], users: funnelUsers.filter(u => steps.slice(0, i + 1).every((s, j) => u[s] && String(u[s]) < until && (!j || String(u[s]) >= String(u[steps[j - 1]])))).length }));
    const bookSelect = `SELECT b.id,b.title,b.author,b.user_id,COALESCE(NULLIF(u.display_name,''),u.email) owner,b.file_size+b.cover_size bytes,b.progress,b.last_opened_at,b.created_at,a.last_activity,
    COALESCE(d.opens,0) opens, COALESCE(d.sessions,0) sessions, COALESCE(d.seconds,0) seconds FROM books b JOIN users u ON u.id=b.user_id LEFT JOIN analytics_users a ON a.user_id=u.id
    LEFT JOIN (SELECT book_id,SUM(opens) opens,SUM(sessions) sessions,SUM(seconds) seconds FROM analytics_daily_books WHERE day >= ? AND day <= ? GROUP BY book_id) d ON d.book_id=b.id`;
    const rankedBooks = ["seconds", "opens", "sessions"].flatMap(column => db.prepare(`${bookSelect} ORDER BY ${column} DESC LIMIT 100`).all(filter.start, filter.end) as AnalyticsBook[]);
    const popular = [...new Map(rankedBooks.map(b => [b.id, b])).values()];
    const popularTitles = db.prepare(`SELECT b.title,b.author,COUNT(DISTINCT b.user_id) readers,SUM(d.opens) opens,SUM(d.sessions) sessions,SUM(d.seconds) seconds
    FROM analytics_daily_books d JOIN books b ON b.id=d.book_id WHERE d.day >= ? AND d.day <= ? AND d.sessions>0
    GROUP BY lower(trim(b.title)),lower(trim(b.author)) ORDER BY seconds DESC LIMIT 20`).all(filter.start, filter.end) as {
        title: string;
        author: string;
        readers: number;
        opens: number;
        sessions: number;
        seconds: number;
    }[];
    const distinctBooksOpened = one("SELECT COUNT(DISTINCT book_id) n FROM analytics_daily_books WHERE day >= ? AND day <= ? AND opens>0", filter.start, filter.end);
    const pdfSessions = one("SELECT COALESCE(SUM(d.sessions),0) n FROM analytics_daily_books d JOIN books b ON b.id=d.book_id WHERE d.day >= ? AND d.day <= ? AND b.format='pdf'", filter.start, filter.end);
    const stale = db.prepare(`${bookSelect} WHERE COALESCE(b.last_opened_at,b.created_at) < ? ORDER BY bytes DESC LIMIT 100`).all(filter.start, filter.end, cut(filter.dormant)) as AnalyticsBook[];
    const completionDays = one(`SELECT COALESCE(AVG(julianday(b.finished_at)-julianday(e.first_open)),0) n FROM books b JOIN
    analytics_book_state e ON e.book_id=b.id
    WHERE b.finished_at >= ? AND b.finished_at < ? AND b.finished_at >= e.first_open`, from, until);
    return { filter, generatedAt: ts, startedAt, historyComplete: from >= startedAt, comparisonComplete: previousFrom >= startedAt,
        totals: { users: totalUsers, books: totalBooks, bytes: usedBytes, capacity: env.totalQuotaBytes, remaining: Math.max(0, env.totalQuotaBytes - usedBytes),
            reading: users.reduce((n, u) => n + u.reading, 0), completed: users.reduce((n, u) => n + u.completed, 0), abandoned: users.reduce((n, u) => n + u.abandoned, 0),
            neverOpened: one("SELECT COUNT(*) n FROM books WHERE last_opened_at IS NULL"),
            uploadOnly: users.filter(u => u.first_upload && !u.first_read).length,
            newUsers: countSignups(from, until), previousNewUsers: countSignups(previousFrom, from),
            previousUsers: one("SELECT COUNT(*) n FROM users WHERE created_at < ?", from),
            uploadedToday: one("SELECT COUNT(*) n FROM books WHERE created_at >= ?", ts.slice(0, 10)),
            uploadedWeek: one("SELECT COUNT(*) n FROM books WHERE created_at >= ?", cut(7)),
            uploadedMonth: one("SELECT COUNT(*) n FROM books WHERE created_at >= ?", ts.slice(0, 7) + "-01"), completionDays },
        current, previous, returning, distinctBooksOpened, pdfSessions, popularTitles, dau: activeWindow(1), wau: activeWindow(7), mau: activeWindow(30), segments, series: [...buckets.values()],
        cohorts: cohortSizes.map(c => ({ ...c, days: [1, 7, 30, 60, 90].map(offset => cohorts.find(r => r.cohort === c.cohort && r.offset === offset) ?? { offset, eligible: 0, retained: 0 }) })),
        funnel, firstActivity: funnelUsers.filter(u => u.first_activity && u.first_activity < until).length,
        users: users.sort((a, b) => b.seconds - a.seconds), popular, stale };
}
export type AnalyticsReport = ReturnType<typeof getAnalytics>;
export function getUserAnalytics(id: string) {
    const db = getDb();
    const user = db.prepare(`SELECT id,email,display_name,role,created_at,email_verified_at FROM users WHERE id=?`).get(id) as {
        id: string;
        email: string;
        display_name: string;
        role: string;
        created_at: string;
        email_verified_at: string | null;
    } | undefined;
    if (!user)
        return null;
    const activity = db.prepare("SELECT * FROM analytics_users WHERE user_id=?").get(id) as {
        last_activity: string | null;
        last_read_at: string | null;
    } | undefined;
    const totals = db.prepare(`SELECT COALESCE(SUM(sessions),0) sessions,COALESCE(SUM(reading_sessions),0) reading_sessions,
    COALESCE(SUM(reading_seconds),0) seconds,COALESCE(SUM(pages),0) pages FROM analytics_daily_users WHERE user_id=?`).get(id) as {
        sessions: number;
        reading_sessions: number;
        seconds: number;
        pages: number;
    };
    const books = db.prepare("SELECT id,title,status,file_size+cover_size bytes,progress,last_opened_at,finished_at FROM books WHERE user_id=? ORDER BY last_opened_at DESC").all(id) as {
        id: string;
        title: string;
        status: string;
        bytes: number;
        progress: number;
        last_opened_at: string | null;
        finished_at: string | null;
    }[];
    const timeline = db.prepare("SELECT id,kind,at,label FROM analytics_events WHERE user_id=? ORDER BY at DESC,id DESC LIMIT 100").all(id) as {
        id: number;
        kind: string;
        at: string;
        label: string;
    }[];
    return { user, activity, totals, books, timeline, generatedAt: now() };
}
