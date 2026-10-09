import test from "node:test";
import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { MAX_NOTE_IMAGE_BYTES, validateNoteImageFile, noteImageType, imageMarkdown, safeNoteImageUrl, cloudinaryImageUrl } from "../src/lib/note-images.mjs";
import { cloudinaryConfig, uploadNoteImage } from "../src/lib/cloudinary.mjs";
import { validateFile } from "../src/lib/files.mjs";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");

test("note image uploads reject empty, oversized, active and spoofed files", () => {
  assert.doesNotThrow(() => validateNoteImageFile({ size: png.length, type: "image/png", name: "test.png" }));
  assert.doesNotThrow(() => validateNoteImageFile({ size: png.length, type: "", name: "test.PNG" }));
  for (const file of [{ size: 0, type: "image/png" }, { size: MAX_NOTE_IMAGE_BYTES + 1, type: "image/png" }, { size: 50, type: "image/svg+xml" }, { size: 50, type: "text/html", name: "fake.png" }]) assert.throws(() => validateNoteImageFile(file));
  assert.equal(noteImageType(png), "image/png");
  assert.throws(() => noteImageType(Buffer.from("<svg onload='alert(1)'></svg>")));
  assert.throws(() => noteImageType(Buffer.from("not an image")));
});

test("image Markdown cannot inject syntax through filenames; unsafe sources are rejected", () => {
  const markdown = imageMarkdown("report](javascript:alert).png", "https://example.com/image.png");
  assert.equal((markdown.match(/!\[/g) || []).length, 1);
  assert.equal((markdown.match(/\]\(/g) || []).length, 1);
  for (const url of ["javascript:alert(1)", "data:image/svg+xml,bad", "blob:unknown", "//evil.com/x", "http://example.com/x", "https://user:secret@example.com/x"]) assert.equal(safeNoteImageUrl(url), null);
  assert.equal(safeNoteImageUrl("https://example.com/a.png"), "https://example.com/a.png");
  assert.equal(cloudinaryImageUrl("https://res.cloudinary.com/demo/image/upload/test.png"), "https://res.cloudinary.com/demo/image/upload/test.png");
  assert.equal(cloudinaryImageUrl("https://res.cloudinary.com.evil.test/demo/image/upload/test.png"), null);
});

test("temporary image references cannot be persisted in notes", () => {
  for (const source of ["note-image:uuid", "blob:temporary", "data:image/png;base64,abc"]) assert.throws(() => validateFile({ kind: "note", title: "Draft", notes: `![image](${source})` }));
  assert.doesNotThrow(() => validateFile({ kind: "note", title: "Saved", notes: "![image](https://res.cloudinary.com/demo/image/upload/test.png)" }));
});

test("Cloudinary upload uses server credentials, image-only limits and optimized HTTPS output", async () => {
  assert.equal(cloudinaryConfig({}), null);
  assert.equal(cloudinaryConfig({ CLOUDINARY_CLOUD_NAME: "demo", CLOUDINARY_API_KEY: "key" }), null);
  const credentials = { CLOUDINARY_CLOUD_NAME: "demo", CLOUDINARY_API_KEY: "key", CLOUDINARY_API_SECRET: "secret" };
  assert.equal(cloudinaryConfig(credentials).asset_folder, "filevault/notes");
  const config = cloudinaryConfig({ ...credentials, CLOUDINARY_FOLDER: "  projects/note-images  " });
  let received;
  const uploader = { upload_stream(options, callback) {
    received = options;
    const chunks = [];
    return new Writable({ write(chunk, encoding, next) { chunks.push(chunk); next(); }, final(next) {
      assert.deepEqual(Buffer.concat(chunks), png);
      callback(null, { secure_url: "https://res.cloudinary.com/demo/image/upload/v1/filevault/notes/test.png", public_id: "filevault/notes/test", width: 1, height: 1 }); next();
    } });
  } };
  const result = await uploadNoteImage(png, config, uploader);
  assert.equal(received.api_secret, "secret"); assert.equal(received.resource_type, "image"); assert.equal(received.overwrite, false);
  assert.equal(received.asset_folder, "projects/note-images");
  assert.deepEqual(received.allowed_formats, ["png", "jpg", "jpeg", "webp", "gif"]);
  assert.match(received.public_id, /^filevault\/notes\/[a-f\d-]+$/);
  assert.equal(result.url, "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1/filevault/notes/test.png");
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("Cloudinary provider errors propagate for a retry without returning a fabricated image URL", async () => {
  const uploader = { upload_stream(options, callback) { return new Writable({ write(chunk, encoding, next) { callback({ http_code: 503 }); next(); } }); } };
  await assert.rejects(uploadNoteImage(png, {}, uploader), error => error.http_code === 503);
});
