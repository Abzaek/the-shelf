/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "shelf-auth-reset-test-"));
process.env.SHELF_DATA_DIR = directory;
process.env.SHELF_REQUIRE_EMAIL_VERIFICATION = "false";
process.env.SHELF_SESSION_SECRET = "isolated-password-reset-tests-secret";
process.env.SHELF_APP_URL = "https://shelf.example.test";

const sentEmails = [];
const originalLoad = Module._load;
Module._load = function (id, parent, isMain) {
  if (id === "server-only") return {};
  if (id === "next/headers")
    return {
      headers: async () => new Headers({ "x-real-ip": "auth-reset-test" }),
      cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
    };
  if (id === "@/server/email") {
    const emailModule = originalLoad.call(
      this,
      path.join(process.cwd(), "src/server/email.ts"),
      parent,
      isMain,
    );
    return { ...emailModule, sendEmail: async (message) => sentEmails.push(message) };
  }
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

const { getDb } = require("../src/server/db.ts");
const { createEmailToken, createSession, createUser, findUserByEmail, verifyPassword } = require("../src/server/auth.ts");
const { POST: requestReset } = require("../src/app/api/auth/request-password-reset/route.ts");
const { POST: resetPassword } = require("../src/app/api/auth/reset-password/route.ts");
const db = getDb();

function post(body) {
  return new Request("http://localhost/api/auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function run() {
  const email = "reader@example.test";
  const user = await createUser(email, "original-password-123");
  await createSession(user.id);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sessions WHERE user_id=?").get(user.id).n, 1);

  const knownResponse = await requestReset(post({ email }));
  assert.equal(knownResponse.status, 200);
  const knownBody = await knownResponse.json();
  assert.deepEqual(knownBody, {
    ok: true,
    message: "If an account exists for that email, a reset link will be sent.",
  });
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, email);
  const resetLink = /https:\/\/shelf\.example\.test\/reset-password\?token=([A-Za-z0-9_-]+)/.exec(
    sentEmails[0].text,
  );
  assert.ok(resetLink, "reset email contains a link to the app reset page");
  assert.ok(sentEmails[0].html.includes(resetLink[0]), "HTML email uses the same reset link");
  const token = resetLink[1];
  assert.ok(token);
  const storedToken = db.prepare("SELECT token_hash FROM email_tokens WHERE user_id=? AND purpose='reset-password'").get(user.id);
  assert.ok(storedToken.token_hash);
  assert.notEqual(storedToken.token_hash, token, "only a hash of the reset token is stored");

  const unknownResponse = await requestReset(post({ email: "missing@example.test" }));
  assert.equal(unknownResponse.status, 200);
  assert.deepEqual(await unknownResponse.json(), knownBody, "unknown addresses receive the same response");
  assert.equal(sentEmails.length, 1, "unknown addresses do not receive email");

  const badPassword = await resetPassword(post({ token, password: "short" }));
  assert.equal(badPassword.status, 400);
  assert.equal(await verifyPassword("original-password-123", findUserByEmail(email).passwordHash), true);

  const resetResponse = await resetPassword(post({ token, password: "replacement-password-456" }));
  assert.equal(resetResponse.status, 200, await resetResponse.text());
  const updatedUser = findUserByEmail(email);
  assert.equal(await verifyPassword("replacement-password-456", updatedUser.passwordHash), true);
  assert.equal(await verifyPassword("original-password-123", updatedUser.passwordHash), false);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sessions WHERE user_id=?").get(user.id).n, 0, "reset revokes sessions");

  const replayResponse = await resetPassword(post({ token, password: "another-replacement-789" }));
  assert.equal(replayResponse.status, 400, "reset tokens are single-use");

  const expiredToken = createEmailToken(user.id, "reset-password", -1000);
  const expiredResponse = await resetPassword(post({ token: expiredToken, password: "replacement-password-456" }));
  assert.equal(expiredResponse.status, 400, "expired links cannot reset passwords");

  console.log("Auth reset checks passed: generic request response, hashed single-use token, validation, password update, session revocation, replay rejection and expiry.");
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
