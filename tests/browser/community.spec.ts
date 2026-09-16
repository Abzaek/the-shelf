import { test, expect, type BrowserContext } from "@playwright/test";
async function account(context: BrowserContext, email: string) {
  const password = "isolated-community-password-123";
  let response = await context.request.post("/api/auth/register", {
    headers: { "X-Real-IP": `test-${crypto.randomUUID()}` },
    data: { email, password, displayName: "Private account name" },
  });
  if (response.status() === 409)
    response = await context.request.post("/api/auth/login", {
      headers: { "X-Real-IP": `test-${crypto.randomUUID()}` },
      data: { email, password },
    });
  expect(response.ok(), await response.text()).toBeTruthy();
  await context.addCookies(
    (await context.cookies()).map((cookie) => ({ ...cookie, secure: false })),
  );
  return (await response.json()).user;
}
test("community pilot: invitation, consent, spoilers, replies, reports and moderation", async ({
  page,
  context,
  browser,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8),
    email = `pilot-${suffix}@example.test`;
  const reader = await account(context, email);
  await page.goto("/community");
  await expect(page.getByText("A small circle, to start")).toBeVisible();
  const hostContext = await browser.newContext({ baseURL: "http://localhost:3110" });
  try {
    const host = await account(hostContext, "community-host@example.test");
    const hostPage = await hostContext.newPage();
    await hostPage.goto("/community");
    await hostPage.getByRole("button", { name: "Pilot desk", exact: true }).click();
    await hostPage.getByLabel("Account email").fill(email);
    await hostPage.getByRole("button", { name: "Enable invitation" }).click();
    await expect(hostPage.getByText(email, { exact: true })).toBeVisible();
    await hostPage.getByLabel("Room name", { exact: true }).fill(`Pilot room ${suffix}`);
    await hostPage.getByLabel("Book title", { exact: true }).fill("A book we chose together");
    await hostPage.getByLabel("Book author", { exact: true }).fill("A public author");
    await hostPage.getByLabel("Opening prompt").fill("Which idea stayed with you?");
    const roomResponse = hostPage.waitForResponse(
      (response) =>
        response.url().endsWith("/api/community") &&
        response.request().method() === "POST" &&
        response.request().postDataJSON().action === "room",
    );
    await hostPage.getByRole("button", { name: "Create room", exact: true }).click();
    expect((await roomResponse).ok()).toBeTruthy();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Take a seat" })).toBeVisible();
    await page.getByLabel("Community name", { exact: true }).fill(`Reader ${suffix}`);
    await expect(page.getByRole("button", { name: "Join the pilot", exact: true })).toBeDisabled();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Join the pilot", exact: true }).click();
    await page.getByRole("button", { name: new RegExp(`Pilot room ${suffix}`) }).click();
    await page.getByLabel("Discussion title", { exact: true }).fill(`A question ${suffix}`);
    await page.getByLabel("Your thoughts", { exact: true }).fill("A spoiler about the ending");
    await page.getByLabel("Contains spoilers", { exact: true }).check();
    await page.getByRole("button", { name: "Publish discussion", exact: true }).click();
    await expect(
      page.getByRole("button", { name: `A question ${suffix}`, exact: true }),
    ).toBeVisible();
    await expect(page.getByText("A spoiler about the ending", { exact: true })).toBeHidden();
    await page.getByText("Reveal spoiler", { exact: true }).click();
    await expect(page.getByText("A spoiler about the ending", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `/tmp/shelf-community-${browser.browserType().name()}-${page.viewportSize()?.width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: /Open discussion/ }).click();
    await page.getByLabel("Your reply", { exact: true }).fill("A follow-up thought");
    await page.getByRole("button", { name: "Publish reply", exact: true }).click();
    await expect(page.getByText("A follow-up thought", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/thread=/);
    await page.getByRole("link", { name: "Community", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Book rooms", exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.getByText("A follow-up thought", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("A follow-up thought", { exact: true })).toBeVisible();
    // Moderator reads through membership-controlled API, without joining under a personal profile.
    const home = await (
      await hostContext.request.get("/api/community", { headers: { "X-Shelf-User": host.id } })
    ).json();
    const room = home.rooms.find(
      (item: { title: string }) => item.title === `Pilot room ${suffix}`,
    );
    const roomData = await (
      await hostContext.request.get(`/api/community?view=discussion&roomId=${room.id}`, {
        headers: { "X-Shelf-User": host.id },
      })
    ).json();
    const root = roomData.posts[0];
    // Use a distinct member to report the thread, then review via the real moderator UI.
    const other = await browser.newContext({ baseURL: "http://localhost:3110" });
    try {
      const peer = await account(other, `peer-${suffix}@example.test`);
      for (const [client, user, body] of [
        [hostContext, host, { action: "invite", email: peer.email }],
        [other, peer, { action: "join", alias: `Peer ${suffix}`, acceptRules: true }],
        [other, peer, { action: "report", id: root.id, reason: `Review ${suffix}` }],
      ] as const) {
        const response = await client.request.post("/api/community", {
          headers: { "X-Shelf-User": user.id },
          data: body,
        });
        expect(response.ok(), await response.text()).toBeTruthy();
      }
      await hostPage.reload();
      await hostPage.getByRole("button", { name: "Pilot desk", exact: true }).click();
      const report = hostPage.locator("article").filter({ hasText: `Review ${suffix}` });
      await expect(report).toBeVisible();
      await report.getByRole("button", { name: "Hide reported post", exact: true }).click();
      await expect(report.getByRole("button", { name: "Restore post", exact: true })).toBeVisible();
      const hidden = await context.request.get(
        `/api/community?view=discussion&threadId=${root.id}`,
        { headers: { "X-Shelf-User": reader.id } },
      );
      expect(hidden.status()).toBe(404);
      await page.goto("/community");
      await page.getByRole("button", { name: new RegExp(`Pilot room ${suffix}`) }).click();
      await expect(
        page.getByRole("button", { name: `A question ${suffix}`, exact: true }),
      ).toHaveCount(0);
      // An offline navigation to community stays community, rather than displaying the personal shelf.
      await page.goto("/settings");
      await expect(page.getByText("Offline app is ready.", { exact: false })).toBeVisible({
        timeout: 60000,
      });
      if (browser.browserType().name() === "webkit")
        await context.request.post("/__test/network", {
          data: { id: crypto.randomUUID(), offline: true },
        });
      else await context.setOffline(true);
      await page.goto("/community", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "The reading room" })).toBeVisible();
      await expect(page.getByText(/Community needs a connection/)).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBeTruthy();
    } finally {
      await other.close();
    }
  } finally {
    await hostContext.close();
  }
});
