import mongoose from "mongoose";

const FileSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["link", "note", "upload"], default: "link" },
    filename: { type: String, default: "" },
    mimeType: { type: String, default: "" },
    size: { type: Number, default: 0 },
    uploadData: { type: Buffer, select: false },
    storage: { type: String, enum: ["mongodb", "cloudinary"] },
    cloudinary: {
      type: new mongoose.Schema({ publicId: String, cloudName: String, resourceType: String, deliveryType: String, assetId: String, url: String, sha256: String }, { _id: false }),
      default: undefined,
    },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    url: {
      type: String,
      required: function () { return this.kind === "link"; },
      default: "",
      trim: true,
    },
    type: {
      type: String,
      required: true,
      enum: [
        "google_sheet",
        "google_doc",
        "google_slide",
        "google_form",
        "pdf",
        "image",
        "video",
        "link",
        "note",
        "other",
      ],
      default: "link",
    },
    category: {
      type: String,
      trim: true,
      default: "General",
    },
    tags: {
      type: [String],
      default: [],
    },
    notes: {
      type: String,
      default: "",
    },
    favorite: {
      type: Boolean,
      default: false,
    },
    lastOpenedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Create a compound text index for search
FileSchema.index({ title: "text", description: "text", tags: "text", notes: "text", category: "text" });
FileSchema.index({ "cloudinary.publicId": 1 });

// Next.js reloads this module during development, but Mongoose's model cache
// survives. Recompile the schema so new fields and validators take effect.
// deleteModel only clears the in-memory model; it does not delete stored files.
if (process.env.NODE_ENV === "development" && mongoose.models.File) {
  mongoose.deleteModel("File");
}

export default mongoose.models.File || mongoose.model("File", FileSchema);
