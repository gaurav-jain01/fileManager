export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function uploadFilename(name) {
  const filename = String(name || "file").split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f]/g, "").trim();
  return (filename || "file").slice(0, 180);
}

export function uploadType(name) {
  const extension = name.split(".").pop().toLowerCase();
  if (extension === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "heic"].includes(extension)) return "image";
  if (["mp4", "mov", "webm", "mkv"].includes(extension)) return "video";
  return "other";
}

export function formatSize(size) {
  return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : size >= 1024 ? `${(size / 1024).toFixed(1)} KB` : `${size} B`;
}

export function downloadDisposition(name) {
  const clean = uploadFilename(name);
  const ascii = clean.replace(/[^a-zA-Z0-9._ -]/g, "_");
  const encoded = encodeURIComponent(clean).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

// Use a fixed allowlist, never the uploaded MIME type or editable file category.
export function uploadPreviewFormat(name) {
  const extension = uploadFilename(name).split(".").pop().toLowerCase();
  const images = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", bmp: "image/bmp" };
  const videos = { mp4: "video/mp4", webm: "video/webm", ogv: "video/ogg", mov: "video/quicktime" };
  const audio = { mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", flac: "audio/flac" };
  if (Object.hasOwn(images, extension)) return { kind: "image", mime: images[extension] };
  if (Object.hasOwn(videos, extension)) return { kind: "video", mime: videos[extension] };
  if (Object.hasOwn(audio, extension)) return { kind: "audio", mime: audio[extension] };
  if (extension === "pdf") return { kind: "pdf", mime: "application/pdf" };
  if (["xls", "xlsx", "ods", "csv", "ppt", "pptx", "pps", "ppsx", "odp", "doc", "docx", "odt", "rtf"].includes(extension)) return { kind: "office", mime: "application/pdf" };
  if (["txt", "md", "json", "log", "xml", "html", "htm", "css", "js", "jsx", "ts", "tsx", "py", "yaml", "yml", "sql", "svg"].includes(extension)) return { kind: "text", mime: "text/plain; charset=utf-8" };
  return null;
}

export function uploadPreviewResponse(filename, bytes) {
  const format = uploadPreviewFormat(filename);
  if (!format) return Response.json({ error: "Preview is not available for this file type. Download it to open it on your device." }, { status: 415 });
  // Office bytes must pass through the converter, never be relabeled as a PDF.
  if (format.kind === "office") throw new Error("Convert office documents before building the preview response.");
  return new Response(new Uint8Array(bytes), { headers: {
    "Content-Type": format.mime,
    "Content-Length": String(bytes.length),
    "Content-Disposition": downloadDisposition(filename).replace(/^attachment;/, "inline;"),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  } });
}
