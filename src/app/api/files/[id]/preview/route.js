import connectDB from "@/lib/mongodb";
import { readStoredUpload } from "@/lib/cloudinary-files.mjs";
import File from "@/models/File";
import { apiError } from "@/lib/api";
import { uploadPreviewFormat, uploadPreviewResponse } from "@/lib/uploads.mjs";
import { officePreviewPdf, PreviewConversionError } from "@/lib/office-preview.mjs";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    if (!/^[a-f\d]{24}$/i.test(id)) return Response.json({ error: "File not found." }, { status: 404 });
    await connectDB();
    const file = await File.findOne({ _id: id, kind: "upload" }).select("filename size storage cloudinary +uploadData");
    if (!file) return Response.json({ error: "File not found." }, { status: 404 });
    const bytes = await readStoredUpload(file);
    if (uploadPreviewFormat(file.filename)?.kind === "office") {
      const pdf = await officePreviewPdf(file.filename, bytes);
      return uploadPreviewResponse(file.filename.replace(/\.[^.]+$/, ".pdf"), pdf);
    }
    return uploadPreviewResponse(file.filename, bytes);
  } catch (error) {
    if (error instanceof PreviewConversionError) return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    return apiError(error);
  }
}
