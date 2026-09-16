import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { execFileSync, spawn } from "node:child_process";

// Exercise the deployment artifact. The test-only proxy can drop a device's TCP
// connections because Playwright's WebKit offline emulation bypasses SW fallback.
const release = fs.mkdtempSync(path.join(os.tmpdir(), "shelf-browser-release-"));
execFileSync("bash", ["deploy/stage.sh", release], { stdio: "inherit" });
const child = spawn(process.execPath, [path.join(release, "server.js")], {
  stdio: "inherit",
  env: { ...process.env, PORT: "3111", HOSTNAME: "127.0.0.1" },
});
const disconnected = new Set();
const stalledNavigations = new Set();
const proxy = http.createServer((request, response) => {
  if (request.url === "/__test/network" && request.method === "POST") {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const { id, offline, stallNavigation } = JSON.parse(body);
      if (!/^[a-f0-9-]{36}$/.test(id)) {
        response.writeHead(400).end();
        return;
      }
      if (offline) disconnected.add(id);
      else disconnected.delete(id);
      if (offline && stallNavigation) stalledNavigations.add(id);
      else stalledNavigations.delete(id);
      response
        .writeHead(200, {
          "Content-Type": "application/json",
          "Set-Cookie": `shelf_test_device=${id}; Path=/; SameSite=Lax`,
        })
        .end("{}");
    });
    return;
  }
  const device = /(?:^|;\s*)shelf_test_device=([a-f0-9-]+)/.exec(request.headers.cookie ?? "")?.[1];
  const fixtureRegistration =
    request.url === "/api/auth/register" &&
    String(request.headers["x-real-ip"] ?? "").startsWith("test-");
  if (device && disconnected.has(device) && !fixtureRegistration) {
    // Simulate a connection that accepts a document request but never answers.
    // The service worker must enforce its own deadline; no synthetic HTTP error.
    if (stalledNavigations.has(device) && String(request.headers.accept).includes("text/html"))
      return;
    request.socket.destroy();
    return;
  }
  const upstream = http.request(
    {
      hostname: "127.0.0.1",
      port: 3111,
      method: request.method,
      path: request.url,
      headers: request.headers,
    },
    (incoming) => {
      response.writeHead(incoming.statusCode ?? 502, incoming.headers);
      incoming.pipe(response);
    },
  );
  upstream.on("error", () => {
    if (!response.headersSent) response.writeHead(502);
    response.end();
  });
  request.on("error", () => upstream.destroy());
  request.pipe(upstream);
});
proxy.listen(3110, "127.0.0.1");
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    stopping = true;
    proxy.close();
    proxy.closeAllConnections();
    child.kill(signal);
  });
child.on("exit", (code) => {
  proxy.close();
  fs.rmSync(release, { recursive: true, force: true });
  process.exit(stopping ? 0 : (code ?? 1));
});
