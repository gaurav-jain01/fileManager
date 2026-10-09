import { test, expect } from "@playwright/test";

const sample = { _id: "aaaaaaaaaaaaaaaaaaaaaaaa", title: "Research notes", description: "Conference submission information", url: "https://example.com/research", type: "google_doc", category: "Research", tags: ["research", "conference"], notes: "Deadline: March 15", favorite: false, createdAt: "2026-09-29T03:53:58.686Z", updatedAt: "2026-09-29T03:53:58.686Z" };
async function mockVault(page, initial = [sample]) {
  let files = structuredClone(initial);
  let failSave = false;
  await page.route("**/api/files**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" || request.method() === "PUT") {
      if (failSave) return route.fulfill({ status: 503, json: { error: "Save failed. Please retry." } });
      const body = request.postDataJSON();
      if (request.method() === "POST") files.push({ ...sample, ...body, _id: "bbbbbbbbbbbbbbbbbbbbbbbb" });
      else files = files.map(f => f._id === url.pathname.split("/").pop() ? { ...f, ...body } : f);
      return route.fulfill({ json: { file: body } });
    }
    if (request.method() === "DELETE") { files = files.filter(f => f._id !== url.pathname.split("/").pop()); return route.fulfill({ json: { message: "Deleted" } }); }
    let selected = files.filter(f => (!url.searchParams.get("search") || f.title.toLowerCase().includes(url.searchParams.get("search").toLowerCase())) && (url.searchParams.get("favorite") !== "true" || f.favorite));
    const categoryNames = [...new Set(files.map(f => f.category))];
    return route.fulfill({ json: { files: selected, pagination: { page: 1, pages: 1, total: selected.length, limit: 12 }, meta: { total: files.length, favorites: files.filter(f => f.favorite).length, categories: categoryNames.map(name => ({ name, count: files.filter(f => f.category === name).length })), tags: ["research", "conference"] } } });
  });
  return { failSave: value => { failSave = value; } };
}

test("real vault and chatbot return stored information; invalid writes are rejected", async ({ request }) => {
  const response = await request.get("/api/files?limit=2");
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  expect(data.files.length).toBeLessThanOrEqual(2);
  expect(data.meta.total).toBeGreaterThan(0);
  const chat = await request.post("/api/chat", { data: { message: "How many items are saved in my vault?" } });
  expect(chat.ok()).toBeTruthy();
  const answer = await chat.json();
  expect(answer.answer).toContain(String(data.meta.total));
  expect(answer.sources.every(source => /^https?:|^\/\?item=|^\/api\/files\//.test(source.url))).toBeTruthy();
  expect((await request.post("/api/chat", { data: { message: "" } })).status()).toBe(400);
  expect((await request.post("/api/files", { data: { title: "Invalid", url: "javascript:alert(1)" } })).status()).toBe(400);
  expect((await request.put("/api/files/not-an-id", { data: { favorite: true } })).status()).toBe(404);
});

test("create, favorite, edit, recover from failed save, and delete", async ({ page }) => {
  const mock = await mockVault(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Research notes", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByRole("textbox", { name: "Link *", exact: true }).fill("https://example.com/new");
  await page.getByLabel("Title", { exact: false }).fill("New resource");
  mock.failSave(true);
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Save failed");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Title", { exact: false })).toHaveValue("New resource");
  mock.failSave(false);
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "New resource", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add New resource to favorites", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remove New resource from favorites", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit New resource", exact: true }).click();
  await page.getByLabel("Title", { exact: false }).fill("Edited resource");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("button", { name: "Edited resource", exact: true }).click();
  await page.getByRole("button", { name: "Delete item", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("original linked file");
  await page.getByRole("button", { name: "Delete item", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edited resource", exact: true })).not.toBeVisible();
});

test("filters reset and keyboard search works", async ({ page }) => {
  await mockVault(page);
  await page.goto("/");
  await page.getByRole("button", { name: /^Favorites/ }).click();
  await expect(page.getByText("Nothing here just yet")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Research notes", exact: true })).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("textbox", { name: "Search saved items" })).toBeFocused();
  await page.getByRole("textbox", { name: "Search saved items" }).fill("not-found");
  await expect(page.getByText("Nothing here just yet")).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page.getByRole("button", { name: "Research notes", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "List view" }).click();
  await expect(page.locator(".file-list .file-card")).toHaveCount(1);
});

test("chat returns sources, preserves conversation, and retries failures", async ({ page }) => {
  await mockVault(page);
  let fail = false;
  await page.route("**/api/chat", route => route.request().method() === "GET" ? route.fulfill({ json: { mode: "search" } }) : fail ? route.fulfill({ status: 503, json: { error: "Try again shortly." } }) : route.fulfill({ json: { answer: "Your saved deadline is March 15.", sources: [{ id: sample._id, title: sample.title, url: sample.url }], mode: "search" } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Ask assistant", exact: true }).click();
  await page.getByRole("textbox", { name: "Ask about your saved items" }).fill("Research deadline?");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.getByRole("log")).toContainText("March 15");
  await expect(page.getByRole("log").getByRole("link", { name: /Research notes/ })).toHaveAttribute("href", sample.url);
  await page.getByRole("button", { name: "Close assistant" }).click();
  await page.getByRole("button", { name: "Ask assistant", exact: true }).click();
  await expect(page.getByRole("log")).toContainText("March 15");
  fail = true;
  await page.getByRole("textbox", { name: "Ask about your saved items" }).fill("More details?");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.getByRole("log").getByRole("alert")).toContainText("Try again");
  await expect(page.getByRole("textbox", { name: "Ask about your saved items" })).toHaveValue("More details?");
  fail = false;
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.getByRole("log").getByRole("alert")).not.toBeVisible();
});

test("desktop and mobile layouts have no horizontal overflow", async ({ page }) => {
  await mockVault(page, [{ ...sample, favorite: true }]);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.locator(".file-card").first()).toBeVisible();
  await page.screenshot({ path: "/private/tmp/filevault-desktop.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.getByRole("button", { name: "Ask assistant", exact: true }).click();
  await page.screenshot({ path: "/private/tmp/filevault-chat.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("textbox", { name: "Ask about your saved items" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.getByRole("button", { name: "Close assistant" }).click();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("button", { name: /^Favorites/ })).toBeVisible();
  await page.getByRole("button", { name: /^Favorites/ }).click();
  await expect(page.getByRole("heading", { name: "Your favorites." })).toBeVisible();
  await expect(page.locator(".sidebar")).toBeHidden();
  await expect(page.locator(".skeleton-card")).toHaveCount(0);
  await expect(page.locator(".file-card").first()).toBeVisible();
  await page.screenshot({ path: "/private/tmp/filevault-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  expect(errors).toEqual([]);
});
