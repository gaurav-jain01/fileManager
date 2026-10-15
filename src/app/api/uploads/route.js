import { withAuth } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import { createStoredUpload } from "@/lib/upload-storage.mjs";
import { apiError } from "@/lib/api";
import { validateFile } from "@/lib/files.mjs";
import { readUploadForm, UploadRequestError } from "@/lib/upload-request.mjs";

export const runtime = "nodejs";
export const maxDuration = 180;

async function handlePOST(request) {
  try {
    const { form, content } = await readUploadForm(request);
    let data;
    try {
      data = validateFile({ kind: "upload", title: form.get("title") || content.filename, description: form.get("description") || "", category: form.get("category") || "Uploads", notes: form.get("notes") || "", tags: (String(form.get("tags") || "")).split(",").map(t => t.trim()).filter(Boolean), type: content.type });
    } catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
    await connectDB();
    const file = await createStoredUpload(data, content);
    return Response.json({ file }, { status: 201 });
  } catch (error) {
    if (error instanceof UploadRequestError) return Response.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}

export const POST = withAuth(handlePOST);
