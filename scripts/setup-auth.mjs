import { readFile, writeFile, rename, chmod, unlink } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { hashPassword, normalizeEmail, validEmail } from "../src/lib/auth-crypto.mjs";

// Run locally: no credentials in command arguments, logs, or shell history.
if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error("Run npm run auth:setup in an interactive terminal.");
  process.exit(1);
}

const envPath = fileURLToPath(new URL("../.env.local", import.meta.url));
const temporaryPath = `${envPath}.auth-${process.pid}`;
let muted = false;
const output = new Writable({ write(chunk, encoding, callback) { if (!muted) process.stdout.write(chunk, encoding); callback(); } });
const prompt = createInterface({ input: process.stdin, output, terminal: true });
prompt.on("SIGINT", () => { muted = false; prompt.close(); process.stdout.write("\nSetup cancelled.\n"); process.exit(130); });

async function secret(label) {
  process.stdout.write(label);
  muted = true;
  try { return await prompt.question(""); }
  finally { muted = false; process.stdout.write("\n"); }
}

try {
  let env = await readFile(envPath, "utf8").catch(error => { if (error.code === "ENOENT") return ""; throw error; });
  console.log("Configure the owner of this private FileVault workspace.");
  if (/^AUTH_(EMAIL|PASSWORD_HASH)=.+/m.test(env)) console.log("This replaces the owner credentials and invalidates existing sessions after restart.");
  const email = normalizeEmail(await prompt.question("Email address: "));
  if (!validEmail(email)) throw new Error("Enter a valid email address.");
  const password = await secret("Password (1–128 characters, hidden): ");
  const confirmation = await secret("Confirm password (hidden): ");
  if (password !== confirmation) throw new Error("Passwords do not match. Nothing was changed.");
  const hash = await hashPassword(password);
  for (const [key, value] of Object.entries({ AUTH_EMAIL: email, AUTH_PASSWORD_HASH: hash })) {
    // Escape $ because Next.js expands it in dotenv values, even inside quotes.
    const line = `${key}=${JSON.stringify(value).replaceAll("$", "\\$")}`;
    const pattern = new RegExp(`^(?:export\\s+)?${key}\\s*=.*$`, "gm");
    if (pattern.test(env)) env = env.replace(pattern, () => line);
    else env = `${env.trimEnd()}\n${line}\n`;
  }
  await writeFile(temporaryPath, env, { mode: 0o600, flag: "wx" });
  await rename(temporaryPath, envPath);
  await chmod(envPath, 0o600);
  console.log("Owner account configured. Restart FileVault, then sign in with your email and password.");
  console.log("For hosted deployments, copy AUTH_EMAIL and AUTH_PASSWORD_HASH from .env.local into the server's environment settings. Use HTTPS.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  prompt.close();
  await unlink(temporaryPath).catch(() => {});
}
