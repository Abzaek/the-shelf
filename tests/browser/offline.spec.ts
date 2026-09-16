import { zipSync, strToU8 } from "fflate";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { createPlaceholderPdf } from "../../src/lib/pdf/placeholder";
const networkIds = new WeakMap<BrowserContext, string>();
async function setOffline(context: BrowserContext, offline: boolean, stallNavigation = false) {
  if (context.browser()?.browserType().name() !== "webkit" && !stallNavigation)
    return context.setOffline(offline);
  const id = networkIds.get(context) ?? crypto.randomUUID();
  networkIds.set(context, id);
  const response = await context.request.post("/__test/network", {
    data: { id, offline, stallNavigation },
  });
  expect(response.ok()).toBeTruthy();
  // A proxy outage doesn't produce the OS online event; model reopening/resuming the app.
  if (!offline)
    for (const page of context.pages())
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
}
async function register(context: BrowserContext) {
  const response = await context.request.post("/api/auth/register", {
    headers: { "X-Real-IP": `test-${crypto.randomUUID()}` },
    data: {
      email: `reader-${crypto.randomUUID()}@example.test`,
      password: "isolated-test-password-123",
      displayName: "Offline Reader",
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  // WebKit correctly withholds production Secure cookies on this HTTP-only test origin.
  await context.addCookies(
    (await context.cookies()).map((cookie) => ({ ...cookie, secure: false })),
  );
  return (await response.json()).user;
}
async function seed(context: BrowserContext, title = "Offline fixture") {
  const file = createPlaceholderPdf({ title, author: "Test Author", pages: 4 });
  const response = await context.request.post("/api/books", {
    multipart: {
      meta: JSON.stringify({
        title,
        author: "Test Author",
        format: "pdf",
        category: "Other",
        status: "reading",
        tags: [],
        totalPages: 4,
        fileName: "fixture.pdf",
      }),
      file: {
        name: "fixture.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from(await file.arrayBuffer()),
      },
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).book;
}
async function ready(page: Page) {
  await page.goto("/settings");
  await expect(page.getByText("Offline app is ready.", { exact: false })).toBeVisible({
    timeout: 60000,
  });
}
async function openNotes(page: Page) {
  await expect(page.locator(".react-pdf__Page__canvas").first()).toBeVisible();
  const notes = page.getByRole("tab", { name: "Notes", exact: true });
  if (!(await notes.isVisible())) {
    const buttons = page.getByRole("button", { name: "More options", exact: true });
    for (const button of await buttons.all())
      if (await button.isVisible()) {
        await button.click();
        break;
      }
    await page.getByRole("menuitem", { name: "Notes", exact: true }).click();
  } else await notes.click();
}

test("download, cold offline launch, PDF reading, durable notes and reconnect", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await register(context);
  const book = await seed(context);
  await ready(page);
  await page.getByText("Downloads (1 books)", { exact: true }).click();
  await page.getByRole("button", { name: "Download for offline reading" }).click();
  await expect(page.getByRole("button", { name: "Remove download", exact: true })).toBeVisible();
  await setOffline(context, true);
  await page.goto(`/read/${book.id}`);
  await expect(page.locator(".react-pdf__Page__canvas").first()).toBeVisible();
  await openNotes(page);
  await page
    .getByRole("textbox", { name: /Note for page/ })
    .fill("Thought written without internet");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(page.getByText("Thought written without internet", { exact: true })).toBeVisible();
  // Offline WebKit may delay the load event for failed network requests.
  // The reader/content assertions below establish actual application readiness.
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".react-pdf__Page__canvas").first()).toBeVisible();
  await openNotes(page);
  await expect(page.getByText("Thought written without internet", { exact: true })).toBeVisible();
  await setOffline(context, false);
  await expect
    .poll(
      async () =>
        (await (await context.request.get(`/api/notes?bookId=${book.id}`)).json()).notes.some(
          (note: { content: string }) => note.content === "Thought written without internet",
        ),
      { timeout: 30000 },
    )
    .toBeTruthy();
  expect(errors).toEqual([]);
});

test("stalled navigation and session checks fall back to the downloaded library", async ({
  page,
  context,
}) => {
  await register(context);
  const book = await seed(context);
  await ready(page);
  await page.getByText("Downloads (1 books)", { exact: true }).click();
  await page.getByRole("button", { name: "Download for offline reading" }).click();
  await expect(page.getByRole("button", { name: "Remove download", exact: true })).toBeVisible();
  // Model the WebKit failure deterministically: an auth request that never
  // settles until the application aborts it, instead of immediately rejecting.
  await page.addInitScript(() => {
    const originalFetch = window.fetch;
    window.fetch = (input, options) => {
      if (input === "/api/auth/me") {
        const check = { started: performance.now(), aborted: 0 };
        Object.assign(window, { __stalledSessionCheck: check });
        return new Promise<Response>((_resolve, reject) => {
          const abort = () => {
            check.aborted = performance.now();
            reject(new DOMException("Aborted", "AbortError"));
          };
          if (options?.signal?.aborted) abort();
          else options?.signal?.addEventListener("abort", abort, { once: true });
        });
      }
      return originalFetch(input, options);
    };
  });
  await setOffline(context, true, true);
  await page.goto(`/read/${book.id}`, { waitUntil: "domcontentloaded", timeout: 10000 });
  // A prepared library opens before the eight-second network session deadline.
  await expect(page.locator(".react-pdf__Page__canvas").first()).toBeVisible({ timeout: 7000 });
  // Check the request deadline independently from hydration/PDF rendering.
  // The normal render allowance starts once local-library fallback can run.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const check = (
          window as Window & {
            __stalledSessionCheck?: { started: number; aborted: number };
          }
        ).__stalledSessionCheck;
        return check?.aborted ? check.aborted - check.started : 0;
      }),
    )
    .toBeGreaterThan(0);
  const elapsed = await page.evaluate(() => {
    const check = (
      window as Window & {
        __stalledSessionCheck?: { started: number; aborted: number };
      }
    ).__stalledSessionCheck;
    return check ? check.aborted - check.started : Infinity;
  });
  expect(elapsed).toBeLessThan(10000);
  await expect(page.locator(".react-pdf__Page__canvas").first()).toBeVisible();
  await openNotes(page);
  await page.getByRole("textbox", { name: /Note for page/ }).fill("Recovered from stalled session");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(page.getByText("Recovered from stalled session", { exact: true })).toBeVisible();
});

