import { NextResponse } from "next/server";
import { FileStorageError } from "./cloudinary-files.mjs";

export function apiError(error) {
  if (error instanceof FileStorageError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error.name === "SyntaxError" || error.name === "ValidationError" || error.name === "CastError") {
    return NextResponse.json({ error: "Invalid request. Check your item details and try again." }, { status: 400 });
  }
  console.error("FileVault request failed:", error.name);
  return NextResponse.json({ error: "Could not reach your vault. Check the database connection and try again." }, { status: 503 });
}

export async function readJson(request, maxBytes = 64000) {
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Missing body");
  let size = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new SyntaxError("Body too large"); }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
