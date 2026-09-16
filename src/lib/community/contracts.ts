import { z } from "zod";
const id = z.string().uuid();
const text = (max: number) => z.string().trim().min(1).max(max);
export const communityCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("join"), alias: text(40), acceptRules: z.literal(true) }),
  z.object({ action: z.literal("leave") }),
  z.object({ action: z.literal("invite"), email: z.email().max(254) }),
  z.object({
    action: z.literal("member"),
    userId: z.string().min(1).max(100),
    suspended: z.boolean(),
  }),
  z.object({ action: z.literal("pause"), paused: z.boolean() }),
  z.object({
    action: z.literal("room"),
    id,
    title: text(100),
    bookTitle: text(160),
    author: text(100),
    description: text(600),
  }),
  z.object({
    action: z.literal("post"),
    id,
    roomId: id,
    parentId: id.nullable(),
    title: z.string().trim().max(140),
    body: text(4000),
    spoiler: z.boolean(),
  }),
  z.object({ action: z.literal("remove"), id }),
  z.object({ action: z.literal("moderate"), id, hidden: z.boolean(), locked: z.boolean() }),
  z.object({ action: z.literal("report"), id, reason: text(500) }),
  z.object({ action: z.literal("resolve"), reportId: z.number().int().positive() }),
]);
export type CommunityCommand = z.infer<typeof communityCommand>;
export type Membership = { status: "invited" | "active" | "suspended" | "left"; alias: string };
export type CommunityRoom = {
  id: string;
  title: string;
  bookTitle: string;
  author: string;
  description: string;
  threads: number;
};
export type CommunityPost = {
  id: string;
  roomId: string;
  parentId: string | null;
  title: string;
  body: string;
  alias: string;
  own: boolean;
  spoiler: boolean;
  hidden: boolean;
  locked: boolean;
  removed: boolean;
  createdAt: string;
  replies: number;
};
export type CommunityHome = {
  admin: boolean;
  paused: boolean;
  membership: Membership | null;
  rooms: CommunityRoom[];
};
export type CommunityDiscussion = {
  room: CommunityRoom;
  thread: CommunityPost | null;
  posts: CommunityPost[];
  page: number;
  hasMore: boolean;
};
export type CommunityAdmin = {
  members: { userId: string; email: string; alias: string; status: Membership["status"] }[];
  reports: {
    id: number;
    postId: string;
    reason: string;
    alias: string;
    body: string;
    title: string;
    hidden: boolean;
    locked: boolean;
    removed: boolean;
  }[];
  metrics: {
    members: number;
    contributors: number;
    threads: number;
    repliedThreads: number;
    returningReaders: number;
  };
};
export const COMMUNITY_RULES =
  "Discuss books respectfully. Mark spoilers. Share your own words, not book files or private information. Report abuse. Moderators may remove posts or suspend access.";
