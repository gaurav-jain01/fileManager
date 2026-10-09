import { test, expect } from "@playwright/test";
import nextEnv from "@next/env";
import mongoose from "mongoose";
import { dailyWindow, dateInZone, reportBuckets, shiftDay, weekStart } from "../../src/lib/daily-todos.mjs";

test.use({ timezoneId: "Asia/Kolkata" });
const timeZone = "Asia/Kolkata";
let database;
const fixtureIds = [];
test.afterAll(async () => {
  if (database) {
    if (fixtureIds.length) await database.collection("daily_todos").deleteMany({ _id: { $in: fixtureIds } });
    await database.close();
  }
});

test("daily checklist persists, edits, completes and reports real history by day and week", async ({ page, request }) => {
  nextEnv.loadEnvConfig(process.cwd());
  database = await mongoose.createConnection(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 }).asPromise();
  const today = dailyWindow(timeZone).day;
  const previous = shiftDay(today, -1);
  const title = `Daily focus ${Date.now()}`;
  const pastTitle = `Yesterday unfinished ${Date.now()}`;
  const historical = [false, true].map(done => ({ _id: new mongoose.Types.ObjectId(), title: done ? `${pastTitle} done` : pastTitle, day: previous, timeZone, closesAt: new Date(`${today}T00:00:00Z`), done, completedAt: done ? new Date(`${previous}T12:00:00Z`) : null, createdAt: new Date(`${previous}T00:00:00Z`), updatedAt: new Date(`${previous}T12:00:00Z`) }));
  // Use a definitely closed deadline regardless of the time this test runs.
  historical.forEach(item => { item.closesAt = new Date(`${previous}T18:30:00Z`); fixtureIds.push(item._id); });
  await database.collection("daily_todos").insertMany(historical);
  const ids = [];
  try {
    await page.goto("/");
    await page.getByRole("link", { name: "Daily to-do", exact: true }).click();
    const section = page.getByRole("region", { name: "Daily to-do list." });
    const input = section.getByRole("textbox", { name: "New daily to-do" });
    await expect(input).toBeEnabled();
    await input.fill(title);
    const created = page.waitForResponse(response => response.url().endsWith("/api/daily-todos") && response.request().method() === "POST");
    await input.press("Enter");
    const result = await created;
    expect(result.status()).toBe(201);
    const todo = (await result.json()).todo;
    ids.push(todo._id);
    expect(todo.day).toBe(today);
    expect(["Asia/Calcutta", "Asia/Kolkata"]).toContain(todo.timeZone);
    const row = section.locator(".daily-row").filter({ hasText: title });
    await expect(row).toBeVisible();
    await row.getByRole("checkbox").check();
    await expect(row.getByRole("checkbox")).toBeChecked();
    await expect(row.getByRole("checkbox")).toBeEnabled();
    await page.reload();
    await page.getByRole("link", { name: "Daily to-do", exact: true }).click();
    await expect(row.getByRole("checkbox")).toBeChecked();
    await row.getByRole("button", { name: `Edit daily task: ${title}`, exact: true }).click();
    await section.getByLabel("Edit daily task title").fill(`${title} updated`);
    await section.getByRole("button", { name: "Save", exact: true }).click();
    await expect(row).toContainText(`${title} updated`);
    await row.getByRole("checkbox").uncheck();
    await expect(row.getByRole("checkbox")).not.toBeChecked();
    await expect(row.getByRole("checkbox")).toBeEnabled();
    await section.getByLabel("To-do date").fill(previous);
    const past = section.locator(".daily-row").filter({ hasText: pastTitle }).first();
    await expect(past.getByRole("checkbox")).toBeDisabled();
    await expect(section.getByRole("textbox", { name: "New daily to-do" })).toHaveCount(0);
    const report = await (await request.get(`/api/daily-todos?${new URLSearchParams({ day: previous, timeZone, mode: "weekly" })}`)).json();
    expect(report.summary.total).toBeGreaterThanOrEqual(2);
    const week = report.buckets.find(bucket => bucket.day === weekStart(previous));
    expect(week.done).toBeGreaterThanOrEqual(1);
    expect(week.remaining).toBeGreaterThanOrEqual(1);
    await section.getByRole("button", { name: "Weekly", exact: true }).click();
    await expect(section.getByLabel("Weekly task completion chart")).toBeVisible();
    expect(await section.locator(".daily-chart-column").count()).toBe(8);
    const copied = page.waitForResponse(response => response.url().endsWith("/api/daily-todos") && response.request().method() === "POST");
    await past.getByRole("button", { name: "Add to today" }).click();
    ids.push((await (await copied).json()).todo._id);
    await expect(section.getByRole("status").filter({ hasText: "original stays in your history" })).toBeVisible();
    await section.getByRole("button", { name: "Today", exact: true }).click();
    await expect(section.locator(".daily-row").filter({ hasText: pastTitle })).toBeVisible();
    await page.screenshot({ path: "/private/tmp/filevault-daily-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("link", { name: "Daily to-do", exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: "/private/tmp/filevault-daily-mobile.png", fullPage: true });
    await row.getByRole("button", { name: `Remove daily task: ${title} updated`, exact: true }).click();
    await row.getByRole("button", { name: "Yes", exact: true }).click();
    await expect(row).toHaveCount(0);
    expect((await request.patch(`/api/daily-todos/${historical[0]._id}`, { data: { done: true } })).status()).toBe(409);
    expect((await request.delete(`/api/daily-todos/${historical[0]._id}`)).status()).toBe(409);
    expect((await request.post("/api/daily-todos", { data: { title: "Backdate", timeZone, day: previous } })).status()).toBe(409);
    expect((await request.get("/api/daily-todos?timeZone=Invalid%2FZone")).status()).toBe(400);
  } finally {
    for (const id of ids) await database.collection("daily_todos").deleteOne({ _id: new mongoose.Types.ObjectId(id) });
  }
});

test("failed saves keep typed daily tasks and roll back checkbox progress", async ({ page }) => {
  const window = dailyWindow(timeZone);
  const todo = { _id: "000000000000000000000002", title: "Keep my checkbox", done: false, closesAt: window.closesAt.toISOString() };
  await page.route("**/api/daily-todos?*", route => route.fulfill({ json: { day: window.day, today: window.day, closesAt: window.closesAt.toISOString(), todos: [todo], summary: { total: 1, done: 0 }, buckets: reportBuckets(window.day, "daily", [{ _id: window.day, total: 1, done: 0 }]), pagination: { page: 1, pages: 1, total: 1 } } }));
  await page.route(`**/api/daily-todos/${todo._id}`, route => route.fulfill({ status: 503, json: { error: "Completion save unavailable" } }));
  await page.route("**/api/daily-todos", route => route.fulfill({ status: 503, json: { error: "Daily save unavailable" } }));
  await page.goto("/");
  await page.getByRole("link", { name: "Daily to-do", exact: true }).click();
  const input = page.getByRole("textbox", { name: "New daily to-do" });
  await expect(input).toBeEnabled();
  await input.fill("Keep this plan");
  await input.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "Daily save unavailable" })).toBeVisible();
  await expect(input).toHaveValue("Keep this plan");
  await expect(input).toBeEnabled();
  await page.getByRole("checkbox", { name: "Complete daily task: Keep my checkbox" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Completion save unavailable" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Complete daily task: Keep my checkbox" })).not.toBeChecked();
  await expect(page.getByRole("progressbar", { name: "Day completion" })).toHaveAttribute("aria-valuenow", "0");
});

