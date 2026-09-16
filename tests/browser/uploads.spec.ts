import { test, expect } from "@playwright/test";

test("resumable uploads enforce ownership, offsets, completion, and quota", async ({ context }) => {
  const registration = await context.request.post("/api/auth/register", {
    headers: { "X-Real-IP": `test-${crypto.randomUUID()}` },
    data: {
      email: `upload-${crypto.randomUUID()}@example.test`,
      password: "upload-tests-password-123",
      displayName: "Upload test",
    },
  });
  const user = (await registration.json()).user;
  const headers = { "X-Shelf-User": user.id, "Tus-Resumable": "1.0.0" };
  const id = crypto.randomUUID(),
    revision = crypto.randomUUID(),
    timestamp = new Date().toISOString();
  const payload = {
    id,
    format: "pdf",
    title: "Resumable",
    author: "",
    description: "",
    category: "Other",
    tags: [],
    status: "want-to-read",
    coverId: null,
    coverKind: "none",
    fileId: id,
    fileName: "test.pdf",
    fileSize: 10,
    totalPages: 1,
    currentPage: 1,
    currentCfi: null,
    progress: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: null,
    finishedAt: null,
    fileSource: "hosted",
    fileRevision: revision,
    coverRevision: "legacy",
    readingPositions: {},
  };
  const doc = {
    id: `book|${id}`,
    key: id,
    type: "book",
    bookId: "",
    payload: JSON.stringify(payload),
    _deleted: false,
  };
  const synced = await context.request.post("/api/sync", {
    data: { version: 1, userId: user.id, action: "push", writes: [{ newDocumentState: doc }] },
  });
  expect(synced.ok(), await synced.text()).toBeTruthy();
  const metadata = (rev: string) =>
    Object.entries({ bookId: id, kind: "file", revision: rev })
      .map(([key, value]) => `${key} ${Buffer.from(value).toString("base64")}`)
      .join(",");
  const created = await context.request.post("/api/uploads", {
    headers: { ...headers, "Upload-Length": "10", "Upload-Metadata": metadata(revision) },
  });
  expect(created.status(), await created.text()).toBe(201);
  const url = created.headers().location;
  expect(url).toBeTruthy();
  const patch = (offset: number, data: string) =>
    context.request.patch(url, {
      headers: {
        ...headers,
        "Content-Type": "application/offset+octet-stream",
        "Upload-Offset": String(offset),
      },
      data: Buffer.from(data),
    });
  expect((await patch(0, "1234")).status()).toBe(204);
  expect((await context.request.head(url, { headers })).headers()["upload-offset"]).toBe("4");
  expect((await patch(0, "1234")).status()).toBe(409);
  expect((await context.request.post(`${url}/complete`, { headers })).status()).toBe(409);
  expect(
    (
      await context.request.head(url, {
        headers: { ...headers, "X-Shelf-User": crypto.randomUUID() },
      })
    ).status(),
  ).toBe(401);
  const lookup = await context.request.get(
    `/api/sync/assets?bookId=${id}&kind=file&revision=${revision}`,
    { headers },
  );
  expect((await lookup.json()).upload.url).toBe(new URL(url, "http://localhost:3110").pathname);
  expect((await patch(4, "567890")).status()).toBe(204);
  expect((await context.request.post(`${url}/complete`, { headers })).status()).toBe(200);
  expect((await context.request.post(`${url}/complete`, { headers })).status()).toBe(200);
  expect(await (await context.request.get(`/api/books/${id}/file`)).text()).toBe("1234567890");
  const next = crypto.randomUUID();
  const pull = await context.request.post("/api/sync", {
    data: { version: 1, userId: user.id, action: "pull" },
  });
  const current = (await pull.json()).documents.find((item: { id: string }) => item.id === doc.id);
  const oversized = {
    ...current,
    payload: JSON.stringify({
      ...JSON.parse(current.payload),
      fileRevision: next,
      fileSize: 52428801,
    }),
  };
  expect(
    (
      await context.request.post("/api/sync", {
        data: {
          version: 1,
          userId: user.id,
          action: "push",
          writes: [{ assumedMasterState: current, newDocumentState: oversized }],
        },
      })
    ).ok(),
  ).toBeTruthy();
  const rejected = await context.request.post("/api/uploads", {
    headers: { ...headers, "Upload-Length": "52428801", "Upload-Metadata": metadata(next) },
  });
  expect(rejected.status(), await rejected.text()).toBe(413);
});
