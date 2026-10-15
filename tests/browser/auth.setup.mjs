import { request } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

export default async function setup(config) {
  if (!process.env.VAULT_TEST_EMAIL || !process.env.VAULT_TEST_PASSWORD) return;
  const baseURL = config.projects[0].use.baseURL;
  const client = await request.newContext({ baseURL });
  try {
    const response = await client.post("/api/auth/login", {
      headers: { Origin: new URL(baseURL).origin },
      data: { email: process.env.VAULT_TEST_EMAIL, password: process.env.VAULT_TEST_PASSWORD },
    });
    if (!response.ok()) throw new Error(`Browser test sign-in failed (${response.status()}). Check the test credentials and server configuration.`);
    await mkdir(".playwright-auth", { recursive: true, mode: 0o700 });
    await writeFile(".playwright-auth/owner.json", JSON.stringify(await client.storageState()), { mode: 0o600 });
  } finally { await client.dispose(); }
}
