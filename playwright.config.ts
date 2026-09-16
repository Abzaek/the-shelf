import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const dataDir =
  process.env.SHELF_E2E_DATA_DIR ?? fs.mkdtempSync(path.join(os.tmpdir(), "shelf-browser-test-"));
process.env.SHELF_E2E_DATA_DIR = dataDir;
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 90000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3110",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { executablePath: process.env.SHELF_TEST_CHROMIUM_PATH },
      },
    },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "iphone", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    command: "node scripts/browser-test-server.mjs",
    url: "http://localhost:3110/login",
    timeout: 120000,
    reuseExistingServer: false,
    env: {
      SHELF_DATA_DIR: dataDir,
      SHELF_SESSION_SECRET: "isolated-browser-tests-secret-more-than-32-characters",
      SHELF_APP_URL: "http://localhost:3110",
      SHELF_REQUIRE_EMAIL_VERIFICATION: "false",
      SHELF_MIN_FREE_DISK_BYTES: "0",
      SHELF_USER_QUOTA_BYTES: "52428800",
      SHELF_REGISTRATION: "open",
      SHELF_SUPERADMIN_EMAIL: "community-host@example.test",
    },
  },
});
