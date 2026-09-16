/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "shelf-sync-test-"));
process.env.SHELF_DATA_DIR = directory;
process.env.SHELF_REQUIRE_EMAIL_VERIFICATION = "false";
process.env.SHELF_SESSION_SECRET = "isolated-test-secret-with-at-least-32-characters";
process.env.SHELF_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 17).toString("base64");
let token;
const oauthCookies = new Map();
const originalLoad = Module._load;
Module._load = function (id, parent, isMain) {
  if (id === "server-only") return {};
  if (id === "next/headers")
    return {
      headers: async () => new Headers(),
      cookies: async () => ({
        get: (name) =>
          name === "shelf_drive_oauth"
            ? oauthCookies.has(name)
              ? { value: oauthCookies.get(name) }
              : undefined
            : token
              ? { value: token }
              : undefined,
        set: (name, value) => oauthCookies.set(name, value),
      }),
    };
  if (id.startsWith("@/")) id = path.join(process.cwd(), "src", id.slice(2));
  return originalLoad.call(this, id, parent, isMain);
};
Module._extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
const { getDb, MIGRATIONS } = require("../src/server/db.ts");
const { createUser, createSession } = require("../src/server/auth.ts");
const { books, notes, collections } = require("../src/server/repo.ts");
const { pullDocuments, pushDocuments } = require("../src/server/sync/store.ts");
const { documentFor, sameDocument } = require("../src/lib/sync/documents.ts");
const { resolveDocumentConflict } = require("../src/lib/sync/conflicts.ts");
const { validateDocument } = require("../src/lib/sync/validation.ts");
const { seal, unseal } = require("../src/server/drive/crypto.ts");
const { POST } = require("../src/app/api/sync/route.ts");
const db = getDb();
const current = (user, id) => pullDocuments(user, 0, 200).documents.find((doc) => doc.id === id);
const change = (doc, patch) => ({
  ...doc,
  payload: JSON.stringify({ ...JSON.parse(doc.payload), ...patch }),
});
async function run() {
  assert.equal(db.prepare("SELECT COUNT(*) n FROM schema_migrations").get().n, MIGRATIONS.length);
  const a = await createUser("a@example.test", "test-password-123", "A");
  const b = await createUser("b@example.test", "test-password-123", "B");
  assert.equal(a.quotaBytes, 50 * 1024 ** 2);
  const book = books.create(a.id, {
    format: "pdf",
    title: "Original",
    author: "A",
    description: "",
    category: "Other",
    tags: [],
    status: "reading",
    totalPages: 100,
    fileName: "book.pdf",
    fileSize: 100,
    coverKind: "none",
    coverSize: 0,
  });
  const note = notes.add(a.id, book.id, 1, "Original note");
  const first = pullDocuments(a.id, 0, 1);
  assert.equal(first.documents.length, 1);
  const rest = pullDocuments(a.id, first.checkpoint.sequence, 200);
  assert.ok(rest.checkpoint.sequence > first.checkpoint.sequence);
  assert.equal(pullDocuments(a.id, rest.checkpoint.sequence, 200).documents.length, 0);
  assert.equal(
    pullDocuments(b.id, 0, 200).documents.some((doc) => doc.type === "book"),
    false,
  );
  const original = current(a.id, `note|${note.id}`);
  const left = change(original, { content: "From phone" }),
    right = change(original, { content: "From laptop" });
  assert.deepEqual(
    pushDocuments(a.id, [{ assumedMasterState: original, newDocumentState: left }]),
    [],
  );
  assert.deepEqual(
    pushDocuments(a.id, [{ assumedMasterState: original, newDocumentState: left }]),
    [],
    "lost response retries are idempotent",
  );
  const conflicts = pushDocuments(a.id, [
    { assumedMasterState: original, newDocumentState: right },
  ]);
  assert.equal(conflicts.length, 1);
  const merged = resolveDocumentConflict({
    assumedMasterState: original,
    realMasterState: conflicts[0],
    newDocumentState: right,
  });
  assert.equal(JSON.parse(merged.payload).content, "From phone");
  assert.deepEqual(JSON.parse(merged.payload).conflictCopies, ["From laptop"]);
  assert.deepEqual(
    pushDocuments(a.id, [{ assumedMasterState: conflicts[0], newDocumentState: merged }]),
    [],
  );
  assert.deepEqual(notes.list(a.id, book.id)[0].conflictCopies, ["From laptop"]);
  const baseBook = current(a.id, `book|${book.id}`);
  const renamed = change(baseBook, { title: "Renamed" });
  pushDocuments(a.id, [{ assumedMasterState: baseBook, newDocumentState: renamed }]);
  const independent = resolveDocumentConflict({
    assumedMasterState: baseBook,
    realMasterState: current(a.id, baseBook.id),
    newDocumentState: change(baseBook, { author: "Different author" }),
  });
  assert.equal(JSON.parse(independent.payload).title, "Renamed");
  assert.equal(JSON.parse(independent.payload).author, "Different author");
  const collection = collections.create(a.id, "Club");
  pullDocuments(a.id, 0, 200);
  const membership = documentFor(
    "membership",
    `${collection.id}|${book.id}`,
    { collectionId: collection.id, bookId: book.id },
    book.id,
  );
  validateDocument(membership);
  pushDocuments(a.id, [{ newDocumentState: membership }]);
  const removedMembership = { ...membership, _deleted: true };
  pushDocuments(a.id, [{ assumedMasterState: membership, newDocumentState: removedMembership }]);
  assert.deepEqual(collections.get(a.id, collection.id).bookIds, []);
  assert.deepEqual(
    pushDocuments(a.id, [{ assumedMasterState: removedMembership, newDocumentState: membership }]),
    [],
    "explicit observed membership re-add works",
  );
  assert.deepEqual(collections.get(a.id, collection.id).bookIds, [book.id]);
  const beforeDelete = current(a.id, baseBook.id);
  pushDocuments(a.id, [
    { assumedMasterState: beforeDelete, newDocumentState: { ...beforeDelete, _deleted: true } },
  ]);
  assert.equal(books.get(a.id, book.id), null);
  const stale = pushDocuments(a.id, [
    {
      assumedMasterState: beforeDelete,
      newDocumentState: change(beforeDelete, { title: "Resurrection" }),
    },
  ]);
  assert.equal(stale[0]._deleted, true);
  assert.equal(
    resolveDocumentConflict({
      assumedMasterState: beforeDelete,
      realMasterState: stale[0],
      newDocumentState: renamed,
    })._deleted,
    true,
  );
  assert.equal(current(a.id, original.id)._deleted, true, "cascaded note deletion replicated");
  assert.throws(() => validateDocument({ ...membership, key: "../bad" }));
  assert.throws(() => validateDocument(change(beforeDelete, { fileSize: -1 })));
  const ciphertext = seal({ refresh_token: "fixture-only" });
  assert.ok(!ciphertext.includes("fixture-only"));
  assert.equal(unseal(ciphertext).refresh_token, "fixture-only");
  const damaged = Buffer.from(ciphertext, "base64url");
  damaged[damaged.length - 1] ^= 1;
  assert.throws(() => unseal(damaged.toString("base64url")));
  token = (await createSession(a.id)).token;
  const request = (body, origin = "http://localhost") =>
    POST(
      new Request("http://localhost/api/sync", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  assert.equal(
    (await request({ version: 1, userId: b.id, action: "pull" })).status,
    401,
    "account switch cannot write to another account",
  );
  assert.equal(
    (await request({ version: 1, userId: a.id, action: "pull" }, "https://attacker.test")).status,
    403,
  );
  assert.equal((await request({ version: 2, userId: a.id, action: "pull" })).status, 400);
  const valid = await request({ version: 1, userId: a.id, action: "pull" });
  assert.equal(valid.status, 200);
  assert.equal(valid.headers.get("cache-control"), "no-store");
  // Exercise OAuth state/PKCE and token refresh using fake Google responses only.
  process.env.GOOGLE_DRIVE_CLIENT_ID = "fixture-client";
  process.env.GOOGLE_DRIVE_CLIENT_SECRET = "fixture-secret";
  process.env.GOOGLE_DRIVE_PICKER_API_KEY = "fixture-picker";
  process.env.GOOGLE_DRIVE_PROJECT_NUMBER = "12345";
  const driveConnect = require("../src/app/api/drive/connect/route.ts").POST;
  const driveCallback = require("../src/app/api/drive/callback/route.ts").GET;
  const driveClient = require("../src/server/drive/client.ts");
  const deviceRequest = () =>
    new Request("http://localhost/api/drive/connect", {
      method: "POST",
      headers: { "X-Shelf-User": a.id },
    });
  const connect = await driveConnect(deviceRequest());
  assert.equal(connect.status, 200);
  const authorization = new URL((await connect.json()).url);
  assert.equal(
    authorization.searchParams.get("scope"),
    "https://www.googleapis.com/auth/drive.file",
  );
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  const validState = oauthCookies.get("shelf_drive_oauth");
  const oldFetch = global.fetch;
  let exchanges = 0;
  global.fetch = async (url, options) => {
    assert.equal(String(url), "https://oauth2.googleapis.com/token");
    exchanges++;
    const form = new URLSearchParams(options.body);
    if (form.get("grant_type") === "authorization_code") {
      assert.equal(form.get("code_verifier"), unseal(validState).verifier);
      return Response.json({
        access_token: "fixture-access",
        refresh_token: "fixture-refresh",
        expires_in: 3600,
      });
    }
    assert.equal(form.get("refresh_token"), "fixture-refresh");
    return Response.json({ access_token: "fixture-refreshed", expires_in: 3600 });
  };
  try {
    const bad = await driveCallback(
      new Request("http://localhost/api/drive/callback?code=fixture&state=wrong"),
    );
    assert.equal(bad.status, 400);
    assert.equal(exchanges, 0);
    oauthCookies.set("shelf_drive_oauth", validState);
    const callbackUrl = `http://localhost/api/drive/callback?code=fixture&state=${authorization.searchParams.get("state")}`;
    assert.equal((await driveCallback(new Request(callbackUrl))).status, 307);
    assert.equal(
      (await driveCallback(new Request(callbackUrl))).status,
      400,
      "OAuth state cannot be replayed",
    );
    assert.equal(driveClient.connection(b.id), null, "Drive credentials remain account scoped");
    assert.ok(
      !db
        .prepare("SELECT tokens FROM drive_connections WHERE user_id=?")
        .get(a.id)
        .tokens.includes("fixture-refresh"),
    );
    driveClient.saveConnection(a.id, { ...driveClient.connection(a.id), expires_at: 0 });
    assert.equal(await driveClient.accessToken(a.id), "fixture-refreshed");
    assert.equal(exchanges, 2);
  } finally {
    global.fetch = oldFetch;
  }
  token = undefined;
  assert.equal((await request({ version: 1, userId: a.id, action: "pull" })).status, 401);
  assert.ok(
    sameDocument(beforeDelete, {
      ...beforeDelete,
      payload: JSON.stringify(JSON.parse(beforeDelete.payload), null, 2),
    }),
  );
  console.log(
    "Sync checks passed: migration, quota defaults, ordered checkpoints, isolation, retries, three-way merges, preserved notes, memberships, tombstones, validation, token encryption, mocked Drive OAuth/PKCE/refresh, auth and origin checks.",
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
