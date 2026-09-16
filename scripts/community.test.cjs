/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  Module = require("node:module"),
  ts = require("typescript");
const { randomUUID } = require("node:crypto");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "shelf-community-test-"));
process.env.SHELF_DATA_DIR = directory;
process.env.SHELF_REQUIRE_EMAIL_VERIFICATION = "false";
process.env.SHELF_SESSION_SECRET = "isolated-community-secret-with-more-than-32-characters";
process.env.SHELF_SUPERADMIN_EMAIL = "host@example.test";
let token;
const original = Module._load;
Module._load = function (id, parent, isMain) {
  if (id === "server-only") return {};
  if (id === "next/headers")
    return {
      headers: async () => new Headers(),
      cookies: async () => ({ get: () => (token ? { value: token } : undefined) }),
    };
  if (id.startsWith("@/")) id = path.join(process.cwd(), "src", id.slice(2));
  return original.call(this, id, parent, isMain);
};
Module._extensions[".ts"] = (mod, file) =>
  mod._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
    }).outputText,
    file,
  );
const { getDb, MIGRATIONS } = require("../src/server/db.ts");
// Exercise the actual upgrade path from the deployed v5 database, not just an empty DB.
const DB = require("better-sqlite3"),
  old = new DB(path.join(directory, "shelf.sqlite"));
old.exec(
  "PRAGMA foreign_keys=ON;CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL)",
);
MIGRATIONS.slice(0, 5).forEach((sql, i) => {
  old.exec(sql);
  old.prepare("INSERT INTO schema_migrations VALUES (?,?)").run(i + 1, new Date().toISOString());
});
old
  .prepare("INSERT INTO users(id,email,password_hash,created_at,updated_at) VALUES (?,?,?,?,?)")
  .run("legacy", "private@example.test", "unused", "2026-09-01", "2026-09-01");
old
  .prepare(
    "INSERT INTO books(id,user_id,format,title,status,created_at,updated_at) VALUES ('legacy-book','legacy','pdf','PRIVATE BOOK','reading','2026-09-01','2026-09-01')",
  )
  .run();
