import { test, expect } from "@playwright/test";

const id = "aaaaaaaaaaaaaaaaaaaaaaaa";
const baseFile = { _id: id, kind: "upload", title: "Uploaded report", filename: "report.txt", type: "other", category: "Uploads", size: 40, tags: [], createdAt: "2026-01-01", updatedAt: "2026-01-01" };

async function mockUpload(page, changes = {}) {
  const file = { ...baseFile, ...changes };
  await page.route("**/api/files?*", route => route.fulfill({ json: { files: [file], meta: { total: 1, favorites: 0, uploads: 1, categories: [], tags: [] }, pagination: { page: 1, pages: 1, total: 1, limit: 12 } } }));
  await page.route(`**/api/files/${id}`, route => route.fulfill({ json: { file } }));
}

test("View opens text in grid and list layouts without a download, including mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockUpload(page, { filename: "report.html" });
  const downloads = [];
  page.on("download", download => downloads.push(download));
  await page.route(`**/api/files/${id}/preview`, route => route.fulfill({ contentType: "text/plain", body: '<script>window.uploadExecuted = true</script>\nProject report: नमस्ते' }));
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: /^Uploads/ }).click();
  for (const list of [false, true]) {
    if (list) await page.getByRole("button", { name: "List view", exact: true }).click();
    await page.getByRole("button", { name: "View Uploaded report", exact: true }).click();
    await expect(page.getByRole("region", { name: "File preview" })).toContainText("Project report: नमस्ते");
    expect(await page.evaluate(() => window.uploadExecuted)).toBeUndefined();
    await expect(page.getByRole("link", { name: "Download", exact: true })).toHaveAttribute("href", `/api/files/${id}/download`);
    expect(await page.locator("dialog").evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth)).toBeTruthy();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.getByRole("button", { name: "Close dialog" }).click();
  }
  expect(downloads).toHaveLength(0);
});

test("preview failures can be retried and large text previews are bounded", async ({ page }) => {
  await mockUpload(page);
  let available = false;
  await page.route(`**/api/files/${id}/preview`, route => {
    return route.fulfill(!available ? { status: 503, json: { error: "Preview temporarily unavailable" } } : { contentType: "text/plain", body: "A".repeat(200001) });
  });
  await page.goto(`/?item=${id}`);
  await expect(page.getByRole("region", { name: "File preview" }).getByRole("alert")).toContainText("Preview temporarily unavailable");
  available = true;
  await page.getByRole("button", { name: "Retry preview" }).click();
  await expect(page.getByRole("region", { name: "File preview" })).toContainText("Showing the first 200,000 characters");
  await expect(page.locator(".upload-preview pre")).toHaveText("A".repeat(200000));
});

test("unsupported uploads explain the fallback without requesting file bytes", async ({ page }) => {
  await mockUpload(page, { filename: "archive.zip" });
  let requests = 0;
  await page.route(`**/api/files/${id}/preview`, route => { requests++; return route.abort(); });
  await page.goto(`/?item=${id}`);
  await expect(page.getByRole("region", { name: "File preview" })).toContainText("Preview is not available for this file type");
  await expect(page.getByRole("link", { name: "Download", exact: true })).toBeVisible();
  expect(requests).toBe(0);
});

test("image previews render the stored image", async ({ page }) => {
  await mockUpload(page, { filename: "photo.png", type: "image" });
  await page.route(`**/api/files/${id}/preview`, route => route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0N8AAAAASUVORK5CYII=", "base64") }));
  await page.goto(`/?item=${id}`);
  const image = page.getByRole("img", { name: "photo.png" });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(image => image.naturalWidth)).toBe(1);
});

test("Office previews explain conversion progress and allow retry after a conversion error", async ({ page }) => {
  await mockUpload(page, { filename: "slides.pptx" });
  let respond;
  const ready = new Promise(resolve => { respond = resolve; });
  await page.route(`**/api/files/${id}/preview`, async route => {
    await ready;
    await route.fulfill({ status: 422, json: { error: "This document could not be previewed. Check that it is not damaged or password-protected." } });
  });
  await page.goto(`/?item=${id}`);
  await expect(page.getByRole("status")).toContainText("Preparing PDF preview");
  await expect.poll(() => typeof respond).toBe("function");
  respond();
  await expect(page.getByRole("region", { name: "File preview" }).getByRole("alert")).toContainText("password-protected");
  await expect(page.getByRole("button", { name: "Retry preview" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download", exact: true })).toHaveAttribute("href", `/api/files/${id}/download`);
});
