import { cloudinaryConfig, uploadNoteImage } from "@/lib/cloudinary.mjs";
import { MAX_NOTE_IMAGE_BYTES, validateNoteImageFile, noteImageType } from "@/lib/note-images.mjs";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request) {
  const tooLarge = () => Response.json({ error: "Each image must be 5 MB or smaller." }, { status: 413 });
  try {
    if (Number(request.headers.get("content-length")) > MAX_NOTE_IMAGE_BYTES + 64000) return tooLarge();
    const contentType = request.headers.get("content-type");
    if (!contentType?.startsWith("multipart/form-data")) return Response.json({ error: "Choose an image to insert." }, { status: 400 });
    const reader = request.body?.getReader();
    if (!reader) return Response.json({ error: "Choose an image to insert." }, { status: 400 });
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_NOTE_IMAGE_BYTES + 64000) { await reader.cancel(); return tooLarge(); }
      chunks.push(value);
    }
    let form;
    try { form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": contentType } }).formData(); }
    catch { return Response.json({ error: "The image upload was incomplete. Please try again." }, { status: 400 }); }
    const file = form.get("file");
    if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function" || form.getAll("file").length !== 1) return Response.json({ error: "Upload one image per request." }, { status: 400 });
    if (file.size > MAX_NOTE_IMAGE_BYTES) return tooLarge();
    let bytes;
    try {
      validateNoteImageFile(file);
      bytes = Buffer.from(await file.arrayBuffer());
      noteImageType(bytes);
    } catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
    const config = cloudinaryConfig();
    if (!config) return Response.json({ error: "Image uploads are not configured yet. Add the Cloudinary credentials on the server, then retry. Your note has not been saved." }, { status: 503 });
    const image = await uploadNoteImage(bytes, config);
    return Response.json({ image }, { status: 201 });
  } catch (error) {
    // Provider errors can contain account details. Keep them out of responses/logs.
    const invalid = error.http_code === 400;
    return Response.json({ error: invalid ? "Cloudinary could not read this image. Try another PNG, JPG, WebP, or GIF." : "Could not upload the image to Cloudinary. Check the connection and server credentials, then retry. Your draft is still here." }, { status: invalid ? 400 : 502 });
  }
}
