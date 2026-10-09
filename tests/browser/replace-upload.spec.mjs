import { test, expect } from "@playwright/test";

test("replacement overwrites stored bytes, preserves details, and refreshes previews and the library", async ({ page, request }) => {
  test.setTimeout(120000);
  const title = `Replace upload check ${Date.now()}`;
  const oldBytes = Buffer.from("Old file content");
  const newBytes = Buffer.from("Replacement file content नमस्ते");
  let id;
  try {
    const created = await request.post("/api/uploads", { multipart: { title, category: "Replacement checks", tags: "keep-tag", notes: "Keep my notes", file: { name: "old.png", mimeType: "image/png", buffer: oldBytes } } });
    expect(created.status()).toBe(201);
    const original = (await created.json()).file; id = original._id;
    await request.put(`/api/files/${id}`, { data: { favorite: true } });
    await page.goto(`/?item=${id}`);
    await page.getByRole("button", { name: "Replace file", exact: true }).click();
    await expect(page.getByRole("button", { name: "Replace file", exact: true })).toBeDisabled();
    await page.getByLabel("Replacement file", { exact: true }).setInputFiles({ name: "new.txt", mimeType: "text/plain", buffer: newBytes });
    const replaced = page.waitForResponse(response => response.url().endsWith(`/api/files/${id}/replace`));
    await page.getByRole("button", { name: "Replace file", exact: true }).click();
    const response = await replaced;
    expect(response.status()).toBe(200);
    const file = (await response.json()).file;
    expect(file).toMatchObject({ _id: id, filename: "new.txt", size: newBytes.length, type: "other", title, category: "Replacement checks", tags: ["keep-tag"], notes: "Keep my notes", favorite: true, createdAt: original.createdAt });
    expect(file).not.toHaveProperty("uploadData");
    await expect(page.getByRole("region", { name: "File preview" })).toContainText("Replacement file content नमस्ते");
    await expect(page.getByRole("dialog")).not.toContainText("old.png");
    const download = await request.get(`/api/files/${id}/download`);
    expect(await download.body()).toEqual(newBytes);
    expect(download.headers()["content-disposition"]).toContain("new.txt");
    expect(await (await request.get(`/api/files/${id}/preview`)).body()).toEqual(newBytes);
    // Replace again with the same filename to catch stale detail/preview caches.
    await page.getByRole("button", { name: "Replace file", exact: true }).click();
    await page.getByLabel("Replacement file", { exact: true }).setInputFiles({ name: "new.txt", mimeType: "text/plain", buffer: Buffer.from("Latest revision") });
    await page.getByRole("button", { name: "Replace file", exact: true }).click();
    await expect(page.getByRole("region", { name: "File preview" })).toContainText("Latest revision");
    await page.getByRole("button", { name: "Close dialog" }).click();
    await page.getByRole("button", { name: /^Uploads/ }).click();
    await page.getByLabel("Search saved items", { exact: true }).fill(title);
    await expect(page.locator(".file-card")).toHaveCount(1);
    await expect(page.locator(".file-card")).toContainText("new.txt");
    await page.getByRole("button", { name: title, exact: true }).click();
    await expect(page.getByRole("region", { name: "File preview" })).toContainText("Latest revision");
    const search = await request.get(`/api/files?kind=upload&search=${encodeURIComponent(title)}`);
    expect((await search.json()).files).toHaveLength(1);
  } finally { if (id) await request.delete(`/api/files/${id}`); }
});

test("invalid replacements leave the original intact and cannot replace a note or missing item", async ({ request }) => {
  test.setTimeout(90000);
  const bytes = Buffer.from("Keep this original");
  let id, noteId;
  try {
    const created = await request.post("/api/uploads", { multipart: { file: { name: "original.txt", mimeType: "text/plain", buffer: bytes } } });
    expect(created.status()).toBe(201); id = (await created.json()).file._id;
    expect((await request.put(`/api/files/${id}/replace`, { multipart: { file: { name: "oversized.txt", mimeType: "text/plain", buffer: Buffer.alloc(10 * 1024 * 1024 + 1) } } })).status()).toBe(413);
    expect((await request.put(`/api/files/${id}/replace`, { multipart: { title: "No file" } })).status()).toBe(400);
    expect((await request.put(`/api/files/${id}/replace`, { data: { uploadData: "forged" } })).status()).toBe(400);
    expect(await (await request.get(`/api/files/${id}/download`)).body()).toEqual(bytes);
    expect((await (await request.get(`/api/files/${id}`)).json()).file.filename).toBe("original.txt");
    const note = await request.post("/api/files", { data: { kind: "note", title: "Replacement guard", notes: "Keep this note" } });
    expect(note.status()).toBe(201); noteId = (await note.json()).file._id;
    const replacement = { multipart: { file: { name: "new.txt", mimeType: "text/plain", buffer: Buffer.from("new") } } };
    expect((await request.put(`/api/files/${noteId}/replace`, replacement)).status()).toBe(404);
    expect((await (await request.get(`/api/files/${noteId}`)).json()).file.notes).toBe("Keep this note");
    await request.delete(`/api/files/${id}`);
    expect((await request.put(`/api/files/${id}/replace`, replacement)).status()).toBe(404);
    expect((await request.put("/api/files/invalid/replace", replacement)).status()).toBe(404);
  } finally {
    if (id) await request.delete(`/api/files/${id}`);
    if (noteId) await request.delete(`/api/files/${noteId}`);
  }
});

test("mobile replacement supports cancel, size validation, failure, and retry", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = "bbbbbbbbbbbbbbbbbbbbbbbb";
  const file = { _id: id, kind: "upload", title: "Saved upload", filename: "old.txt", size: 3, type: "other", category: "Uploads", tags: [], createdAt: "2026-01-01", updatedAt: "2026-01-01" };
  await page.route(`**/api/files/${id}`, route => route.fulfill({ json: { file } }));
  await page.route(`**/api/files/${id}/preview`, route => route.fulfill({ contentType: "text/plain", body: "Original" }));
  let attempts = 0;
  await page.route(`**/api/files/${id}/replace`, route => {
    attempts++;
    return route.fulfill(attempts === 1 ? { status: 503, json: { error: "Could not replace file. Please retry." } } : { json: { file: { ...file, filename: "replacement.txt" } } });
  });
  await page.goto(`/?item=${id}`);
  await page.getByRole("button", { name: "Replace file", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("old.txt");
  expect(attempts).toBe(0);
  await page.getByRole("button", { name: "Replace file", exact: true }).click();
  await page.getByLabel("Replacement file", { exact: true }).setInputFiles({ name: "large.txt", mimeType: "text/plain", buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("10 MB");
  await expect(page.getByRole("button", { name: "Replace file", exact: true })).toBeDisabled();
  await page.getByLabel("Replacement file", { exact: true }).setInputFiles({ name: "replacement.txt", mimeType: "text/plain", buffer: Buffer.from("New file") });
  await page.getByRole("button", { name: "Replace file", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Please retry");
  await expect(page.getByRole("dialog")).toContainText("New file: replacement.txt");
  expect(await page.locator("dialog").evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth)).toBeTruthy();
  await page.getByRole("button", { name: "Replace file", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("replacement.txt");
  expect(attempts).toBe(2);
});
