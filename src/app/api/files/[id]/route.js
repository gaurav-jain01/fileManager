import connectDB from "@/lib/mongodb";
import { deleteStoredFile } from "@/lib/upload-storage.mjs";
import File from "@/models/File";
import { NextResponse } from "next/server";
import { validateFile } from "@/lib/files.mjs";
import { apiError, readJson } from "@/lib/api";

const missing = () => NextResponse.json({ error: "Item not found." }, { status: 404 });
const validId = id => /^[a-f\d]{24}$/i.test(id);

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    if (!validId(id)) return missing();
    await connectDB();
    const file = await File.findById(id).lean();
    return file ? NextResponse.json({ file }) : missing();
  } catch (error) { return apiError(error); }
}

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    if (!validId(id)) return missing();
    const body = await readJson(request);
    await connectDB();
    const existing = await File.findById(id).select("kind").lean();
    if (!existing) return missing();
    let data;
    try { data = validateFile(body, true, existing.kind || "link"); } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }); }
    const file = await File.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }).lean();
    return file ? NextResponse.json({ file }) : missing();
  } catch (error) { return apiError(error); }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    if (!validId(id)) return missing();
    await connectDB();
    const file = await File.findById(id).lean();
    if (!file) return missing();
    const result = await deleteStoredFile(file);
    return NextResponse.json({ message: "Item deleted.", ...result });
  } catch (error) { return apiError(error); }
}
