import nextEnv from "@next/env";
import mongoose from "mongoose";
import File from "../src/models/File.js";
import { fileStorageConfig } from "../src/lib/cloudinary-files.mjs";
import { replaceStoredUpload } from "../src/lib/upload-storage.mjs";

nextEnv.loadEnvConfig(process.cwd());
const apply = process.argv.includes("--apply");
try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  const query = { kind: "upload", storage: { $ne: "cloudinary" }, uploadData: { $exists: true } };
  const [summary] = await File.aggregate([{ $match: query }, { $group: { _id: null, files: { $sum: 1 }, bytes: { $sum: { $binarySize: "$uploadData" } } } }]);
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", files: summary?.files || 0, bytes: summary?.bytes || 0 }));
  if (apply) {
    fileStorageConfig();
    let migrated = 0;
    const cursor = File.find(query).select("+uploadData").cursor();
    for await (const file of cursor) {
      // No local removal until a downloaded Cloudinary copy matches the checksum.
      const bytes = Buffer.from(file.uploadData);
      await replaceStoredUpload(file, { filename: file.filename, type: file.type, mimeType: file.mimeType || "application/octet-stream", size: bytes.length, uploadData: bytes }, { verify: true, preserveUpdatedAt: true });
      migrated++;
      console.log(`Verified and migrated ${migrated}/${summary.files} files.`);
    }
    console.log(JSON.stringify({ migrated, remaining: await File.countDocuments(query) }));
  }
} catch (error) {
  console.error(error.name === "FileStorageError" ? error.message : `Migration stopped (${error.name}). Unmigrated files retain their MongoDB bytes. Rerun to resume.`);
  process.exitCode = 1;
} finally { await mongoose.disconnect(); }
