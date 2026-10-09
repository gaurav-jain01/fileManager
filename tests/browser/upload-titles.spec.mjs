import { test, expect } from "@playwright/test";

test("batch uploads keep separate titles and retry only failed files", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/files?*", route => route.fulfill({ json: { files: [], meta: { total: 0, favorites: 0, categories: [], tags: [] }, pagination: { page: 1, pages: 1, total: 0, limit: 12 } } }));
  const uploads = [];
  await page.route("**/api/uploads", async route => {
    const form = await new Response(route.request().postDataBuffer(), { headers: { "Content-Type": route.request().headers()["content-type"] } }).formData();
    uploads.push({ filename: form.get("file").name, title: form.get("title") });
    await route.fulfill(uploads.length === 2 ? { status: 503, json: { error: "Please retry this file" } } : { status: 201, json: { file: { _id: String(uploads.length), title: form.get("title") } } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Upload files", exact: true }).click();
  await expect(page.getByLabel("Upload title", { exact: true })).toBeVisible();
  await page.getByLabel("Choose files to upload").setInputFiles([
    { name: "first.txt", mimeType: "text/plain", buffer: Buffer.from("first") },
    { name: "second.txt", mimeType: "text/plain", buffer: Buffer.from("second") },
  ]);
  await expect(page.getByLabel("Title for first.txt", { exact: true })).toHaveValue("first.txt");
  await page.getByLabel("Upload title", { exact: true }).fill("Shared report");
  await expect(page.getByLabel("Title for second.txt", { exact: true })).toHaveValue("Shared report");
  await page.getByLabel("Title for first.txt", { exact: true }).fill("Personal title");
  await page.getByLabel("Upload title", { exact: true }).fill("Updated shared report");
  await expect(page.getByLabel("Title for first.txt", { exact: true })).toHaveValue("Personal title");
  await expect(page.getByLabel("Title for second.txt", { exact: true })).toHaveValue("Updated shared report");
  await page.getByLabel("Title for first.txt", { exact: true }).fill("   ");
  await page.getByRole("button", { name: "Upload selected files" }).click();
  await expect(page.getByText("Enter a title for this file.")).toBeVisible();
  expect(uploads).toHaveLength(0);
  await page.getByLabel("Title for first.txt", { exact: true }).fill("Meeting report");
  await page.getByLabel("Title for second.txt", { exact: true }).fill("Project notes");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: "/private/tmp/filevault-upload-titles.png" });
  await page.getByRole("button", { name: "Upload selected files" }).click();
  await expect(page.getByText("Please retry this file")).toBeVisible();
  await expect(page.getByLabel("Title for first.txt", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Title for second.txt", { exact: true })).toHaveValue("Project notes");
  await page.getByLabel("Title for second.txt", { exact: true }).fill("Updated project notes");
  await page.getByRole("button", { name: "Retry failed uploads" }).click();
  await expect(page.getByRole("button", { name: "Done", exact: true })).toBeEnabled();
  expect(uploads).toEqual([
    { filename: "first.txt", title: "Meeting report" },
    { filename: "second.txt", title: "Project notes" },
    { filename: "second.txt", title: "Updated project notes" },
  ]);
});
