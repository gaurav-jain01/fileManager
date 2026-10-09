import { randomUUID, createHash } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import { cloudinaryConfig } from "./cloudinary.mjs";
import { MAX_UPLOAD_BYTES, uploadFilename } from "./uploads.mjs";

export class FileStorageError extends Error {
  constructor(message, status = 502) { super(message); this.name = "FileStorageError"; this.status = status; }
}

export function fileStorageConfig(env = process.env) {
  const config = cloudinaryConfig(env);
  if (!config) throw new FileStorageError("File storage is not configured. Add the Cloudinary credentials on the server, then retry.", 503);
  return { ...config, asset_folder: env.CLOUDINARY_UPLOAD_FOLDER?.trim() || "filevault/uploads" };
}

export function newFileAsset(filename, config = fileStorageConfig()) {
  const extension = uploadFilename(filename).match(/\.([a-z\d]{1,16})$/i)?.[1]?.toLowerCase();
  return { publicId: `filevault/uploads/${randomUUID()}${extension ? `.${extension}` : ""}`, cloudName: config.cloud_name, resourceType: "raw", deliveryType: "authenticated" };
}

export function validateFileAsset(asset, config) {
  if (!asset || asset.cloudName !== config.cloud_name || asset.resourceType !== "raw" || asset.deliveryType !== "authenticated" || !/^filevault\/uploads\/[a-f\d-]{36}(?:\.[a-z\d]{1,16})?$/.test(asset.publicId)) throw new FileStorageError("The stored file reference is invalid or belongs to another Cloudinary account.");
}

export async function uploadCloudinaryFile(bytes, asset, config = fileStorageConfig(), uploader = cloudinary.uploader) {
  validateFileAsset(asset, config);
  try {
    const result = await new Promise((resolve, reject) => {
      const stream = uploader.upload_stream({ ...config, public_id: asset.publicId, resource_type: "raw", type: "authenticated", overwrite: false, backup: false, timeout: 45000 }, (error, result) => error ? reject(error) : resolve(result));
      stream.on("error", reject); stream.end(bytes);
    });
    const url = new URL(result.secure_url);
    if (result.public_id !== asset.publicId || result.resource_type !== "raw" || result.type !== "authenticated" || result.bytes !== bytes.length || url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" || url.username || url.password) throw new Error("Unexpected upload result");
    return { ...asset, assetId: result.asset_id, url: url.href, sha256: createHash("sha256").update(bytes).digest("hex") };
  } catch { throw new FileStorageError("Could not store the file in Cloudinary. Please try again."); }
}

export async function readCloudinaryFile(asset, expectedSize, config = fileStorageConfig(), fetcher = fetch) {
  validateFileAsset(asset, config);
  // Generate the URL from a validated asset ID, never fetch a client-supplied URL.
  const url = cloudinary.utils.private_download_url(asset.publicId, "", { ...config, resource_type: "raw", type: "authenticated", expires_at: Math.floor(Date.now() / 1000) + 120, attachment: true });
  try {
    const response = await fetcher(url, { cache: "no-store", signal: AbortSignal.timeout(45000) });
    if (!response.ok || !response.body) throw new Error("Storage unavailable");
    const reader = response.body.getReader();
    let size = 0;
    const chunks = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_UPLOAD_BYTES) { await reader.cancel(); throw new Error("Stored file too large"); }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks);
    if (bytes.length !== expectedSize || (asset.sha256 && createHash("sha256").update(bytes).digest("hex") !== asset.sha256)) throw new Error("Stored file failed verification");
    return bytes;
  } catch { throw new FileStorageError("Could not retrieve the file from Cloudinary. Please try again."); }
}

export async function destroyCloudinaryFile(asset, config = fileStorageConfig(), uploader = cloudinary.uploader) {
  validateFileAsset(asset, config);
  try {
    const result = await uploader.destroy(asset.publicId, { ...config, resource_type: "raw", type: "authenticated", invalidate: true, timeout: 15000 });
    if (!["ok", "not found"].includes(result.result)) throw new Error("Deletion failed");
  } catch { throw new FileStorageError("Could not remove the old file from Cloudinary. Cleanup will be retried."); }
}

export async function readStoredUpload(file) {
  if (file.storage === "cloudinary") return readCloudinaryFile(file.cloudinary, file.size);
  if (file.uploadData != null) return Buffer.from(file.uploadData);
  throw new FileStorageError("File not found.", 404);
}
