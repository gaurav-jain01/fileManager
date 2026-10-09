import { MAX_UPLOAD_BYTES, uploadFilename, uploadType } from "./uploads.mjs";

export class UploadRequestError extends Error {
  constructor(message, status = 400) { super(message); this.name = "UploadRequestError"; this.status = status; }
}

export async function readUploadForm(request) {
  const tooLarge = () => new UploadRequestError("Each file must be 10 MB or smaller.", 413);
  if (Number(request.headers.get("content-length")) > MAX_UPLOAD_BYTES + 64000) throw tooLarge();
  const contentType = request.headers.get("content-type");
  if (!contentType?.startsWith("multipart/form-data")) throw new UploadRequestError("Choose a file to upload.");
  const reader = request.body?.getReader();
  if (!reader) throw new UploadRequestError("Choose a file to upload.");
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_UPLOAD_BYTES + 64000) { await reader.cancel(); throw tooLarge(); }
    chunks.push(value);
  }
  let form;
  try { form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": contentType } }).formData(); }
  catch { throw new UploadRequestError("The upload is incomplete. Please select the file again."); }
  const upload = form.get("file");
  if (!upload || typeof upload === "string" || typeof upload.arrayBuffer !== "function" || form.getAll("file").length !== 1) throw new UploadRequestError("Upload one file per request.");
  if (upload.size > MAX_UPLOAD_BYTES) throw tooLarge();
  const filename = uploadFilename(upload.name);
  return { form, content: { filename, type: uploadType(filename), mimeType: "application/octet-stream", size: upload.size, uploadData: Buffer.from(await upload.arrayBuffer()) } };
}
