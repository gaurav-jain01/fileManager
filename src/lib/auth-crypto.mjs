import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);
const options = { N: 65536, r: 8, p: 2, maxmem: 128 * 1024 * 1024 };
export const SESSION_SECONDS = 60 * 60 * 24 * 7;

export function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function validEmail(value) {
  return typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function validPasswordHash(value) {
  return typeof value === "string" && /^scrypt-v1:[a-f0-9]{32}:[a-f0-9]{128}$/.test(value);
}

export async function hashPassword(password) {
  if (typeof password !== "string" || password.length < 1 || password.length > 128) {
    throw new Error("Choose a password between 1 and 128 characters.");
  }
  const salt = randomBytes(16).toString("hex");
  const hash = await derive(password, salt, 64, options);
  return `scrypt-v1:${salt}:${hash.toString("hex")}`;
}

export async function verifyPassword(password, encoded) {
  if (typeof password !== "string" || password.length > 128 || !validPasswordHash(encoded)) return false;
  const [, salt, expected] = encoded.split(":");
  const actual = await derive(password, salt, 64, options);
  return timingSafeEqual(actual, Buffer.from(expected, "hex"));
}

export function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function createSessionToken() {
  return randomBytes(32).toString("hex");
}

export function safeReturnPath(value) {
  if (typeof value !== "string" || /[\\\r\n]/.test(value)) return "/";
  // Only the two workspace pages can be a login destination.
  if (!/^(\/|\/tasks)(\?.*)?$/.test(value)) return "/";
  return value;
}

export function sameOriginMutation(request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  const origin = request.headers.get("origin");
  // Browser mutations must be same-origin. Non-browser clients should send Origin too.
  return origin === new URL(request.url).origin && request.headers.get("sec-fetch-site") !== "cross-site";
}
