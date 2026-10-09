import connectDB from "@/lib/mongodb";
import File from "@/models/File";
import { replaceStoredUpload } from "@/lib/upload-storage.mjs";
import { apiError } from "@/lib/api";
import { readUploadForm, UploadRequestError } from "@/lib/upload-request.mjs";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    if (!/^[a-f\d]{24}$/i.test(id)) return Response.json({ error: "Upload not found." }, { status: 404 });
    const { content } = await readUploadForm(request);
    await connectDB();
    const existing = await File.findOne({ _id: id, kind: "upload" }).lean();
    if (!existing) return Response.json({ error: "Upload not found." }, { status: 404 });
    const result = await replaceStoredUpload(existing, content);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof UploadRequestError) return Response.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}
