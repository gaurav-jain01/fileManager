import { randomUUID } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import { cloudinaryImageUrl } from "./note-images.mjs";

export function cloudinaryConfig(env = process.env) {
  const cloud_name = env.CLOUDINARY_CLOUD_NAME?.trim();
  const api_key = env.CLOUDINARY_API_KEY?.trim();
  const api_secret = env.CLOUDINARY_API_SECRET?.trim();
  if (!cloud_name || !api_key || !api_secret) return null;
  const asset_folder = env.CLOUDINARY_FOLDER?.trim() || "filevault/notes";
  return { cloud_name, api_key, api_secret, asset_folder, secure: true };
}

export async function uploadNoteImage(bytes, config, uploader = cloudinary.uploader) {
  const result = await new Promise((resolve, reject) => {
    const stream = uploader.upload_stream({
      ...config,
      resource_type: "image",
      type: "upload",
      public_id: `filevault/notes/${randomUUID()}`,
      overwrite: false,
      allowed_formats: ["png", "jpg", "jpeg", "webp", "gif"],
      timeout: 45000,
    }, (error, result) => error ? reject(error) : resolve(result));
    stream.on("error", reject);
    stream.end(bytes);
  });
  const originalUrl = cloudinaryImageUrl(result?.secure_url);
  if (!originalUrl || !result.public_id) throw new Error("Invalid image upload response.");
  return {
    url: originalUrl.replace("/image/upload/", "/image/upload/f_auto,q_auto/"),
    publicId: result.public_id,
    width: result.width,
    height: result.height,
  };
}
