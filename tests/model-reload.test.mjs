import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

test("development reload replaces the pre-notepad model without changing stored data", async () => {
  const previousEnvironment = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "development";
    // Simulate a Next.js dev process that compiled the original link-only schema.
    const legacy = mongoose.model("File", new mongoose.Schema({
      title: { type: String, required: true },
      url: { type: String, required: true },
      type: String,
      notes: String,
    }));
    const payload = { kind: "note", title: "Meeting notes", type: "note", notes: "Saved without a link." };
    await assert.rejects(new legacy(payload).validate(), error => Boolean(error.errors.url));

    const { default: current } = await import("../src/models/File.js?reload=first");
    const note = new current(payload);
    await assert.doesNotReject(note.validate());
    assert.equal(note.kind, "note");
    await assert.rejects(new current({ kind: "link", title: "Missing link" }).validate(), error => Boolean(error.errors.url));
    const upload = new current({ kind: "upload", title: "File", filename: "test.txt", uploadData: Buffer.from("original bytes") });
    await assert.doesNotReject(upload.validate());
    assert.equal(upload.uploadData.toString(), "original bytes");
    assert.equal(current.schema.path("uploadData").options.select, false);

    const { default: reloaded } = await import("../src/models/File.js?reload=second");
    await assert.doesNotReject(new reloaded(payload).validate());
    assert.equal(mongoose.models.File, reloaded);

    process.env.NODE_ENV = "production";
    const { default: production } = await import("../src/models/File.js?reload=production");
    assert.equal(production, reloaded, "production retains its compiled model");
  } finally {
    mongoose.deleteModel("File");
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
  }
});