test("an open daily list rolls over at local midnight and preserves the previous day", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-07T18:29:59Z") });
  const task = { _id: "000000000000000000000001", title: "Yesterday's plan", done: false, closesAt: "2026-10-07T18:30:00Z" };
  await page.route("**/api/daily-todos?*", async route => {
    const params = new URL(route.request().url()).searchParams;
    const day = params.get("day");
    const today = dateInZone(timeZone, new Date(await page.evaluate(() => Date.now())));
    const rows = [{ _id: "2026-10-07", total: 1, done: 0 }];
    await route.fulfill({ json: { day, today, closesAt: `${today}T18:30:00Z`, todos: day === "2026-10-07" ? [task] : [], summary: { total: day === "2026-10-07" ? 1 : 0, done: 0 }, buckets: reportBuckets(day, params.get("mode"), rows), pagination: { page: 1, pages: 1, total: day === "2026-10-07" ? 1 : 0 } } });
  });
  await page.goto("/");
  await page.getByRole("link", { name: "Daily to-do", exact: true }).click();
  const date = page.getByLabel("To-do date");
  await expect(date).toHaveValue("2026-10-07");
  await expect(page.getByText("Yesterday's plan", { exact: true })).toBeVisible();
  await page.clock.fastForward(2000);
  await expect(date).toHaveValue("2026-10-08");
  await expect(page.getByText("Yesterday's plan", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Add your first task for today above.")).toBeVisible();
  await page.getByRole("button", { name: "Previous day", exact: true }).click();
  await expect(page.getByText("Yesterday's plan", { exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Complete daily task: Yesterday's plan" })).toBeDisabled();
});
