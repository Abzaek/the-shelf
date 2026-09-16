import "server-only";
import type { CommunityCommand } from "@/lib/community/contracts";
import type { User } from "@/server/auth";
import { getDb, now } from "@/server/db";
import { HttpError } from "@/server/http";
import { audit, setInstanceSetting } from "@/server/admin";
import {
  isModerator,
  membership,
  pilotPaused,
  requireModerator,
  requireParticipant,
} from "./access";
import { postRow, visiblePost } from "./queries";

/** One transaction covers authorization-dependent reads, limits, and writes. */
export function command(user: User, input: CommunityCommand): { id?: string } {
  return getDb().transaction(() => execute(user, input))();
}
function execute(user: User, input: CommunityCommand): { id?: string } {
  const db = getDb(),
    time = now();
  switch (input.action) {
    case "join": {
      const member = membership(user.id);
      if (member?.status === "suspended")
        throw new HttpError(403, "Community access is suspended. Contact a Shelf moderator.");
      if (
        !isModerator(user) &&
        (pilotPaused() || !member || !["invited", "active"].includes(member.status))
      )
        throw new HttpError(403, "This pilot is invite-only.");
      if (
        db
          .prepare("SELECT 1 FROM community_members WHERE alias=? COLLATE NOCASE AND user_id<>?")
          .get(input.alias, user.id)
      )
        throw new HttpError(409, "That community name is already in use.");
      db.prepare(
        `INSERT INTO community_members(user_id,alias,status,joined_at,invited_at) VALUES (?,?,'active',?,?)
        ON CONFLICT(user_id) DO UPDATE SET alias=excluded.alias,status='active',joined_at=COALESCE(community_members.joined_at,excluded.joined_at)`,
      ).run(user.id, input.alias, time, time);
      return {};
    }
    case "leave":
      db.prepare("DELETE FROM community_posts WHERE user_id=?").run(user.id);
      db.prepare("DELETE FROM community_reports WHERE reporter_id=?").run(user.id);
      db.prepare("DELETE FROM community_visits WHERE user_id=?").run(user.id);
      db.prepare(
        "UPDATE community_members SET status=CASE WHEN status='suspended' THEN 'suspended' ELSE 'left' END,alias='' WHERE user_id=?",
      ).run(user.id);
      return {};
    case "invite": {
      requireModerator(user);
      const target = db
        .prepare("SELECT id,email FROM users WHERE email=? AND disabled_at IS NULL")
        .get(input.email.toLowerCase()) as { id: string; email: string } | undefined;
      if (!target) throw new HttpError(404, "Use the email of an existing, enabled Shelf account.");
      const member = membership(target.id);
      if (member && member.status !== "left") return {};
      const total = (
        db.prepare("SELECT count(*) n FROM community_members WHERE status<>'left'").get() as {
          n: number;
        }
      ).n;
      if (total >= 200) throw new HttpError(409, "The pilot is limited to 200 invited accounts.");
      db.prepare(
        "INSERT INTO community_members(user_id,status,invited_at) VALUES (?,'invited',?) ON CONFLICT(user_id) DO UPDATE SET status='invited',invited_at=excluded.invited_at",
      ).run(target.id, time);
      audit(user, "community.invite", target);
      return {};
    }
    case "member": {
      requireModerator(user);
      const target = db.prepare("SELECT id,email,role FROM users WHERE id=?").get(input.userId) as
        { id: string; email: string; role: string } | undefined;
      if (!target || !membership(target.id)) throw new HttpError(404, "Pilot member not found.");
      if (target.role !== "user")
        throw new HttpError(403, "Manage administrator roles in account administration.");
      db.prepare(
        "UPDATE community_members SET status=CASE WHEN ? THEN 'suspended' WHEN alias='' THEN 'invited' ELSE 'active' END WHERE user_id=?",
      ).run(Number(input.suspended), target.id);
      audit(user, input.suspended ? "community.suspend" : "community.restore", target);
      return {};
    }
    case "pause":
      requireModerator(user);
      setInstanceSetting("community_paused", String(input.paused));
      audit(user, input.paused ? "community.pause" : "community.resume");
      return {};
    case "room": {
      requireModerator(user);
      const old = db.prepare("SELECT * FROM community_rooms WHERE id=?").get(input.id) as
        { title: string; book_title: string; author: string; description: string } | undefined;
      if (old) {
        if (
          old.title !== input.title ||
          old.book_title !== input.bookTitle ||
          old.author !== input.author ||
          old.description !== input.description
        )
          throw new HttpError(409, "Room ID already used.");
        return { id: input.id };
      }
      if ((db.prepare("SELECT count(*) n FROM community_rooms").get() as { n: number }).n >= 50)
        throw new HttpError(409, "The pilot is limited to 50 rooms.");
      db.prepare("INSERT INTO community_rooms VALUES (?,?,?,?,?,?)").run(
        input.id,
        input.title,
        input.bookTitle,
        input.author,
        input.description,
        time,
      );
      audit(user, "community.room", null, input.id);
      return { id: input.id };
    }
    case "post": {
      requireParticipant(user, true);
      const old = db.prepare("SELECT * FROM community_posts WHERE id=?").get(input.id) as
        ReturnType<typeof postRow> | undefined;
      if (old) {
        if (
          old.user_id !== user.id ||
          old.room_id !== input.roomId ||
          old.parent_id !== input.parentId ||
          old.body !== input.body ||
          old.title !== input.title ||
          !!old.spoiler !== input.spoiler ||
          old.removed
        )
          throw new HttpError(
            409,
            "This post was already saved with different content. Refresh before retrying.",
          );
        return { id: old.id };
      }
      if (!db.prepare("SELECT 1 FROM community_rooms WHERE id=?").get(input.roomId))
        throw new HttpError(404, "Room not found.");
      if (input.parentId) {
        const root = visiblePost(user, input.parentId);
        if (root.parent_id || root.room_id !== input.roomId || root.removed)
          throw new HttpError(404, "Discussion not found.");
        if (root.locked || root.hidden)
          throw new HttpError(409, "This discussion is closed to replies.");
        if (input.title) throw new HttpError(400, "Replies do not have titles.");
      } else if (!input.title) throw new HttpError(400, "Give your discussion a title.");
      const recent = db.prepare(
        "SELECT count(*) n FROM community_posts WHERE user_id=? AND created_at >= ?",
      );
      if (
        (recent.get(user.id, new Date(Date.now() - 60000).toISOString()) as { n: number }).n >=
          10 ||
        (recent.get(user.id, new Date(Date.now() - 86400000).toISOString()) as { n: number }).n >=
          100
      )
        throw new HttpError(429, "Posting limit reached. Please try again later.");
      db.prepare(
        "INSERT INTO community_posts(id,room_id,parent_id,user_id,title,body,spoiler,created_at) VALUES (?,?,?,?,?,?,?,?)",
      ).run(
        input.id,
        input.roomId,
        input.parentId,
        user.id,
        input.title,
        input.body,
        Number(input.spoiler),
        time,
      );
      return { id: input.id };
    }
    case "remove": {
      const post = postRow(input.id);
      if (post.user_id !== user.id) throw new HttpError(403, "You can only remove your own posts.");
      db.prepare(
        "UPDATE community_posts SET body='',title=CASE WHEN parent_id IS NULL THEN '[Removed discussion]' ELSE '' END,removed=1,spoiler=0 WHERE id=?",
      ).run(input.id);
      return {};
    }
    case "moderate":
      requireModerator(user);
      postRow(input.id);
      db.prepare("UPDATE community_posts SET hidden=?,locked=? WHERE id=?").run(
        Number(input.hidden),
        Number(input.locked),
        input.id,
      );
      audit(user, "community.moderate", null, JSON.stringify(input));
      return {};
    case "report": {
      requireParticipant(user, true);
      const post = visiblePost(user, input.id);
      if (post.removed) throw new HttpError(404, "Post not found.");
      if (
        db
          .prepare("SELECT 1 FROM community_reports WHERE post_id=? AND reporter_id=?")
          .get(input.id, user.id)
      )
        return {};
      const total = db
        .prepare("SELECT count(*) n FROM community_reports WHERE reporter_id=? AND created_at>=?")
        .get(user.id, new Date(Date.now() - 86400000).toISOString()) as { n: number };
      if (total.n >= 10)
        throw new HttpError(429, "Report limit reached. Please try again tomorrow.");
      db.prepare(
        "INSERT INTO community_reports(post_id,reporter_id,reason,created_at) VALUES (?,?,?,?)",
      ).run(input.id, user.id, input.reason, time);
      return {};
    }
    case "resolve":
      requireModerator(user);
      db.prepare("UPDATE community_reports SET resolved_at=? WHERE id=?").run(time, input.reportId);
      audit(user, "community.resolve", null, String(input.reportId));
      return {};
  }
}
