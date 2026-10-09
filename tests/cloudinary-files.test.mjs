import test from "node:test";
import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { createHash } from "node:crypto";
import { fileStorageConfig, newFileAsset, uploadCloudinaryFile, readCloudinaryFile, destroyCloudinaryFile, readStoredUpload } from "../src/lib/cloudinary-files.mjs";

const config = { cloud_name: "test-cloud", api_key: "test-key", api_secret: "test-secret", asset_folder: "filevault/uploads", secure: true };
const bytes = Buffer.from("Original document bytes\nनमस्ते");

test("file storage uses separate folders and authenticated raw uploads with original bytes", async () => {
  assert.throws(() => fileStorageConfig({}), { status: 503 });
  assert.equal(fileStorageConfig({ CLOUDINARY_CLOUD_NAME: "cloud", CLOUDINARY_API_KEY: "key", CLOUDINARY_API_SECRET: "secret", CLOUDINARY_FOLDER: "notes" }).asset_folder, "filevault/uploads");
  const asset = newFileAsset("report.PDF", config);
  let options, uploaded;
  const result = await uploadCloudinaryFile(bytes, asset, config, { upload_stream(settings, callback) {
    options = settings;
    return new Writable({ write(chunk, encoding, done) { uploaded = chunk; done(); }, final(done) {
      callback(null, { public_id: asset.publicId, asset_id: "asset", bytes: bytes.length, resource_type: "raw", type: "authenticated", secure_url: `https://res.cloudinary.com/test-cloud/raw/authenticated/v1/${asset.publicId}` }); done();
    } });
  } });
  assert.deepEqual(uploaded, bytes);
  assert.equal(options.type, "authenticated"); assert.equal(options.resource_type, "raw");
  assert.equal(options.overwrite, false); assert.equal(options.backup, false);
  assert.match(asset.publicId, /^filevault\/uploads\/[a-f\d-]+\.pdf$/);
  assert.equal(result.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(result.assetId, "asset");
});

test("reads use server-signed URLs and verify file length and checksum", async () => {
  const asset = { ...newFileAsset("sheet.xlsx", config), url: "https://attacker.invalid", sha256: createHash("sha256").update(bytes).digest("hex") };
  let requested;
  const actual = await readCloudinaryFile(asset, bytes.length, config, async url => { requested = new URL(url); return new Response(bytes); });
  assert.deepEqual(actual, bytes);
  assert.equal(requested.hostname, "api.cloudinary.com");
  assert.equal(requested.searchParams.get("type"), "authenticated");
  assert.equal(requested.searchParams.get("public_id"), asset.publicId);
  assert.ok(requested.searchParams.has("signature"));
  await assert.rejects(readCloudinaryFile(asset, bytes.length, config, async () => new Response(Buffer.alloc(bytes.length))), { status: 502 });
  await assert.rejects(readCloudinaryFile(asset, 10, config, async () => new Response(bytes)), { status: 502 });
  await assert.rejects(readCloudinaryFile(asset, bytes.length, config, async () => new Response("denied", { status: 403 })), { status: 502 });
  await assert.rejects(readCloudinaryFile({ ...asset, publicId: "filevault/notes/other" }, bytes.length, config), { status: 502 });
  assert.deepEqual(await readStoredUpload({ uploadData: bytes }), bytes);
});

test("deletion targets only this app's authenticated raw assets and propagates failures", async () => {
  const asset = newFileAsset("report.pdf", config);
  let options;
  await destroyCloudinaryFile(asset, config, { destroy: async (id, settings) => { assert.equal(id, asset.publicId); options = settings; return { result: "ok" }; } });
  assert.equal(options.invalidate, true); assert.equal(options.type, "authenticated"); assert.equal(options.resource_type, "raw");
  await destroyCloudinaryFile(asset, config, { destroy: async () => ({ result: "not found" }) });
  await assert.rejects(destroyCloudinaryFile(asset, config, { destroy: async () => ({ result: "error" }) }), { status: 502 });
  await assert.rejects(destroyCloudinaryFile({ ...asset, cloudName: "different-account" }, config), { status: 502 });
});
