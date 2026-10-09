import nextEnv from "@next/env";
import mongoose from "mongoose";
import Task from "../src/models/Task.js";

nextEnv.loadEnvConfig(process.cwd());
if (!process.env.MONGODB_URI) throw new Error("Set MONGODB_URI in .env.local before initializing tasks.");
try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  await Task.createCollection();
  await Task.createIndexes();
  console.log("The tasks collection and indexes are ready. Existing data was preserved.");
} catch (error) {
  console.error(`Could not initialize tasks (${error.name}). Check your database connection.`);
  const failures = [...(error.reason?.servers?.values() || [])].map(server => server.error).filter(Boolean);
  for (const failure of failures) console.error(`Connection failure: ${failure.name}; code: ${failure.cause?.code || failure.code || "unavailable"}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
