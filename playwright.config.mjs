import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: process.env.VAULT_TEST_URL || "http://localhost:3000", browserName: "chromium", channel: process.env.PLAYWRIGHT_CHANNEL || undefined, headless: true },
  reporter: "list",
});
