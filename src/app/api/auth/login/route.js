import { authJson, consumeLoginAttempt, createSession, ownerConfig } from "@/lib/auth";
import { normalizeEmail, verifyPassword, sameOriginMutation } from "@/lib/auth-crypto.mjs";
import { readJson } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(request) {
  if (!sameOriginMutation(request)) return authJson({ error: "This request must come from your FileVault app." }, 403);
  const owner = ownerConfig();
  if (!owner) return authJson({ error: "Sign-in is not configured. Run npm run auth:setup on the server, then restart FileVault." }, 503);
  try {
    const body = await readJson(request, 4096);
    if (!body || typeof body.email !== "string" || body.email.length > 254 || typeof body.password !== "string" || !body.password || body.password.length > 128) {
      return authJson({ error: "Enter your email and password." }, 400);
    }
    const attempt = await consumeLoginAttempt();
    if (!attempt.allowed) return authJson({ error: "Too many sign-in attempts. Please try again in a few minutes." }, 429, { "Retry-After": String(attempt.retryAfter) });
    // Always verify the password, including for an incorrect email.
    const matches = await verifyPassword(body.password, owner.passwordHash);
    if (!matches || normalizeEmail(body.email) !== owner.email) return authJson({ error: "Email or password is incorrect." }, 401);
    await createSession(owner);
    return authJson({ ok: true });
  } catch (error) {
    if (error instanceof SyntaxError) return authJson({ error: "Enter a valid email and password." }, 400);
    return authJson({ error: "Sign-in is temporarily unavailable. Please try again." }, 503);
  }
}