old.close();
const { createUser, createSession } = require("../src/server/auth.ts");
const { command } = require("../src/server/community/commands.ts");
const { home, discussion, moderation } = require("../src/server/community/queries.ts");
const { communityCommand } = require("../src/lib/community/contracts.ts");
const { GET, POST } = require("../src/app/api/community/route.ts");
const db = getDb();
const fails = (code, fn) => assert.throws(fn, (error) => error.status === code);
async function run() {
  assert.equal(db.prepare("SELECT max(version) n FROM schema_migrations").get().n, 6);
  assert.equal(
    db.prepare("SELECT title FROM books WHERE id='legacy-book'").get().title,
    "PRIVATE BOOK",
  );
  const host = await createUser("host@example.test", "test-password-123", "Private Host");
  const a = await createUser("a@example.test", "test-password-123", "Private Name A");
  const b = await createUser("b@example.test", "test-password-123", "Private Name B");
  const stranger = await createUser(
    "stranger@example.test",
    "test-password-123",
    "Private Stranger",
  );
  const room = {
    action: "room",
    id: randomUUID(),
    title: "A shared read",
    bookTitle: "Public Book",
    author: "Public Author",
    description: "What surprised you?",
  };
  fails(403, () => command(a, room));
  command(host, room);
  command(host, room);
  fails(409, () => command(host, { ...room, title: "Changed" }));
  assert.deepEqual(home(stranger).rooms, []);
  fails(403, () => discussion(stranger, room.id, null, 0));
  fails(403, () => moderation(stranger));
  fails(403, () => command(stranger, { action: "join", alias: "Uninvited", acceptRules: true }));
  for (const [reader, alias] of [
    [a, "Reader A"],
    [b, "Reader B"],
  ]) {
    command(host, { action: "invite", email: reader.email });
    assert.deepEqual(home(reader).rooms, []);
    command(reader, { action: "join", alias, acceptRules: true });
  }
  fails(409, () => command(b, { action: "join", alias: "reader a", acceptRules: true }));
  const post = {
    action: "post",
    id: randomUUID(),
    roomId: room.id,
    parentId: null,
    title: "A question",
    body: "My perspective",
    spoiler: true,
  };
  command(a, post);
  command(a, post);
  assert.equal(discussion(b, room.id, null, 0).posts.length, 1);
  fails(409, () => command(b, post));
  fails(409, () => command(a, { ...post, body: "Different" }));
  const shared = JSON.stringify(discussion(b, room.id, null, 0));
  for (const privateValue of [
    "PRIVATE BOOK",
    "Private Name A",
    "a@example.test",
    "password_hash",
    "file_name",
  ])
    assert.ok(!shared.includes(privateValue));
  const reply = {
    ...post,
    id: randomUUID(),
    parentId: post.id,
    title: "",
    body: "Another perspective",
    spoiler: false,
  };
  command(b, reply);
  fails(404, () => command(b, { ...reply, id: randomUUID(), parentId: reply.id }));
  fails(403, () => command(b, { action: "remove", id: post.id }));
  fails(403, () => command(b, { action: "moderate", id: post.id, hidden: true, locked: true }));
  command(b, { action: "report", id: post.id, reason: "Review this please" });
  command(b, { action: "report", id: post.id, reason: "Retry" });
  assert.equal(moderation(host).reports.length, 1);
  assert.equal(typeof moderation(host).reports[0].hidden, "boolean");
  assert.equal(moderation(host).metrics.repliedThreads, 1);
  command(host, { action: "moderate", id: post.id, hidden: false, locked: true });
  fails(409, () => command(b, { ...reply, id: randomUUID() }));
  command(host, { action: "moderate", id: post.id, hidden: true, locked: true });
  assert.equal(discussion(b, room.id, null, 0).posts.length, 0);
  assert.equal(moderation(host).metrics.contributors, 0);
  fails(404, () => discussion(b, room.id, post.id, 0));
  assert.equal(discussion(host, room.id, post.id, 0).thread.hidden, true);
  command(host, { action: "resolve", reportId: moderation(host).reports[0].id });
  assert.equal(moderation(host).reports.length, 0);
  command(host, { action: "member", userId: a.id, suspended: true });
  fails(403, () => command(a, { ...post, id: randomUUID() }));
  fails(403, () => command(a, { action: "join", alias: "New alias", acceptRules: true }));
  command(host, { action: "pause", paused: true });
  assert.deepEqual(home(b).rooms, []);
  fails(403, () => discussion(b, room.id, null, 0));
  fails(403, () => command(b, { ...post, id: randomUUID() }));
  assert.equal(home(host).rooms.length, 1);
  command(host, { action: "pause", paused: false });
  command(host, { action: "member", userId: a.id, suspended: false });
  command(host, { action: "moderate", id: post.id, hidden: false, locked: false });
  // Pagination remains bounded, and rate limits include removed posts.
  for (let i = 0; i < 28; i++) {
    db.prepare(
      "INSERT INTO community_posts(id,room_id,user_id,title,body,created_at) VALUES (?,?,?,?,?,?)",
    ).run(
      randomUUID(),
      room.id,
      a.id,
      "Paged " + i,
      "Body",
      new Date(Date.now() - 86400000 * (i + 1)).toISOString(),
    );
  }
  const first = discussion(b, room.id, null, 0),
    second = discussion(b, room.id, null, 1);
  assert.equal(first.posts.length, 25);
  assert.equal(first.hasMore, true);
  assert.equal(second.hasMore, false);
  assert.equal(new Set([...first.posts, ...second.posts].map((p) => p.id)).size, 29);
  for (let i = 0; i < 9; i++) command(a, { ...post, id: randomUUID() });
  fails(429, () => command(a, { ...post, id: randomUUID() }));
  command(a, { action: "remove", id: post.id });
  fails(429, () => command(a, { ...post, id: randomUUID() }));
  fails(404, () => discussion(b, room.id, post.id, 0));
  assert.equal(db.prepare("SELECT body FROM community_posts WHERE id=?").get(post.id).body, "");
  // Session authorization, account binding, origin, validation and response caching.
  const session = await createSession(b.id);
  token = session.token;
  const get = (headers = {}, query = "") =>
    GET(
      new Request("http://localhost/api/community" + query, {
        headers: { "x-shelf-user": b.id, ...headers },
      }),
    );
  assert.equal((await get()).status, 200);
  assert.match((await get()).headers.get("cache-control"), /no-store/);
  assert.equal((await get({ "x-shelf-user": a.id })).status, 401);
  assert.equal((await get({ origin: "https://evil.example" })).status, 403);
  assert.equal((await get({}, "?view=admin")).status, 403);
  assert.equal((await get({}, "?view=discussion&page=-1")).status, 400);
  const postRequest = (body) =>
    POST(
      new Request("http://localhost/api/community", {
        method: "POST",
        headers: { "x-shelf-user": b.id, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  assert.equal((await postRequest({ action: "join", alias: "B", acceptRules: false })).status, 400);
  assert.equal(
    (await postRequest({ ...reply, id: randomUUID(), body: "x".repeat(4001) })).status,
    400,
  );
  assert.equal(
    (await postRequest({ action: "report", id: post.id, reason: "x".repeat(33000) })).status,
    413,
  );
  assert.equal(communityCommand.safeParse({ ...room, title: "" }).success, false);
  token = null;
  assert.equal((await get()).status, 401);
  command(a, { action: "leave" });
  assert.equal(db.prepare("SELECT count(*) n FROM community_posts WHERE user_id=?").get(a.id).n, 0);
  assert.equal(
    db.prepare("SELECT count(*) n FROM community_posts WHERE parent_id=?").get(post.id).n,
    0,
  );
  assert.equal(home(a).membership.status, "left");
  fails(403, () => command(a, { action: "join", alias: "Again", acceptRules: true }));
  db.prepare("DELETE FROM users WHERE id=?").run(b.id);
  assert.equal(
    db.prepare("SELECT count(*) n FROM community_members WHERE user_id=?").get(b.id).n,
    0,
  );
  assert.deepEqual(db.pragma("foreign_key_check"), []);
  assert.equal(
    db.prepare("SELECT title FROM books WHERE id='legacy-book'").get().title,
    "PRIVATE BOOK",
  );
  // Reproduce a black-holed request even when navigator would still say online.
  const { communityClient } = require("../src/lib/community/client.ts");
  const originalFetch = global.fetch;
  try {
    global.fetch = (_url, options) =>
      new Promise((_resolve, reject) => {
        const abort = () => reject(new DOMException("Aborted", "AbortError"));
        if (options.signal.aborted) abort();
        else options.signal.addEventListener("abort", abort, { once: true });
      });
    await assert.rejects(
      communityClient.home(a.id),
      (error) => error instanceof TypeError && /did not respond/.test(error.message),
    );
    const cancel = new AbortController();
    cancel.abort();
    await assert.rejects(
      communityClient.home(a.id, cancel.signal),
      (error) => error.name === "AbortError",
    );
  } finally {
    global.fetch = originalFetch;
  }
  console.log(
    "Community checks passed: v5 upgrade, invitations, consent, privacy, authorization, moderation, suspension, pause, idempotency, pagination, limits, leave, account deletion, and stalled-request recovery.",
  );
}
run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
