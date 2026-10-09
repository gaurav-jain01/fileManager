import test from "node:test";
import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { v2 as cloudinary } from "cloudinary";
import File from "../src/models/File.js";
import UploadCleanup from "../src/models/UploadCleanup.js";
import { createStoredUpload, replaceStoredUpload, deleteStoredFile, cleanupAsset } from "../src/lib/upload-storage.mjs";

test("Cloudinary lifecycle preserves active files, rolls back failed saves, and queues failed cleanup", async t => {
  const env = { ...process.env };
  process.env.CLOUDINARY_CLOUD_NAME = "test-cloud"; process.env.CLOUDINARY_API_KEY = "key"; process.env.CLOUDINARY_API_SECRET = "secret";
  const jobs = new Map(), saved = new Map(), destroyed = [];
  let failSave = false, conflict = false, failDelete = false;
  const content = { filename: "file.txt", type: "other", mimeType: "application/octet-stream", size: 4, uploadData: Buffer.from("data") };
  t.mock.method(UploadCleanup, "updateOne", async (query, update) => { jobs.set(query.publicId, { publicId: query.publicId, cloudName: query.cloudName, ...update.$set }); });
  t.mock.method(UploadCleanup, "deleteOne", async query => jobs.delete(query.publicId));
  t.mock.method(UploadCleanup, "find", () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) }));
  t.mock.method(File, "exists", async query => [...saved.values()].some(file => file.cloudinary.publicId === query["cloudinary.publicId"]));
  t.mock.method(File, "create", async document => {
    if (failSave) throw new Error("Database unavailable");
    const file = { ...document, _id: "file-id", updatedAt: new Date() };
    saved.set(file._id, file); return { toObject: () => file };
  });
  t.mock.method(File, "findOneAndUpdate", (query, update) => ({ select: () => ({ lean: async () => {
    if (conflict) return null;
    assert.deepEqual(update.$unset, { uploadData: "" });
    assert.ok(!Object.hasOwn(update.$set, "uploadData"));
    const file = { ...saved.get(query._id), ...update.$set };
    saved.set(query._id, file); return file;
  } }) }));
  t.mock.method(File, "findOneAndDelete", query => ({ lean: async () => { const file = saved.get(query._id); saved.delete(query._id); return file; } }));
  t.mock.method(cloudinary.uploader, "upload_stream", (settings, callback) => new Writable({ write(chunk, encoding, done) { done(); }, final(done) {
    assert.ok(jobs.has(settings.public_id), "cleanup registered before upload");
    callback(null, { public_id: settings.public_id, asset_id: "asset", bytes: 4, resource_type: "raw", type: "authenticated", secure_url: `https://res.cloudinary.com/test-cloud/raw/authenticated/v1/${settings.public_id}` }); done();
  } }));
  t.mock.method(cloudinary.uploader, "destroy", async id => {
    if (failDelete) throw new Error("Storage down");
    destroyed.push(id); return { result: "ok" };
  });
  try {
    const first = await createStoredUpload({ title: "Saved title", kind: "upload" }, content);
    assert.equal(first.storage, "cloudinary"); assert.ok(!Object.hasOwn(first, "uploadData"));
    assert.equal(jobs.size, 0);
    assert.equal(await cleanupAsset(first.cloudinary), false);
    assert.equal(destroyed.length, 0, "active cloud asset survives ambiguous DB writes");
    conflict = true;
    await assert.rejects(replaceStoredUpload(first, content), { status: 409 });
    assert.equal(saved.get("file-id").cloudinary.publicId, first.cloudinary.publicId);
    assert.equal(destroyed.length, 1, "unused replacement is removed");
    conflict = false; failDelete = true;
    const replaced = await replaceStoredUpload(first, content);
    assert.equal(replaced.cleanupPending, true); assert.ok(jobs.has(first.cloudinary.publicId));
    assert.equal(replaced.file.title, "Saved title");
    failDelete = false;
    assert.equal(await cleanupAsset(first.cloudinary), true);
    assert.ok(!jobs.has(first.cloudinary.publicId));
    assert.deepEqual(await deleteStoredFile(replaced.file), { cleanupPending: false });
    assert.equal(saved.size, 0);
    failSave = true;
    await assert.rejects(createStoredUpload({ title: "Failed" }, content), /Database unavailable/);
    assert.equal(jobs.size, 0, "failed save rolls back its remote asset");
  } finally {
    for (const key of ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]) {
      if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key];
    }
  }
});
