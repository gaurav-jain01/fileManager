import { test, expect } from "@playwright/test";

test("quick to-dos persist, filter by completion and support undo", async ({ page, request }) => {
  const title = `Quick todo ${Date.now()}`;
  let id;
  try {
    await page.goto("/tasks");
    await page.getByRole("textbox", { name: "New to-do", exact: true }).fill(title);
    const created = page.waitForResponse(response => response.url().endsWith("/api/tasks") && response.request().method() === "POST");
    await page.getByRole("textbox", { name: "New to-do", exact: true }).press("Enter");
    const response = await created;
    expect(response.status()).toBe(201);
    id = (await response.json()).task._id;
    await expect(page.getByRole("textbox", { name: "New to-do", exact: true })).toHaveValue("");
    await page.getByLabel("Search tasks", { exact: true }).fill(title);
    await page.getByRole("button", { name: "Active to-dos", exact: true }).click();
    const card = page.locator(".task-card").filter({ hasText: title });
    await expect(card).toBeVisible();
    await card.getByRole("checkbox").check();
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
    await expect(card).toHaveCount(0);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(card.getByRole("checkbox")).not.toBeChecked();
    await expect(card.getByRole("checkbox")).toBeEnabled();
    expect((await (await request.get(`/api/tasks/${id}`)).json()).task.status).toBe("todo");
    await card.getByRole("checkbox").check();
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Completed to-dos", exact: true }).click();
    await expect(card.getByRole("checkbox")).toBeChecked();
    await page.reload();
    await page.getByLabel("Search tasks", { exact: true }).fill(title);
    await expect(card.getByRole("checkbox")).toBeChecked();
    await card.getByRole("checkbox").uncheck();
    await expect(card.getByRole("checkbox")).toBeEnabled();
    expect((await (await request.get(`/api/tasks/${id}`)).json()).task.status).toBe("todo");
  } finally { if (id) await request.delete(`/api/tasks/${id}`); }
});

test("failed to-do creation keeps input and failed completion restores checkbox and count", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const task = { _id: "000000000000000000000001", title: "Keep my plan", description: "", status: "todo", priority: "medium", dueDate: null };
  await page.route("**/api/tasks?*", route => route.fulfill({ json: { tasks: [task], meta: { total: 1, todo: 1, in_progress: 0, done: 0 }, pagination: { page: 1, pages: 1, total: 1, limit: 12 } } }));
  await page.route("**/api/tasks", route => route.fulfill({ status: 503, json: { error: "Could not create to-do" } }));
  let release;
  await page.route(`**/api/tasks/${task._id}`, async route => {
    await new Promise(resolve => { release = resolve; });
    await route.fulfill({ status: 503, json: { error: "Could not save completion" } });
  });
  await page.goto("/tasks");
  await page.getByRole("textbox", { name: "New to-do", exact: true }).fill("Do not lose this");
  await page.getByRole("button", { name: "Add to-do", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Could not create to-do" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "New to-do", exact: true })).toHaveValue("Do not lose this");
  const checkbox = page.getByRole("checkbox", { name: "Mark Keep my plan complete", exact: true });
  await checkbox.check();
  await expect(page.getByText("0 to-dos remaining", { exact: true })).toBeVisible();
  await expect.poll(() => Boolean(release)).toBeTruthy();
  release();
  await expect(page.getByRole("alert").filter({ hasText: "Could not save completion" })).toBeVisible();
  await expect(checkbox).not.toBeChecked();
  await expect(page.getByText("1 to-do remaining", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: "/private/tmp/filevault-todos-mobile.png" });
});
