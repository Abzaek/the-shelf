// pm2 process definition for The Shelf on the server.
// Secrets and paths come from /home/opc/apps/the-shelf/shelf.env (not in git).
const fs = require("node:fs");
const path = require("node:path");

function loadEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith("#")) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const APP_ROOT = "/home/opc/apps/the-shelf";
const secrets = loadEnvFile(path.join(APP_ROOT, "shelf.env"));

module.exports = {
  apps: [
    {
      name: "the-shelf",
      script: "server.js",
      cwd: `${APP_ROOT}/current`,
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: "3002",
        HOSTNAME: "127.0.0.1",
        SHELF_DATA_DIR: "/srv/shelf-data",
        SHELF_TOTAL_QUOTA_BYTES: String(10 * 1024 ** 3),
        SHELF_USER_QUOTA_BYTES: String(250 * 1024 ** 2),
        SHELF_REGISTRATION: "open",
        SHELF_APP_URL: "https://shelf.abzaek.dev",
        SHELF_EMAIL_FROM: "The Shelf <shelf@abzaek.dev>",
        ...secrets,
      },
      max_memory_restart: "500M",
    },
  ],
};
