import mongoose from "mongoose";

const schema = new mongoose.Schema({
  _id: String, // SHA-256 of the opaque cookie; never store the bearer token.
  credentialVersion: { type: String, required: true },
  expiresAt: { type: Date, required: true },
}, { collection: "auth_sessions", timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.AuthSession || mongoose.model("AuthSession", schema);
