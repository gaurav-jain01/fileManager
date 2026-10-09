import test from "node:test";
import assert from "node:assert/strict";
import { createRequestCache } from "../src/lib/request-cache.mjs";

test("request cache deduplicates in-flight reads, expires and bounds memory", async () => {
  let time = 0, calls = 0;
  const cache = createRequestCache({ ttl: 60, maxEntries: 2, now: () => time });
  const loader = async () => ++calls;
  assert.deepEqual(await Promise.all([cache.read("a", loader), cache.read("a", loader)]), [1, 1]);
  time = 59; assert.equal(await cache.read("a", loader), 1);
  time = 60; assert.equal(await cache.read("a", loader), 2);
  await cache.read("b", loader); await cache.read("c", loader);
  assert.equal(await cache.read("a", loader), 5);
});

test("invalidation prevents older requests from restoring stale entries, and failures are retried", async () => {
  const cache = createRequestCache();
  let resolveOld;
  const old = cache.read("a", () => new Promise(resolve => { resolveOld = resolve; }));
  await Promise.resolve();
  cache.clear();
  assert.equal(await cache.read("a", () => "new"), "new");
  resolveOld("old"); await old;
  assert.equal(await cache.read("a", () => "wrong"), "new");
  await assert.rejects(cache.read("error", () => { throw new Error("offline"); }));
  assert.equal(await cache.read("error", () => "retry"), "retry");
});
