import { test, expect } from "@playwright/test";

test("note editor persists formatted text, supports search and reopens via source link", async ({ page, request }) => {
  const title = `Notepad check ${Date.now()}`;
  let id;
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "New note", exact: true }).click();
    await page.getByLabel("Note title", { exact: true }).fill(title);
    await page.getByRole("textbox", { name: "Note text" }).fill("Planning notes\n\nConfirmed deadline: Friday.");
    await page.getByRole("textbox", { name: "Note text" }).press("ControlOrMeta+A");
    await page.getByRole("button", { name: "Bold", exact: true }).click();
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.getByRole("region", { name: "Note preview" })).toContainText("Confirmed deadline");
    const saved = page.waitForResponse(response => response.url().endsWith("/api/files") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Save note", exact: true }).click();
    const result = await saved;
    expect(result.status()).toBe(201);
    id = (await result.json()).file._id;
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.goto(`/?item=${id}`);
    await expect(page.getByRole("dialog")).toContainText("Confirmed deadline");
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Note text" })).toHaveValue(/\*\*Planning notes/);
    await page.getByRole("textbox", { name: "Note text" }).fill("## Updated plan\n\nShip on Monday.");
    await page.getByRole("button", { name: "Save note", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    const search = await request.get("/api/files?kind=note&search=Ship%20on%20Monday");
    expect((await search.json()).files.some(file => file._id === id)).toBeTruthy();
    const reopened = await request.get(`/api/files/${id}`);
    expect((await reopened.json()).file.notes).toBe("## Updated plan\n\nShip on Monday.");
  } finally { if (id) await request.delete(`/api/files/${id}`); }
});

test("upload UI stores original bytes in Cloudinary, downloads them and removes stored data", async ({ page, request }) => {
  test.setTimeout(90000);
  const filename = `upload-check-${Date.now()}.txt`;
  const title = `Searchable project report ${Date.now()}`;
  const bytes = Buffer.from("Database upload round trip\nUnicode: नमस्ते\n");
  let id;
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Upload files", exact: true }).click();
    await page.getByLabel("Upload title", { exact: true }).fill(title);
    await page.getByLabel("Choose files to upload").setInputFiles({ name: filename, mimeType: "text/plain", buffer: bytes });
    await expect(page.getByLabel(`Title for ${filename}`, { exact: true })).toHaveValue(title);
    const saved = page.waitForResponse(response => response.url().endsWith("/api/uploads"));
    await page.getByRole("button", { name: "Upload selected files" }).click();
    const response = await saved;
    expect(response.status()).toBe(201);
    const data = await response.json(); id = data.file._id;
    expect(data.file.title).toBe(title);
    expect(data.file.filename).toBe(filename);
    expect(data.file.storage).toBe("cloudinary");
    expect(data.file).not.toHaveProperty("uploadData");
    await expect(page.getByText("Saved to Cloudinary", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.reload();
    await page.getByRole("button", { name: /^Uploads/ }).click();
    await page.getByLabel("Search saved items", { exact: true }).fill(title);
    await expect(page.getByRole("button", { name: title, exact: true })).toBeVisible();
    const search = await request.get(`/api/files?kind=upload&search=${encodeURIComponent(title.toLowerCase())}`);
    expect((await search.json()).files.some(file => file._id === id)).toBeTruthy();
    await page.goto(`/?item=${id}`);
    await expect(page.getByRole("dialog")).toContainText(filename);
    await expect(page.getByRole("region", { name: "File preview" })).toContainText("Database upload round trip");
    const preview = await request.get(`/api/files/${id}/preview`);
    expect(preview.status()).toBe(200); expect(await preview.body()).toEqual(bytes);
    expect(preview.headers()["content-disposition"]).toContain("inline;");
    expect(preview.headers()["content-type"]).toBe("text/plain; charset=utf-8");
    await expect(page.getByRole("link", { name: "Download", exact: true })).toHaveAttribute("href", `/api/files/${id}/download`);
    const download = await request.get(`/api/files/${id}/download`);
    expect(download.status()).toBe(200); expect(await download.body()).toEqual(bytes);
    expect(download.headers()["content-disposition"]).toContain("attachment;");
    expect(download.headers()["x-content-type-options"]).toBe("nosniff");
    expect((await (await request.get(`/api/files/${id}`)).json()).file).not.toHaveProperty("uploadData");
    expect((await request.put(`/api/files/${id}`, { data: { kind: "link", url: "https://example.com" } })).status()).toBe(400);
    await request.delete(`/api/files/${id}`);
    expect((await request.get(`/api/files/${id}/download`)).status()).toBe(404);
    expect((await request.get(`/api/files/${id}/preview`)).status()).toBe(404);
    id = null;
  } finally { if (id) await request.delete(`/api/files/${id}`); }
});

test("upload limits and forged uploads are rejected without database writes", async ({ request }) => {
  expect((await request.post("/api/files", { data: { kind: "upload", title: "Forged", uploadData: "fake" } })).status()).toBe(400);
  expect((await request.post("/api/uploads", { multipart: { file: { name: "too-large.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(10 * 1024 * 1024 + 1) } } })).status()).toBe(413);
  expect((await request.post("/api/files", { data: { kind: "note", title: "Empty", notes: "" } })).status()).toBe(400);
});

test("mobile editor and upload picker fit the screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Note text" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: "/private/tmp/filevault-note-editor.png" });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Upload files", exact: true }).click();
  await expect(page.getByRole("button", { name: /Drop files here/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: "/private/tmp/filevault-upload.png" });
});
