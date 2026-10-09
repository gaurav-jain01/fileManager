export const TYPES = {
  google_sheet: { label: "Google Sheet", icon: "sheet", color: "green" },
  google_doc: { label: "Google Doc", icon: "file", color: "blue" },
  google_slide: { label: "Google Slide", icon: "slides", color: "amber" },
  google_form: { label: "Google Form", icon: "file", color: "purple" },
  pdf: { label: "PDF", icon: "file", color: "red" },
  image: { label: "Image", icon: "image", color: "purple" },
  video: { label: "Video", icon: "video", color: "red" },
  link: { label: "Link", icon: "link", color: "blue" },
  note: { label: "Note", icon: "file", color: "amber" },
  other: { label: "Other", icon: "file", color: "gray" },
};

export function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

export function detectType(value) {
  try {
    const url = new URL(value);
    if (url.hostname === "docs.google.com") {
      if (url.pathname.startsWith("/spreadsheets/")) return "google_sheet";
      if (url.pathname.startsWith("/document/")) return "google_doc";
      if (url.pathname.startsWith("/presentation/")) return "google_slide";
      if (url.pathname.startsWith("/forms/")) return "google_form";
    }
    if (/\.pdf$/i.test(url.pathname)) return "pdf";
    if (/\.(png|jpe?g|gif|webp|svg)$/i.test(url.pathname)) return "image";
    if (["youtube.com", "www.youtube.com", "youtu.be", "vimeo.com"].includes(url.hostname)) return "video";
  } catch { /* The form validates incomplete URLs on submit. */ }
  return "link";
}

export function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export function validateFile(body, partial = false, existingKind = "link") {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Enter a valid item.");
  const data = {};
  const kind = partial ? existingKind : (body.kind || "link");
  if (!["link", "note", "upload"].includes(kind)) throw new Error("Choose a valid item kind.");
  if (partial && body.kind !== undefined && body.kind !== existingKind) throw new Error("An item's storage kind cannot be changed.");
  if (!partial) data.kind = kind;
  for (const [field, max] of Object.entries({ title: 200, url: 2048, description: 2000, notes: 12000, category: 80 })) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== "string" || body[field].length > max) throw new Error(`${field} must be text with at most ${max} characters.`);
      data[field] = field === "notes" ? body[field] : body[field].trim();
    }
  }
  if ((!partial || "title" in data) && !data.title) throw new Error("A title is required.");
  if (kind === "link" && (!partial || "url" in data) && !safeUrl(data.url)) throw new Error("Enter a valid http:// or https:// URL.");
  if (kind !== "link" && data.url) throw new Error("Notes and uploads do not need an external URL.");
  if (kind === "note" && (!partial || "notes" in data) && !data.notes?.trim()) throw new Error("Write something in your note before saving.");
  if (kind === "note" && /!\[[^\n]*\]\((?:note-image:|blob:|data:)/i.test(data.notes || "")) throw new Error("Finish uploading your inserted images before saving the note.");
  if ("category" in data && !data.category) data.category = "General";
  if (body.type !== undefined) {
    if (!Object.hasOwn(TYPES, body.type)) throw new Error("Choose a valid file type.");
    data.type = body.type;
  }
  if (kind === "note") {
    if (body.type !== undefined && body.type !== "note") throw new Error("Notepad items must use the Note file type.");
    if (!partial || body.type !== undefined) data.type = "note";
  }
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags) || body.tags.length > 30 || body.tags.some(t => typeof t !== "string" || t.length > 50)) throw new Error("Use up to 30 tags, each with at most 50 characters.");
    data.tags = [...new Set(body.tags.map(t => t.trim()).filter(Boolean))];
  }
  if (body.favorite !== undefined) {
    if (typeof body.favorite !== "boolean") throw new Error("Favorite must be true or false.");
    data.favorite = body.favorite;
  }
  if (partial && Object.keys(data).length === 0) throw new Error("No editable fields provided.");
  return data;
}

export function fileQuery(params) {
  const query = {};
  if (["note", "upload"].includes(params.get("kind"))) query.kind = params.get("kind");
  const search = (params.get("search") || "").trim().slice(0, 200);
  if (search) query.$or = ["title", "description", "tags", "notes", "category"].map(field => ({ [field]: { $regex: escapeRegex(search), $options: "i" } }));
  for (const field of ["category", "type", "tag"]) {
    if (params.get(field)) query[field === "tag" ? "tags" : field] = params.get(field).slice(0, 100);
  }
  if (params.get("favorite") === "true") query.favorite = true;
  const positive = (value, fallback, max) => /^\d+$/.test(value || "") ? Math.max(1, Math.min(Number(value), max)) : fallback;
  const sort = ["-updatedAt", "-createdAt", "title", "-title"].includes(params.get("sort")) ? params.get("sort") : "-updatedAt";
  return { query, sort, page: positive(params.get("page"), 1, 100000), limit: positive(params.get("limit"), 12, 100) };
}

export function itemHref(file) {
  if (file.kind === "note" && /^[a-f\d]{24}$/i.test(String(file._id))) return `/?item=${file._id}`;
  if (file.kind === "upload" && /^[a-f\d]{24}$/i.test(String(file._id))) return `/api/files/${file._id}/download`;
  return safeUrl(file.url);
}

export function safeSourceUrl(value) {
  if (typeof value === "string" && (/^\/\?item=[a-f\d]{24}$/i.test(value) || /^\/api\/files\/[a-f\d]{24}\/download$/i.test(value))) return value;
  return safeUrl(value);
}
