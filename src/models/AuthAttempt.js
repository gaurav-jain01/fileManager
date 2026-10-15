import mongoose from "mongoose";

const schema = new mongoose.Schema({
  _id: String,
  count: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
}, { collection: "auth_attempts" });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.AuthAttempt || mongoose.model("AuthAttempt", schema);
