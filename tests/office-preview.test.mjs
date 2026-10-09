import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { officePreviewPdf, PreviewConversionError } from "../src/lib/office-preview.mjs";

test("Office conversion isolates files, exports sheets to PDF, deduplicates requests, and cleans up", async () => {
  const directory = await mkdtemp(join(tmpdir(), "filevault-converter-test-"));
  const original = process.env.LIBREOFFICE_PATH;
  try {
    const log = join(directory, "calls.json");
    const executable = join(directory, "converter");
    await writeFile(executable, `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const dir = args[args.indexOf('--outdir') + 1];
const input = args.at(-1);
const profile = fs.readFileSync(path.join(dir, 'profile/user/registrymodifications.xcu'), 'utf8');
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ args, dir, profile, input: fs.readFileSync(input, 'utf8') }) + '\\n');
if (fs.readFileSync(input, 'utf8') === 'broken') process.exit(0);
fs.writeFileSync(path.join(dir, 'document.pdf'), '%PDF-1.7\\nPreview test');
`, { mode: 0o700 });
    process.env.LIBREOFFICE_PATH = executable;
    const bytes = Buffer.from("spreadsheet test");
    const [first, second] = await Promise.all([officePreviewPdf("../../evil;name.xlsx", bytes), officePreviewPdf("report.xlsx", bytes)]);
    assert.equal(first.toString(), "%PDF-1.7\nPreview test");
    assert.deepEqual(first, second);
    assert.deepEqual(await officePreviewPdf("report.xlsx", bytes), first);
    const calls = (await readFile(log, "utf8")).trim().split("\n").map(JSON.parse);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].input, "spreadsheet test");
    assert.equal(calls[0].args.at(-1), join(calls[0].dir, "document.xlsx"));
    assert.ok(calls[0].args.includes("--headless"));
    assert.ok(calls[0].args.some(value => value.includes('calc_pdf_Export:{"SinglePageSheets"')));
    assert.match(calls[0].profile, /MacroSecurityLevel/);
    await assert.rejects(access(calls[0].dir), { code: "ENOENT" });
    await assert.rejects(officePreviewPdf("broken.pptx", Buffer.from("broken")), error => error instanceof PreviewConversionError && error.status === 422);
    // Failed conversions are retried, not cached, and leave no source documents behind.
    await assert.rejects(officePreviewPdf("broken.pptx", Buffer.from("broken")), { status: 422 });
    const allCalls = (await readFile(log, "utf8")).trim().split("\n").map(JSON.parse);
    assert.equal(allCalls.length, 3);
    for (const call of allCalls) await assert.rejects(access(call.dir), { code: "ENOENT" });
    process.env.LIBREOFFICE_PATH = join(directory, "missing");
    await assert.rejects(officePreviewPdf("report.docx", Buffer.from("missing converter")), { status: 503 });
  } finally {
    if (original === undefined) delete process.env.LIBREOFFICE_PATH;
    else process.env.LIBREOFFICE_PATH = original;
    await rm(directory, { recursive: true, force: true });
  }
});

test("conversion rejects unsupported, empty, and oversized inputs before starting a process", async () => {
  await assert.rejects(officePreviewPdf("script.html", Buffer.from("html")), { status: 415 });
  await assert.rejects(officePreviewPdf("empty.xlsx", Buffer.alloc(0)), { status: 413 });
  await assert.rejects(officePreviewPdf("large.pptx", Buffer.alloc(10 * 1024 * 1024 + 1)), { status: 413 });
});
