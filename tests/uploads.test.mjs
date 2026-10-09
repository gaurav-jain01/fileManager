import test from "node:test";
import assert from "node:assert/strict";
import { uploadFilename, uploadType, downloadDisposition, formatSize, uploadPreviewFormat, uploadPreviewResponse } from "../src/lib/uploads.mjs";
import { itemHref, safeSourceUrl } from "../src/lib/files.mjs";

test("download names cannot inject headers or directories", () => {
  assert.equal(uploadFilename("../../hello\r\n.txt"), "hello.txt");
  assert.equal(uploadFilename("C:\\fakepath\\résumé.pdf"), "résumé.pdf");
  const header = downloadDisposition('résumé"\r\n.txt');
  assert.ok(!/[\r\n]/.test(header)); assert.match(header, /filename\*=UTF-8''/);
  assert.equal(uploadType("Report.PDF"), "pdf"); assert.equal(uploadType("archive.zip"), "other");
  assert.equal(formatSize(1024), "1.0 KB");
});
test("internal source links allow only validated note and download routes", () => {
  const id = "aaaaaaaaaaaaaaaaaaaaaaaa";
  assert.equal(itemHref({ _id: id, kind: "note" }), `/?item=${id}`);
  assert.equal(itemHref({ _id: id, kind: "upload" }), `/api/files/${id}/download`);
  assert.equal(safeSourceUrl(`/?item=${id}`), `/?item=${id}`);
  assert.equal(safeSourceUrl("//evil.example"), null);
  assert.equal(safeSourceUrl("/api/files/../secrets/download"), null);
  assert.equal(safeSourceUrl("javascript:alert(1)"), null);
});

test("previews serve original bytes inline with fixed safe content types", async () => {
  for (const [filename, mime] of [["report.PDF", "application/pdf"], ["photo.png", "image/png"], ["clip.mp4", "video/mp4"], ["voice.mp3", "audio/mpeg"], ["notes.txt", "text/plain; charset=utf-8"]]) {
    const bytes = Buffer.from("Original bytes नमस्ते");
    const response = uploadPreviewResponse(filename, bytes);
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    assert.equal(response.headers.get("content-type"), mime);
    assert.match(response.headers.get("content-disposition"), /^inline;/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
});

test("active text stays inert and unsupported formats cannot be served inline", () => {
  for (const name of ["page.html", "image.svg", "script.js"]) {
    assert.equal(uploadPreviewFormat(name).kind, "text");
    const response = uploadPreviewResponse(name, Buffer.from('<script>alert("unsafe")</script>'));
    assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
    assert.match(response.headers.get("content-security-policy"), /sandbox/);
  }
  for (const name of ["archive.zip", "program.exe", "__proto__", "toString"]) {
    assert.equal(uploadPreviewFormat(name), null);
    assert.equal(uploadPreviewResponse(name, Buffer.from("data")).status, 415);
  }
});

test("Office formats require PDF conversion instead of serving original bytes as PDF", () => {
  for (const extension of ["XLSX", "xls", "ods", "csv", "PPTX", "ppt", "pps", "ppsx", "odp", "doc", "docx", "odt", "rtf"]) {
    const filename = `document.${extension}`;
    assert.deepEqual(uploadPreviewFormat(filename), { kind: "office", mime: "application/pdf" });
    assert.throws(() => uploadPreviewResponse(filename, Buffer.from("office bytes")), /Convert office documents/);
  }
});
