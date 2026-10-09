import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { MAX_UPLOAD_BYTES, uploadFilename, uploadPreviewFormat } from "./uploads.mjs";

const execute = promisify(execFile);
const MAX_PDF_BYTES = 25 * 1024 * 1024;
const CACHE_BYTES = 32 * 1024 * 1024;
const CACHE_TTL = 5 * 60 * 1000;
const cache = new Map();
const pending = new Map();
let cachedBytes = 0;
let conversionQueue = Promise.resolve();

export class PreviewConversionError extends Error {
  constructor(message, status = 422) { super(message); this.name = "PreviewConversionError"; this.status = status; }
}

async function converterPath() {
  if (process.env.LIBREOFFICE_PATH?.trim()) return process.env.LIBREOFFICE_PATH.trim();
  for (const path of ["/Applications/LibreOffice.app/Contents/MacOS/soffice", "/usr/bin/libreoffice", "/usr/bin/soffice", "/opt/homebrew/bin/soffice", "/usr/local/bin/soffice"]) {
    try { await access(path, constants.X_OK); return path; } catch { /* Try the next installation. */ }
  }
  return "soffice";
}

async function convert(filename, bytes) {
  const directory = await mkdtemp(join(tmpdir(), "filevault-preview-"));
  try {
    const extension = uploadFilename(filename).split(".").pop().toLowerCase();
    const input = join(directory, `document.${extension}`);
    const profile = join(directory, "profile");
    await mkdir(join(profile, "user"), { recursive: true });
    // Each conversion has its own profile. Never run document macros or update linked data.
    await writeFile(join(profile, "user", "registrymodifications.xcu"), `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry">
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item>
<item oor:path="/org.openoffice.Office.Calc/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>0</value></prop></item>
<item oor:path="/org.openoffice.Office.Writer/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>2</value></prop></item>
</oor:items>`);
    await writeFile(input, bytes);
    const sheet = ["xls", "xlsx", "ods", "csv"].includes(extension);
    const slides = ["ppt", "pptx", "pps", "ppsx", "odp"].includes(extension);
    const filter = sheet ? "calc_pdf_Export" : slides ? "impress_pdf_Export" : "writer_pdf_Export";
    const options = sheet ? { SinglePageSheets: { type: "boolean", value: "true" } } : {};
    await execute(await converterPath(), [
      `-env:UserInstallation=${pathToFileURL(profile).href}`,
      "--headless", "--nologo", "--nodefault", "--norestore",
      // UTF-8 comma-separated data, with formula evaluation disabled for CSV imports.
      ...(extension === "csv" ? ["--infilter=Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,false,false,false,0,false"] : []),
      "--convert-to", `pdf:${filter}:${JSON.stringify(options)}`, "--outdir", directory, input,
    ], { timeout: 45000, killSignal: "SIGKILL", maxBuffer: 1024 * 1024, windowsHide: true });
    const output = join(directory, "document.pdf");
    let size;
    try { size = (await stat(output)).size; }
    catch { throw new PreviewConversionError("This document could not be previewed. Check that it is not damaged or password-protected."); }
    if (size > MAX_PDF_BYTES) throw new PreviewConversionError("The PDF preview is too large. Download the original file to view it.", 413);
    const pdf = await readFile(output);
    if (pdf.subarray(0, 5).toString() !== "%PDF-") throw new PreviewConversionError("The document could not be converted to a PDF preview.");
    return pdf;
  } catch (error) {
    if (error instanceof PreviewConversionError) throw error;
    if (error.code === "ENOENT" || error.code === "EACCES") throw new PreviewConversionError("Office previews are not configured on this server. Install LibreOffice or set LIBREOFFICE_PATH, then retry.", 503);
    if (error.killed || error.signal === "SIGKILL") throw new PreviewConversionError("Creating the PDF preview took too long. Try a smaller document.", 504);
    throw new PreviewConversionError("This document could not be previewed. Check that it is not damaged or password-protected.");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function officePreviewPdf(filename, bytes) {
  if (uploadPreviewFormat(filename)?.kind !== "office") throw new PreviewConversionError("This file type cannot be converted to PDF.", 415);
  if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES) throw new PreviewConversionError("Choose a nonempty document of 10 MB or smaller.", 413);
  const extension = uploadFilename(filename).split(".").pop().toLowerCase();
  const key = createHash("sha256").update(extension).update(bytes).digest("hex");
  for (const [entryKey, entry] of cache) {
    if (entry.expires <= Date.now()) { cache.delete(entryKey); cachedBytes -= entry.pdf.length; }
  }
  if (cache.has(key)) return cache.get(key).pdf;
  if (pending.has(key)) return pending.get(key);
  if (pending.size >= 3) throw new PreviewConversionError("Other document previews are being prepared. Please retry in a moment.", 503);
  // Serialize conversions and share in-flight work when a preview is requested twice.
  const job = conversionQueue.then(() => convert(filename, bytes)).then(pdf => {
    while (cachedBytes + pdf.length > CACHE_BYTES && cache.size) {
      const oldest = cache.keys().next().value;
      cachedBytes -= cache.get(oldest).pdf.length;
      cache.delete(oldest);
    }
    cache.set(key, { pdf, expires: Date.now() + CACHE_TTL }); cachedBytes += pdf.length;
    return pdf;
  }).finally(() => pending.delete(key));
  pending.set(key, job);
  conversionQueue = job.catch(() => {});
  return job;
}
