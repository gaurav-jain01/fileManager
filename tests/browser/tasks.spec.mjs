import { test, expect } from "@playwright/test";

test("task UI persists edits, status, search, deadlines and deletion", async ({ page, request }) => {
  const title = `Task check ${Date.now()}`;
  let id;
  try {
    await page.goto("/");
    await page.getByRole("link", { name: "Tasks", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Tasks." })).toBeVisible();
    await page.getByRole("button", { name: "New task", exact: true }).click();
    await page.getByLabel("Task title").fill(title);
    await page.getByLabel("Description", { exact: true }).fill("Finish the project plan.");
    await page.getByLabel("Priority", { exact: true }).selectOption("high");
    await page.getByLabel("Due date", { exact: true }).fill("2020-01-01");
    const saved = page.waitForResponse(response => response.url().endsWith("/api/tasks") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Save task", exact: true }).click();
    const response = await saved;
    expect(response.status()).toBe(201);
    id = (await response.json()).task._id;
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.getByLabel("Search tasks", { exact: true }).fill(title);
    const card = page.locator(".task-card").filter({ hasText: title });
    await expect(card).toContainText("Overdue");
    await page.screenshot({ path: "/private/tmp/filevault-tasks.png" });
    await card.getByLabel(`Status for ${title}`).selectOption("in_progress");
    await expect(card.getByLabel(`Status for ${title}`)).toHaveValue("in_progress");
    await expect(page.getByText("Loading tasks…")).not.toBeVisible();
    await card.getByRole("checkbox").click();
    await expect(card.getByRole("checkbox")).toBeChecked();
    await expect(card).not.toContainText("Overdue");
    await expect(card.getByRole("checkbox")).toBeEnabled();
    await page.reload();
    await page.getByLabel("Search tasks", { exact: true }).fill(title);
    await expect(card.getByRole("checkbox")).toBeChecked();
    await card.getByRole("checkbox").click();
    await expect(card.getByLabel(`Status for ${title}`)).toHaveValue("todo");
    await card.getByRole("button", { name: `Edit ${title}`, exact: true }).click();
    await page.getByLabel("Description", { exact: true }).fill("Updated project plan.");
    await page.getByLabel("Due date", { exact: true }).fill("");
    await page.getByRole("button", { name: "Save task", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(card).toContainText("Updated project plan.");
    expect((await (await request.get(`/api/tasks/${id}`)).json()).task.dueDate).toBeNull();
    await page.getByLabel("Filter task status").selectOption("done");
    await expect(page.getByText("No matching tasks", { exact: true })).toBeVisible();
    await page.getByLabel("Filter task status").selectOption("todo");
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: `Delete ${title}`, exact: true }).click();
    await page.getByRole("button", { name: "Keep task", exact: true }).click();
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: `Delete ${title}`, exact: true }).click();
    await page.getByRole("button", { name: "Delete task", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(card).toHaveCount(0);
    expect((await request.get(`/api/tasks/${id}`)).status()).toBe(404);
    id = null;
  } finally { if (id) await request.delete(`/api/tasks/${id}`); }
});

test("task API rejects invalid data and safely handles missing IDs", async ({ request }) => {
  for (const data of [{ title: " " }, { title: "Bad", status: "unknown" }, { title: "Bad", dueDate: "2026-02-30" }]) {
    expect((await request.post("/api/tasks", { data })).status()).toBe(400);
  }
  for (const method of ["get", "patch", "delete"]) expect((await request[method]("/api/tasks/invalid", { data: { status: "done" } })).status()).toBe(404);
  expect((await request.patch("/api/tasks/000000000000000000000000", { data: { $set: { status: "done" } } })).status()).toBe(400);
  expect((await request.patch("/api/tasks/000000000000000000000000", { data: { status: "done" } })).status()).toBe(404);
  const response = await request.get("/api/tasks?page=999999&limit=1");
  expect(response.ok()).toBeTruthy();
  const result = await response.json();
  expect(result.pagination.page).toBe(result.pagination.pages);
});

test("mobile task page recovers from load and save failures without losing input", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let failLoad = true;
  await page.route("**/api/tasks?*", route => route.fulfill({ status: failLoad ? 503 : 200, json: failLoad ? { error: "Database unavailable" } : { tasks: [], meta: { total: 0, todo: 0, in_progress: 0, done: 0 }, pagination: { page: 1, pages: 1, total: 0, limit: 12 } } }));
  await page.route("**/api/tasks", route => route.fulfill({ status: 503, json: { error: "Could not save task" } }));
  await page.goto("/tasks");
  await expect(page.getByRole("alert").filter({ hasText: "Database unavailable" })).toBeVisible();
  failLoad = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Start with your next step", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await page.getByLabel("Task title").fill("Keep this draft");
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Could not save task");
  await expect(page.getByLabel("Task title")).toHaveValue("Keep this draft");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: "/private/tmp/filevault-task-mobile.png" });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("link", { name: "All files", exact: true })).toBeVisible();
});
