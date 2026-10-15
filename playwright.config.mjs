import { defineConfig } from "@playwright/test";
const baseURL = process.env.VAULT_TEST_URL || "http://localhost:3000";
export default defineConfig({
  globalSetup: "./tests/browser/auth.setup.mjs",
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  use: { baseURL, browserName: "chromium", channel: process.env.PLAYWRIGHT_CHANNEL || undefined, headless: true,
    extraHTTPHeaders: { Origin: new URL(baseURL).origin },
    storageState: process.env.VAULT_TEST_EMAIL && process.env.VAULT_TEST_PASSWORD ? ".playwright-auth/owner.json" : undefined,
  },
  reporter: "list",
});
