import test from "node:test";
import assert from "node:assert/strict";
import { readUploadForm } from "../src/lib/upload-request.mjs";
import { MAX_UPLOAD_BYTES } from "../src/lib/uploads.mjs";

test("upload form preserves binary content, sanitizes names, and rejects duplicate files", async () => {
  const form = new FormData();
  const bytes = Uint8Array.from([0, 255, 1, 128]);
  form.append("file", new Blob([bytes]), "../../photo.PNG");
  const request = () => new Request("http://localhost/upload", { method: "POST", body: form });
  const { content } = await readUploadForm(request());
  assert.equal(content.filename, "photo.PNG");
  assert.equal(content.type, "image");
  assert.equal(content.size, 4);
  assert.deepEqual(content.uploadData, Buffer.from(bytes));
  form.append("file", new Blob(["second"]), "second.txt");
  await assert.rejects(readUploadForm(request()), { status: 400 });
});

test("streamed upload limits apply without Content-Length, and malformed forms are rejected", async () => {
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MAX_UPLOAD_BYTES + 64001)); controller.close(); } });
  const request = new Request("http://localhost/upload", { method: "PUT", headers: { "Content-Type": "multipart/form-data; boundary=test" }, body, duplex: "half" });
  await assert.rejects(readUploadForm(request), { status: 413 });
  const malformed = new Request("http://localhost/upload", { method: "PUT", headers: { "Content-Type": "multipart/form-data; boundary=test" }, body: "invalid multipart" });
  await assert.rejects(readUploadForm(malformed), { status: 400 });
});
