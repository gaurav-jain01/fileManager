import File from "../models/File.js";
import UploadCleanup from "../models/UploadCleanup.js";
import { FileStorageError, newFileAsset, fileStorageConfig, uploadCloudinaryFile, destroyCloudinaryFile, readCloudinaryFile } from "./cloudinary-files.mjs";

const grace = () => new Date(Date.now() + 10 * 60 * 1000);
const assetQuery = asset => ({ publicId: asset.publicId, cloudName: asset.cloudName });

export async function scheduleAssetCleanup(asset) {
  if (!asset?.publicId) return;
  await UploadCleanup.updateOne(assetQuery(asset), { $set: { resourceType: asset.resourceType, deliveryType: asset.deliveryType, notBefore: grace() } }, { upsert: true });
}

export async function cleanupAsset(asset) {
  if (!asset?.publicId) return true;
  try {
    // A database timeout can happen after a write commits. Never delete an asset
    // that is referenced by a saved file, including a concurrent replacement.
    if (await File.exists({ "cloudinary.publicId": asset.publicId, "cloudinary.cloudName": asset.cloudName })) {
      await UploadCleanup.updateOne(assetQuery(asset), { $set: { notBefore: grace() } });
      return false;
    }
    await destroyCloudinaryFile(asset);
    await UploadCleanup.deleteOne(assetQuery(asset));
    return true;
  } catch { return false; } // The durable cleanup record remains for a retry.
}

export async function retryUploadCleanup(limit = 10) {
  const jobs = await UploadCleanup.find({ notBefore: { $lte: new Date() } }).sort({ notBefore: 1 }).limit(limit).lean();
  let cleaned = 0;
  for (const job of jobs) {
    if (await cleanupAsset(job)) cleaned++;
    else await UploadCleanup.updateOne({ _id: job._id }, { $set: { notBefore: grace() } });
  }
  return { checked: jobs.length, cleaned };
}

async function store(content) {
  const config = fileStorageConfig();
  await retryUploadCleanup(1);
  const asset = newFileAsset(content.filename, config);
  // Register cleanup before contacting the provider: even an ambiguous upload
  // timeout leaves a known ID that can be removed later.
  await scheduleAssetCleanup(asset);
  const cloudinary = await uploadCloudinaryFile(content.uploadData, asset, config);
  const { filename, type, mimeType, size } = content;
  const metadata = { filename, type, mimeType, size };
  return { asset, document: { ...metadata, storage: "cloudinary", cloudinary } };
}

async function committed(asset) {
  try { await UploadCleanup.deleteOne(assetQuery(asset)); } catch { /* Retry checks the live reference before deleting anything. */ }
}

function revision(file) {
  return { _id: file._id, kind: "upload", updatedAt: file.updatedAt, "cloudinary.publicId": file.cloudinary?.publicId || { $exists: false } };
}

export async function createStoredUpload(metadata, content) {
  const stored = await store(content);
  try {
    const file = await File.create({ ...metadata, ...stored.document });
    await committed(stored.asset);
    return file.toObject();
  } catch (error) { await cleanupAsset(stored.asset); throw error; }
}

export async function replaceStoredUpload(existing, content, { verify = false, preserveUpdatedAt = false } = {}) {
  const stored = await store(content);
  try {
    if (verify) await readCloudinaryFile(stored.document.cloudinary, content.size);
    if (existing.storage === "cloudinary") await scheduleAssetCleanup(existing.cloudinary);
    const file = await File.findOneAndUpdate(revision(existing), { $set: stored.document, $unset: { uploadData: "" } }, { returnDocument: "after", runValidators: true, ...(preserveUpdatedAt ? { timestamps: false } : {}) }).select("-uploadData").lean();
    if (!file) throw new FileStorageError("This file changed while the upload was running. Reopen it and try again.", 409);
    await committed(stored.asset);
    const cleanupPending = existing.storage === "cloudinary" && !await cleanupAsset(existing.cloudinary);
    return { file, cleanupPending };
  } catch (error) { await cleanupAsset(stored.asset); throw error; }
}

export async function deleteStoredFile(existing) {
  await retryUploadCleanup(1);
  if (existing.storage === "cloudinary") await scheduleAssetCleanup(existing.cloudinary);
  const removed = await File.findOneAndDelete({ _id: existing._id, updatedAt: existing.updatedAt, "cloudinary.publicId": existing.cloudinary?.publicId || { $exists: false } }).lean();
  if (!removed) throw new FileStorageError("This item changed while it was being deleted. Reopen it and try again.", 409);
  const cleanupPending = existing.storage === "cloudinary" && !await cleanupAsset(existing.cloudinary);
  return { cleanupPending };
}
