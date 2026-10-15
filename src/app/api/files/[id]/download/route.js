import { withAuth } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import File from "@/models/File";
import { apiError } from "@/lib/api";
import { readStoredUpload } from "@/lib/cloudinary-files.mjs";
import { downloadDisposition } from "@/lib/uploads.mjs";

export const runtime = "nodejs";
export const maxDuration = 60;
async function handleGET(request, { params }) {
  try {
    const { id } = await params;
    if (!/^[a-f\d]{24}$/i.test(id)) return Response.json({ error: "File not found." }, { status: 404 });
    await connectDB();
    const file = await File.findOne({ _id: id, kind: "upload" }).select("+uploadData");
    if (!file) return Response.json({ error: "File not found." }, { status: 404 });
    const bytes = await readStoredUpload(file);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(bytes.length),
        "Content-Disposition": downloadDisposition(file.filename),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) { return apiError(error); }
}

export const GET = withAuth(handleGET);
