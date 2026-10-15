import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import connectDB from "@/lib/mongodb";
import AuthSession from "@/models/AuthSession";
import AuthAttempt from "@/models/AuthAttempt";
import { createSessionToken, digest, normalizeEmail, validEmail, validPasswordHash, sameOriginMutation, safeReturnPath, SESSION_SECONDS } from "./auth-crypto.mjs";

export const COOKIE_NAME = process.env.NODE_ENV === "production" ? "__Host-filevault-session" : "filevault-session";
export const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" };

export function ownerConfig() {
  const email = normalizeEmail(process.env.AUTH_EMAIL);
  const passwordHash = process.env.AUTH_PASSWORD_HASH;
  if (!validEmail(email) || !validPasswordHash(passwordHash)) return null;
  return { email, passwordHash, version: digest(`${email}:${passwordHash}`) };
}

export const getSession = cache(async () => {
  const owner = ownerConfig();
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!owner || !token || !/^[a-f0-9]{64}$/.test(token)) return null;
  await connectDB();
  // Check expiry explicitly: MongoDB's TTL cleanup is asynchronous.
  const session = await AuthSession.findOne({ _id: digest(token), credentialVersion: owner.version, expiresAt: { $gt: new Date() } }).lean();
  return session ? { email: owner.email } : null;
});

export async function requirePageSession(returnPath) {
  if (!await getSession()) redirect(`/login?next=${encodeURIComponent(safeReturnPath(returnPath))}`);
}

export function authJson(data, status = 200, extraHeaders = {}) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store", ...extraHeaders } });
}

export function withAuth(handler) {
  return async (request, context) => {
    try {
      if (!await getSession()) return authJson({ error: "Please sign in to access your workspace." }, 401);
      if (!sameOriginMutation(request)) return authJson({ error: "This request must come from your FileVault app." }, 403);
      const response = await handler(request, context);
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    } catch {
      return authJson({ error: "Could not verify your session. Please try again." }, 503);
    }
  };
}

export async function createSession(owner) {
  await connectDB();
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);
  await AuthSession.create({ _id: digest(token), credentialVersion: owner.version, expiresAt });
  (await cookies()).set(COOKIE_NAME, token, { ...cookieOptions, expires: expiresAt, maxAge: SESSION_SECONDS });
}

export async function deleteSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    await connectDB();
    await AuthSession.deleteOne({ _id: digest(token) });
  }
  jar.set(COOKIE_NAME, "", { ...cookieOptions, maxAge: 0 });
}

export async function consumeLoginAttempt() {
  await connectDB();
  const windowMs = 15 * 60 * 1000;
  const window = Math.floor(Date.now() / windowMs);
  const expiresAt = new Date((window + 1) * windowMs);
  // A single owner-wide bucket cannot be bypassed with forged IP/email headers.
  const filter = { _id: `owner:${window}` };
  let attempt;
  try {
    attempt = await AuthAttempt.findOneAndUpdate(filter, { $inc: { count: 1 }, $setOnInsert: { expiresAt } }, { upsert: true, returnDocument: "after" }).lean();
  } catch (error) {
    if (error.code !== 11000) throw error;
    attempt = await AuthAttempt.findOneAndUpdate(filter, { $inc: { count: 1 } }, { returnDocument: "after" }).lean();
  }
  return { allowed: attempt.count <= 10, retryAfter: Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000)) };
}
