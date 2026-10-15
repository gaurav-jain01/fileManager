import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, validPasswordHash, normalizeEmail, validEmail, createSessionToken, digest, safeReturnPath, sameOriginMutation } from "../src/lib/auth-crypto.mjs";

test("passwords use unique salted hashes, preserve spaces, and reject invalid input", async () => {
  const password = "  a long private passphrase  ";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.ok(validPasswordHash(first));
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword(password.trim(), first), false);
  assert.equal(await verifyPassword("wrong password", first), false);
  assert.equal(await verifyPassword(password, "malformed"), false);
  assert.equal(await verifyPassword({}, first), false);
  for (const shortPassword of ["a", "short"]) {
    assert.equal(await verifyPassword(shortPassword, await hashPassword(shortPassword)), true);
  }
  await assert.rejects(hashPassword(""));
  await assert.rejects(hashPassword("a".repeat(129)));
  assert.equal(normalizeEmail(" OWNER@Example.com "), "owner@example.com");
  assert.ok(validEmail("owner@example.com"));
  assert.equal(validEmail("bad\n@example.com"), false);
});

test("session tokens have 256 random bits and distinct non-reversible storage keys", () => {
  const first = createSessionToken();
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, createSessionToken());
  assert.notEqual(digest(first), first);
  assert.equal(digest(first), digest(first));
});

test("post-login redirects remain inside the workspace", () => {
  assert.equal(safeReturnPath("/tasks?status=todo"), "/tasks?status=todo");
  assert.equal(safeReturnPath("/?item=123"), "/?item=123");
  for (const input of ["https://evil.example", "//evil.example", "/\\evil.example", "/login", "/api/files", ["/tasks"], "/%2fevil.example", "/tasks\n"]) {
    assert.equal(safeReturnPath(input), "/");
  }
});

test("mutations require a matching Origin and reject cross-site requests", () => {
  const make = (headers = {}, method = "POST") => new Request("https://vault.example/api/files", { method, headers });
  assert.equal(sameOriginMutation(make({ origin: "https://vault.example" })), true);
  assert.equal(sameOriginMutation(make({ origin: "https://attacker.example" })), false);
  assert.equal(sameOriginMutation(make({ origin: "null" })), false);
  assert.equal(sameOriginMutation(make()), false);
  assert.equal(sameOriginMutation(make({ origin: "https://vault.example", "sec-fetch-site": "cross-site" })), false);
  assert.equal(sameOriginMutation(make({}, "GET")), true);
});
