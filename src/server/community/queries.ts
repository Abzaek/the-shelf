import "server-only";
import type { User } from "@/server/auth";
import { getDb } from "@/server/db";
import { HttpError } from "@/server/http";
import type {
  CommunityAdmin,
  CommunityDiscussion,
  CommunityHome,
  CommunityPost,
  CommunityRoom,
} from "@/lib/community/contracts";
import {
  isModerator,
  membership,
  noteVisit,
  pilotPaused,
  requireModerator,
  requireParticipant,
} from "./access";
export type PostRow = {
  id: string;
  room_id: string;
  parent_id: string | null;
  user_id: string;
  title: string;
  body: string;
  spoiler: number;
  hidden: number;
  locked: number;
  removed: number;
  created_at: string;
  alias?: string;
  replies?: number;
};
export function postRow(id: string): PostRow {
  const row = getDb().prepare("SELECT * FROM community_posts WHERE id=?").get(id) as
    PostRow | undefined;
  if (!row) throw new HttpError(404, "Discussion not found.");
  return row;
}
export function visiblePost(user: User, id: string): PostRow {
  const row = postRow(id);
  if (row.hidden && !isModerator(user)) throw new HttpError(404, "Discussion not found.");
  if (row.parent_id) {
    const root = postRow(row.parent_id);
    if (root.removed || (root.hidden && !isModerator(user)))
      throw new HttpError(404, "Discussion not found.");
  }
  return row;
}
const ROOM_SQL = `SELECT r.id,r.title,r.book_title AS bookTitle,r.author,r.description,
  (SELECT count(*) FROM community_posts p WHERE p.room_id=r.id AND p.parent_id IS NULL AND p.hidden=0 AND p.removed=0) AS threads FROM community_rooms r`;
function room(id: string) {
  const found = getDb().prepare(`${ROOM_SQL} WHERE r.id=?`).get(id) as CommunityRoom | undefined;
  if (!found) throw new HttpError(404, "Room not found.");
  return found;
}
function present(user: User, row: PostRow): CommunityPost {
  return {
    id: row.id,
    roomId: row.room_id,
    parentId: row.parent_id,
    title: row.title,
    body: row.removed ? "" : row.body,
    alias: row.removed ? "Reader" : row.alias || "Former reader",
    own: row.user_id === user.id,
    spoiler: !!row.spoiler,
    hidden: !!row.hidden,
    locked: !!row.locked,
    removed: !!row.removed,
    createdAt: row.created_at,
    replies: row.replies ?? 0,
  };
}
const POST_SQL = `SELECT p.*,m.alias,
 (SELECT count(*) FROM community_posts c WHERE c.parent_id=p.id AND c.hidden=0 AND c.removed=0) AS replies
 FROM community_posts p LEFT JOIN community_members m ON m.user_id=p.user_id`;
export function home(user: User): CommunityHome {
  const member = membership(user.id),
    admin = isModerator(user),
    paused = pilotPaused();
  const allowed = admin || (!paused && member?.status === "active");
  if (allowed) noteVisit(user);
  return {
    admin,
    paused,
    membership: member,
    rooms: allowed
      ? (getDb()
          .prepare(`${ROOM_SQL} ORDER BY r.created_at DESC LIMIT 50`)
          .all() as CommunityRoom[])
      : [],
  };
}
export function discussion(
  user: User,
  roomId: string | null,
  threadId: string | null,
  page: number,
): CommunityDiscussion {
  requireParticipant(user);
  const db = getDb();
  let thread: CommunityPost | null = null;
  if (threadId) {
    const root = visiblePost(user, threadId);
    if (root.parent_id || root.removed) throw new HttpError(404, "Discussion not found.");
    roomId = root.room_id;
    thread = present(user, db.prepare(`${POST_SQL} WHERE p.id=?`).get(threadId) as PostRow);
  }
  const target = room(roomId ?? "");
  const rows = db
    .prepare(
      `${POST_SQL} WHERE p.room_id=? AND ${threadId ? "p.parent_id=?" : "p.parent_id IS NULL AND p.removed=0"} AND (? OR p.hidden=0)
    ORDER BY p.created_at ${threadId ? "ASC" : "DESC"},p.id ${threadId ? "ASC" : "DESC"} LIMIT 26 OFFSET ?`,
    )
    .all(
      ...[target.id, ...(threadId ? [threadId] : []), Number(isModerator(user)), page * 25],
    ) as PostRow[];
  noteVisit(user);
  return {
    room: target,
    thread,
    posts: rows.slice(0, 25).map((row) => present(user, row)),
    page,
    hasMore: rows.length > 25,
  };
}
export function moderation(user: User): CommunityAdmin {
  requireModerator(user);
  const db = getDb();
  const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  return {
    members: db
      .prepare(
        "SELECT m.user_id AS userId,u.email,m.alias,m.status FROM community_members m JOIN users u ON u.id=m.user_id WHERE m.status<>'left' ORDER BY m.invited_at DESC LIMIT 200",
      )
      .all() as CommunityAdmin["members"],
    reports: (
      db
        .prepare(
          `SELECT r.id,r.post_id AS postId,r.reason,m.alias,p.body,p.title,p.hidden,p.locked,p.removed FROM community_reports r JOIN community_posts p ON p.id=r.post_id LEFT JOIN community_members m ON m.user_id=r.reporter_id WHERE r.resolved_at IS NULL ORDER BY r.id LIMIT 100`,
        )
        .all() as CommunityAdmin["reports"]
    ).map((report) => ({
      ...report,
      hidden: !!report.hidden,
      locked: !!report.locked,
      removed: !!report.removed,
    })),
    metrics: {
      members: count("SELECT count(*) n FROM community_members WHERE status='active'"),
      contributors: count(
        "SELECT count(DISTINCT user_id) n FROM community_posts WHERE created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days') AND removed=0 AND hidden=0 AND (parent_id IS NULL OR EXISTS(SELECT 1 FROM community_posts root WHERE root.id=community_posts.parent_id AND root.hidden=0 AND root.removed=0))",
      ),
      threads: count(
        "SELECT count(*) n FROM community_posts WHERE parent_id IS NULL AND removed=0 AND hidden=0 AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days')",
      ),
      repliedThreads: count(
        "SELECT count(*) n FROM community_posts p WHERE parent_id IS NULL AND removed=0 AND hidden=0 AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days') AND EXISTS(SELECT 1 FROM community_posts c WHERE c.parent_id=p.id AND c.user_id<>p.user_id AND c.removed=0 AND c.hidden=0)",
      ),
      returningReaders: count(
        "SELECT count(*) n FROM (SELECT user_id FROM community_visits WHERE day >= date('now','-6 days') GROUP BY user_id HAVING count(*) >= 2)",
      ),
    },
  };
}
