import { test, expect } from "@playwright/test";
import { dailyWindow, reportBuckets } from "../../src/lib/daily-todos.mjs";

test.use({ timezoneId: "Asia/Kolkata" });

test("sections make no API calls until opened and reuse recent library/detail results", async ({ page }) => {
  const calls = [];
  const file = { _id: "000000000000000000000011", title: "Lazy note", kind: "note", type: "note", description: "", preview: "Short preview", category: "Notes", tags: [], favorite: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url()); calls.push(url.pathname + url.search);
    if (url.pathname === "/api/files") return route.fulfill({ json: { files: [file], pagination: { page: 1, pages: 1, total: 1, limit: 12 }, ...(url.searchParams.get("meta") !== "0" ? { meta: { total: 1, favorites: 0, notes: 1, uploads: 0, categories: [], tags: [] } } : {}) } });
    if (url.pathname === `/api/files/${file._id}`) return route.fulfill({ json: { file: { ...file, notes: "Full original note for editing" } } });
    if (url.pathname === "/api/chat") return route.fulfill({ json: { mode: "search" } });
    return route.fulfill({ status: 500, json: { error: "Unexpected request" } });
  });
  await page.goto("/");
  await page.waitForTimeout(400);
  expect(calls).toEqual([]);
  await expect(page.getByLabel("Search saved items", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Show library", exact: true }).click();
  const card = page.getByRole("button", { name: "Lazy note", exact: true });
  await expect(card).toBeVisible();
  expect(calls).toHaveLength(1);
  expect(calls[0]).toContain("summary=1");
  expect(calls[0]).toContain("meta=1");
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await page.getByRole("button", { name: "Hide library", exact: true }).click();
  await page.getByRole("button", { name: "Show library", exact: true }).click();
  await expect(card).toBeVisible();
  expect(calls).toHaveLength(1);
  await card.click();
  await expect(page.getByRole("dialog")).toContainText("Full original note for editing");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Edit Lazy note", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Note text" })).toHaveValue("Full original note for editing");
  expect(calls.filter(url => url.includes(file._id))).toHaveLength(1);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const search = page.getByLabel("Search saved items", { exact: true });
  await search.fill("L"); await search.fill("La"); await search.fill("Lazy");
  await expect.poll(() => calls.filter(url => url.startsWith("/api/files?")).length).toBe(2);
  expect(calls.at(-1)).toContain("meta=0");
  await expect(card).toBeVisible();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(card).toBeVisible();
  expect(calls.filter(url => url.startsWith("/api/files?"))).toHaveLength(2);
  await page.getByRole("button", { name: "Refresh library", exact: true }).click();
  await expect.poll(() => calls.filter(url => url.startsWith("/api/files?")).length).toBe(3);
  expect(calls.at(-1)).toContain("meta=1");
  await page.getByRole("button", { name: "Ask assistant", exact: true }).click();
  await expect(page.getByText("Search mode · Your saved information")).toBeVisible();
  await page.getByRole("button", { name: "Close assistant" }).click();
  await page.getByRole("button", { name: "Ask assistant", exact: true }).click();
  await expect(page.getByText("Search mode · Your saved information")).toBeVisible();
  expect(calls.filter(url => url === "/api/chat")).toHaveLength(1);
  await page.getByRole("button", { name: "Close assistant" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: "/private/tmp/filevault-library-on-demand.png", fullPage: true });
});

test("daily lists defer charts, cache date views and do not reload after completion", async ({ page }) => {
  const calls = [];
  const timeZone = "Asia/Kolkata";
  const window = dailyWindow(timeZone);
  const todo = { _id: "000000000000000000000012", title: "Fewer calls", done: false, closesAt: window.closesAt.toISOString() };
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/daily-todos**", async route => {
    const url = new URL(route.request().url());
    calls.push({ method: route.request().method(), mode: url.searchParams.get("mode") });
    if (route.request().method() === "PATCH") { todo.done = true; return route.fulfill({ json: { todo } }); }
    return route.fulfill({ json: { today: window.day, day: url.searchParams.get("day"), closesAt: window.closesAt.toISOString(), todos: [todo], summary: { total: 1, done: Number(todo.done) }, buckets: url.searchParams.get("mode") === "none" ? [] : reportBuckets(window.day, url.searchParams.get("mode")), pagination: { page: 1, pages: 1, total: 1 } } });
  });
  await page.goto("/");
  await page.getByRole("link", { name: "Daily to-do", exact: true }).click();
  const checkbox = page.getByRole("checkbox", { name: "Complete daily task: Fewer calls" });
  await expect(checkbox).toBeEnabled();
  expect(calls).toEqual([{ method: "GET", mode: "none" }]);
  await checkbox.check();
  await expect(checkbox).toBeEnabled();
  expect(calls).toHaveLength(2);
  await page.getByRole("button", { name: "Hide to-dos", exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByRole("link", { name: "Daily to-do", exact: true }).click();
  await expect(checkbox).toBeChecked();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(100);
  expect(calls).toHaveLength(2);
  await page.getByRole("button", { name: "Weekly", exact: true }).click();
  await expect(page.getByLabel("Weekly task completion chart")).toBeVisible();
  expect(calls).toHaveLength(3);
});

test("summary API omits full notes and metadata while detail API preserves original content", async ({ request }) => {
  let id;
  try {
    const notes = "🙂 Full text ".repeat(100);
    const response = await request.post("/api/files", { data: { kind: "note", title: `Summary test ${Date.now()}`, notes } });
    expect(response.status()).toBe(201);
    const file = (await response.json()).file; id = file._id;
    const result = await (await request.get(`/api/files?summary=1&meta=0&search=${encodeURIComponent(file.title)}`)).json();
    expect(result).not.toHaveProperty("meta");
    expect(result.files[0]).not.toHaveProperty("notes");
    expect(result.files[0]).not.toHaveProperty("uploadData");
    expect([...result.files[0].preview]).toHaveLength(220);
    expect((await (await request.get(`/api/files/${id}`)).json()).file.notes).toBe(notes);
  } finally { if (id) await request.delete(`/api/files/${id}`); }
});

test("daily API returns an accurate checklist without history until requested", async ({ request }) => {
  const timeZone = "Asia/Kolkata";
  const day = dailyWindow(timeZone).day;
  let id;
  try {
    const created = await request.post("/api/daily-todos", { data: { title: `Loading check ${Date.now()}`, day, timeZone } });
    expect(created.status()).toBe(201);
    id = (await created.json()).todo._id;
    const update = await request.patch(`/api/daily-todos/${id}`, { data: { done: true } });
    expect(update.status()).toBe(200);
    const params = new URLSearchParams({ day, timeZone, mode: "none", page: "100000" });
    const list = await (await request.get(`/api/daily-todos?${params}`)).json();
    expect(list.buckets).toEqual([]);
    expect(list.summary.done).toBeGreaterThanOrEqual(1);
    expect(list.summary.total).toBe(list.pagination.total);
    expect(list.todos.find(todo => todo._id === id).done).toBe(true);
    params.set("mode", "weekly");
    const history = await (await request.get(`/api/daily-todos?${params}`)).json();
    expect(history.buckets).toHaveLength(8);
    expect(history.buckets.at(-1).done).toBeGreaterThanOrEqual(1);
  } finally { if (id) await request.delete(`/api/daily-todos/${id}`); }
});
