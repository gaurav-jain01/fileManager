import mongoose from "mongoose";

const schema = new mongoose.Schema({
  publicId: { type: String, required: true },
  cloudName: { type: String, required: true },
  resourceType: { type: String, default: "raw" },
  deliveryType: { type: String, default: "authenticated" },
  notBefore: { type: Date, required: true },
}, { timestamps: true, collection: "upload_cleanup" });
schema.index({ publicId: 1, cloudName: 1 }, { unique: true });
schema.index({ notBefore: 1 });

export default mongoose.models.UploadCleanup || mongoose.model("UploadCleanup", schema);