test("offline import survives reload and uploads after reconnect", async ({ page, context }) => {
  await register(context);
  await ready(page);
  await setOffline(context, true);
  await page.goto("/");
  await page
    .getByRole("button", { name: /Add (a )?book/i })
    .first()
    .click();
  const file = createPlaceholderPdf({ title: "Imported offline", author: "Fixture", pages: 2 });
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: "Imported offline.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(await file.arrayBuffer()),
    });
  await page.getByRole("button", { name: "Add to shelf", exact: true }).click();
  // The filename is already visible before saving. Wait for the confirmation
  // emitted only after the file and metadata have both been persisted.
  await expect(page.getByText("Added to your shelf", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("Imported offline", { exact: true }).first()).toBeVisible();
  await setOffline(context, false);
  await expect
    .poll(async () => (await (await context.request.get("/api/books")).json()).books.length, {
      timeout: 30000,
    })
    .toBe(1);
  const book = (await (await context.request.get("/api/books")).json()).books[0];
  await expect
    .poll(async () => (await context.request.get(`/api/books/${book.id}/file`)).status(), {
      timeout: 45000,
    })
    .toBe(200);
  expect(
    (await context.request.get(`/api/books/${book.id}/file`)).headers()["content-type"],
  ).toContain("application/pdf");
});

test("private API responses are absent from the service-worker cache", async ({
  page,
  context,
}) => {
  await register(context);
  await seed(context);
  await ready(page);
  const cached = await page.evaluate(async () =>
    (
      await Promise.all(
        (await caches.keys()).map(async (key) =>
          (await (await caches.open(key)).keys()).map((request) => new URL(request.url).pathname),
        ),
      )
    ).flat(),
  );
  expect(cached.some((path) => path.startsWith("/api/") || path.startsWith("/admin"))).toBe(false);
  expect(cached.some((path) => path === "/offline")).toBe(true);
});

