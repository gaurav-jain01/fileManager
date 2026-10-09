import nextEnv from "@next/env";
import mongoose from "mongoose";
import { retryUploadCleanup } from "../src/lib/upload-storage.mjs";
import UploadCleanup from "../src/models/UploadCleanup.js";

nextEnv.loadEnvConfig(process.cwd());
try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  console.log(JSON.stringify({ ...await retryUploadCleanup(100), pending: await UploadCleanup.countDocuments() }));
} catch (error) { console.error(`Cleanup failed (${error.name}). Retry later.`); process.exitCode = 1; }
finally { await mongoose.disconnect(); }
