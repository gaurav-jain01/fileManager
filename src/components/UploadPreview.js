"use client";

import { useEffect, useState } from "react";
import { uploadPreviewFormat } from "@/lib/uploads.mjs";

const TEXT_LIMIT = 200000;

export default function UploadPreview({ file }) {
  const format = uploadPreviewFormat(file.filename);
  const kind = format?.kind;
  const mime = format?.mime;
  const [content, setContent] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!kind) return;
    const controller = new AbortController();
    let objectUrl;
    async function load() {
      try {
        const response = await fetch(`/api/files/${file._id}/preview`, { signal: controller.signal });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Could not load this preview.");
        }
        const blob = await response.blob();
        if (kind === "text") {
          const text = await blob.text();
          if (!controller.signal.aborted) setContent({ text: text.slice(0, TEXT_LIMIT), truncated: text.length > TEXT_LIMIT });
        } else if (!controller.signal.aborted) {
          objectUrl = URL.createObjectURL(new Blob([blob], { type: mime }));
          setContent({ url: objectUrl });
        }
      } catch (error) {
        if (!controller.signal.aborted) setError(error.message || "Could not load this preview.");
      }
    }
    load();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [file._id, kind, mime, attempt]);

  const mediaError = () => setError("Your browser could not display this file. It may be damaged or use an unsupported format.");
  return <section className="upload-preview" aria-label="File preview">
    <h4>File preview</h4>
    {!format ? <p>Preview is not available for this file type. Download it to open it on your device.</p>
      : error ? <div><p role="alert">{error}</p><button className="button secondary" onClick={() => { setError(""); setContent(null); setAttempt(value => value + 1); }}>Retry preview</button></div>
      : !content ? <p role="status">{kind === "office" ? "Preparing PDF preview… This may take a moment." : "Loading preview…"}</p>
      : format.kind === "text" ? <>{content.truncated && <p>Showing the first {TEXT_LIMIT.toLocaleString("en")} characters. Download the file to read the rest.</p>}<pre tabIndex={0}>{content.text || "This file is empty."}</pre></>
      : format.kind === "image" ? /* eslint-disable-next-line @next/next/no-img-element -- Local blob preview, no image optimization needed. */
        <img src={content.url} alt={file.filename} onError={mediaError}/>
      : ["pdf", "office"].includes(kind) ? <>{kind === "office" && <p className="upload-preview-caption">PDF preview · Download keeps the original file format.</p>}<iframe src={content.url} title={`Preview of ${file.filename}`} onError={mediaError}/></>
      : format.kind === "video" ? <video src={content.url} controls preload="metadata" aria-label={`Preview of ${file.filename}`} onError={mediaError}/>
      : <audio src={content.url} controls preload="metadata" aria-label={`Preview of ${file.filename}`} onError={mediaError}/>}
  </section>;
}
