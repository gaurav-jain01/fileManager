export const MAX_NOTE_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_NOTE_IMAGES = 10;
export const NOTE_IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export function validateNoteImageFile(file) {
  if (!file || !Number.isFinite(file.size) || file.size <= 0) throw new Error("Choose an image that is not empty.");
  if (file.size > MAX_NOTE_IMAGE_BYTES) throw new Error("Each image must be 5 MB or smaller.");
  if (!IMAGE_TYPES.includes(file.type) && !(file.type === "" && /\.(png|jpe?g|webp|gif)$/i.test(file.name))) throw new Error("Choose a PNG, JPG, WebP, or GIF image.");
}

export function noteImageType(bytes) {
  if (bytes.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return "image/png";
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 10 && ["GIF87a", "GIF89a"].includes(ascii(0, 6))) return "image/gif";
  throw new Error("This file is not a supported image. Choose a PNG, JPG, WebP, or GIF.");
}

export function imageAlt(name = "Image") {
  return name.replace(/\.[^.]+$/, "").replace(/[\\\[\]\r\n<>]/g, " ").trim().slice(0, 120) || "Image";
}

export function imageMarkdown(alt, source) {
  return `![${imageAlt(alt)}](${source})`;
}

export function safeNoteImageUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function cloudinaryImageUrl(value) {
  const safe = safeNoteImageUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  return url.hostname === "res.cloudinary.com" && /^\/[^/]+\/image\/upload\//.test(url.pathname) ? safe : null;
}