test("two independent devices preserve concurrent note edits", async ({
  page,
  context,
  browser,
}) => {
  await register(context);
  const book = await seed(context);
  const initial = await context.request.post("/api/notes", {
    data: { bookId: book.id, page: 1, content: "Original shared note" },
  });
  expect(initial.ok()).toBeTruthy();
  const second = await browser.newContext({
    baseURL: "http://localhost:3110",
    storageState: await context.storageState(),
  });
  try {
    const other = await second.newPage();
    for (const target of [page, other]) {
      await ready(target);
      await target.goto(`/read/${book.id}`);
      await expect(target.locator(".react-pdf__Page__canvas").first()).toBeVisible();
      await openNotes(target);
      await expect(target.getByText("Original shared note", { exact: true })).toBeVisible();
    }
    await setOffline(context, true);
    await setOffline(second, true);
    for (const [target, text] of [
      [page, "First device's offline edit"],
      [other, "Second device's offline edit"],
    ] as const) {
      await target.getByRole("button", { name: "Edit note", exact: true }).click();
      await target.getByRole("textbox", { name: "Edit note", exact: true }).fill(text);
      await target.getByRole("button", { name: "Save", exact: true }).click();
      await expect(target.getByText(text, { exact: true })).toBeVisible();
    }
    await setOffline(context, false);
    const serverNotes = async () =>
      (await (await context.request.get(`/api/notes?bookId=${book.id}`)).json()).notes;
    await expect
      .poll(async () => (await serverNotes())[0]?.content, { timeout: 30000 })
      .toBe("First device's offline edit");
    await setOffline(second, false);
    await expect
      .poll(async () => (await serverNotes())[0]?.conflictCopies, { timeout: 30000 })
      .toContain("Second device's offline edit");
    await expect(
      other.getByText("Edits preserved from another device", { exact: true }),
    ).toBeVisible();
    await other.reload();
    await openNotes(other);
    await other.getByText("Edits preserved from another device", { exact: true }).click();
    await expect(other.getByText("Second device's offline edit", { exact: true })).toBeVisible();
    const noteId = (await serverNotes())[0].id;
    expect((await context.request.delete(`/api/notes/${noteId}`)).ok()).toBeTruthy();
    await expect(other.getByText("First device's offline edit", { exact: true })).toHaveCount(0, {
      timeout: 30000,
    });
    await expect(other.getByText("Shelf synced", { exact: true })).toBeVisible({ timeout: 30000 });
  } finally {
    await second.close();
  }
});

test("account switch never uploads the previous account's offline note", async ({
  page,
  context,
}) => {
  const first = await register(context);
  const book = await seed(context, "First private library");
  await ready(page);
  await page.goto(`/read/${book.id}`);
  await expect(page.locator(".react-pdf__Page__canvas").first()).toBeVisible();
  await openNotes(page);
  await setOffline(context, true);
  await page.getByRole("textbox", { name: /Note for page/ }).fill("Private pending note");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(page.getByText("Private pending note", { exact: true })).toBeVisible();
  // APIRequestContext changes the cookie but cannot access the first device's IndexedDB.
  const second = await register(context);
  expect(second.id).not.toBe(first.id);
  await setOffline(context, false);
  await page.goto("/settings");
  await expect(page.getByText("Downloads (0 books)", { exact: true })).toBeVisible();
  expect((await (await context.request.get("/api/books")).json()).books).toEqual([]);
  expect((await context.request.get(`/api/books/${book.id}/file`)).status()).toBe(404);
  await expect(page.getByText("Private pending note", { exact: true })).toHaveCount(0);
  await context.request.post("/api/auth/login", {
    data: { email: first.email, password: "isolated-test-password-123" },
  });
  await context.addCookies(
    (await context.cookies()).map((cookie) => ({ ...cookie, secure: false })),
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect
    .poll(
      async () =>
        (await (await context.request.get(`/api/notes?bookId=${book.id}`)).json()).notes.some(
          (note: { content: string }) => note.content === "Private pending note",
        ),
      { timeout: 30000 },
    )
    .toBeTruthy();
});

test("EPUB opens from a cold offline launch", async ({ page, context }) => {
  await register(context);
  const files = {
    mimetype: "application/epub+zip",
    "META-INF/container.xml":
      '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    "OEBPS/content.opf":
      '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">offline-fixture</dc:identifier><dc:title>Offline EPUB</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">2026-09-16T00:00:00Z</meta></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine><itemref idref="chapter"/></spine></package>',
    "OEBPS/nav.xhtml":
      '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">Chapter one</a></li></ol></nav></body></html>',
    "OEBPS/chapter.xhtml":
      '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter one</title></head><body><h1>Reading without a connection</h1><p>This EPUB chapter is stored safely on this device.</p></body></html>',
  };
  const buffer = Buffer.from(
    zipSync(
      Object.fromEntries(Object.entries(files).map(([name, content]) => [name, strToU8(content)])),
      { level: 0 },
    ),
  );
  const response = await context.request.post("/api/books", {
    multipart: {
      meta: JSON.stringify({
        title: "Offline EPUB",
        author: "Fixture",
        format: "epub",
        category: "Other",
        tags: [],
        status: "reading",
        totalPages: 0,
        fileName: "fixture.epub",
      }),
      file: { name: "fixture.epub", mimeType: "application/epub+zip", buffer },
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const book = (await response.json()).book;
  await ready(page);
  await page.getByText("Downloads (1 books)", { exact: true }).click();
  await page.getByRole("button", { name: "Download for offline reading" }).click();
  await expect(page.getByRole("button", { name: "Remove download", exact: true })).toBeVisible();
  await setOffline(context, true);
  await page.goto(`/read/${book.id}`);
  await expect(
    page
      .frameLocator(".epub-view iframe")
      .getByText("Reading without a connection", { exact: true }),
  ).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page
      .frameLocator(".epub-view iframe")
      .getByText("This EPUB chapter is stored safely on this device.", { exact: true }),
  ).toBeVisible();
});
