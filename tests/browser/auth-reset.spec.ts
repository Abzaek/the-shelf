import { createHash, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { test, expect } from "@playwright/test";

const testSessionSecret = "isolated-browser-tests-secret-more-than-32-characters";

function seedResetToken(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const directory = process.env.SHELF_E2E_DATA_DIR;
  if (!directory) throw new Error("SHELF_E2E_DATA_DIR is not configured.");
  const dbPath = path.join(directory, "shelf.sqlite");
  if (!fs.existsSync(dbPath)) throw new Error(`Browser test database not found: ${dbPath}`);
  const db = new Database(dbPath);
  const timestamp = new Date().toISOString();
  db.prepare(
    "UPDATE email_tokens SET consumed_at=? WHERE user_id=? AND purpose='reset-password' AND consumed_at IS NULL",
  ).run(timestamp, userId);
  db.prepare(
    "INSERT INTO email_tokens (id,user_id,purpose,token_hash,created_at,expires_at) VALUES (?,?,?,?,?,?)",
  ).run(
    randomUUID(),
    userId,
    "reset-password",
    createHash("sha256")
      .update(token + testSessionSecret)
      .digest("base64url"),
    timestamp,
    new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  );
  db.close();
  return token;
}

test("password recovery pages are reachable without a signed-in session", async ({
  page,
  context,
}) => {
  expect(await context.cookies()).toHaveLength(0);
  await page.goto("/forgot-password");
  await expect(page).toHaveURL(/\/forgot-password$/);
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();

  await page.goto("/reset-password?token=fixture-token-that-is-not-valid");
  await expect(page).toHaveURL(/\/reset-password\?token=/);
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
});

test("password recovery request and reset work through the browser", async ({ page, context }) => {
  const email = `password-reset-${randomUUID()}@example.test`;
  const oldPassword = "existing-password-123";
  const newPassword = "new-password-for-the-shelf-456";
  const registration = await context.request.post("/api/auth/register", {
    headers: { "X-Real-IP": `test-${randomUUID()}` },
    data: { email, password: oldPassword, displayName: "Reset reader" },
  });
  expect(registration.ok(), await registration.text()).toBeTruthy();
  const { user } = await registration.json();
  await context.addCookies(
    (await context.cookies()).map((cookie) => ({ ...cookie, secure: false })),
  );

  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(
    page.getByText("If an account exists for that email, a reset link will arrive shortly."),
  ).toBeVisible();

  const token = seedResetToken(user.id);
  await page.goto(`/reset-password?token=${encodeURIComponent(token)}`);
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm new password", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page).toHaveURL(/\/login$/);

  const oldLogin = await context.request.post("/api/auth/login", {
    headers: { "X-Real-IP": `test-${randomUUID()}` },
    data: { email, password: oldPassword },
  });
  expect(oldLogin.status()).toBe(401);
  const newLogin = await context.request.post("/api/auth/login", {
    headers: { "X-Real-IP": `test-${randomUUID()}` },
    data: { email, password: newPassword },
  });
  expect(newLogin.ok(), await newLogin.text()).toBeTruthy();
});
