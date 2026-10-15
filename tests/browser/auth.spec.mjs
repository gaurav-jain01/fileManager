import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("private pages redirect and every workspace endpoint rejects anonymous access", async ({ page, request }) => {
  await page.goto("/?item=000000000000000000000001");
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(new URL(page.url()).searchParams.get("next")).toBe("/?item=000000000000000000000001");
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
  await page.goto("/tasks");
  await expect(page).toHaveURL(/\/login\?next=%2Ftasks/);
  const id = "000000000000000000000001";
  const routes = [
    ["GET", "/api/files"], ["POST", "/api/files"], ["GET", "/api/files/categories"], ["GET", "/api/files/tags"],
    ...["GET", "PUT", "DELETE"].map(method => [method, `/api/files/${id}`]),
    ["GET", `/api/files/${id}/download`], ["GET", `/api/files/${id}/preview`], ["PUT", `/api/files/${id}/replace`],
    ["POST", "/api/uploads"], ["POST", "/api/note-images"], ["GET", "/api/chat"], ["POST", "/api/chat"],
    ["GET", "/api/tasks"], ["POST", "/api/tasks"], ...["GET", "PATCH", "DELETE"].map(method => [method, `/api/tasks/${id}`]),
    ["GET", "/api/daily-todos"], ["POST", "/api/daily-todos"], ["PATCH", `/api/daily-todos/${id}`], ["DELETE", `/api/daily-todos/${id}`],
  ];
  for (const [method, url] of routes) {
    const response = await request.fetch(url, { method });
    expect(response.status(), `${method} ${url}`).toBe(401);
    expect(response.headers()["cache-control"]).toContain("no-store");
  }
});

test("forged cookies and cross-origin sign-in cannot grant access", async ({ request }) => {
  const forged = await request.get("/api/files", { headers: { Cookie: "filevault-session=forged; __Host-filevault-session=forged" } });
  expect(forged.status()).toBe(401);
  const crossOrigin = await request.post("/api/auth/login", { headers: { Origin: "https://attacker.example" }, data: { email: "owner@example.com", password: "not the password" } });
  expect(crossOrigin.status()).toBe(403);
});

test("owner can sign in, reload, use protected data, and revoke the session on sign-out", async ({ page, context, request, baseURL }) => {
  test.skip(!process.env.VAULT_TEST_EMAIL || !process.env.VAULT_TEST_PASSWORD, "Set VAULT_TEST_EMAIL and VAULT_TEST_PASSWORD to test owner sign-in.");
  await page.goto("/login?next=%2Ftasks");
  await page.getByLabel("Email address").fill(process.env.VAULT_TEST_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill("deliberately incorrect password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText("Email or password is incorrect.");
  await page.getByLabel("Password", { exact: true }).fill(process.env.VAULT_TEST_PASSWORD);
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password" }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/tasks$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tasks.", exact: true })).toBeVisible();
  const cookie = (await context.cookies()).find(cookie => cookie.name.includes("filevault-session"));
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe("Lax");
  const cookieHeader = `${cookie.name}=${cookie.value}`;
  expect((await request.get("/api/files", { headers: { Cookie: cookieHeader } })).status()).toBe(200);
  expect((await request.post("/api/tasks", { headers: { Cookie: cookieHeader, Origin: "https://attacker.example" }, data: { title: "must never be created" } })).status()).toBe(403);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(`${baseURL}/login`);
  expect((await request.get("/api/files", { headers: { Cookie: cookieHeader } })).status()).toBe(401);
  await page.goto("/tasks");
  await expect(page).toHaveURL(/\/login\?next=/);
});

test("sign-in fits a mobile screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
