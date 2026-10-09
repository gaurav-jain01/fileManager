"use client";
import { useRef, useState } from "react";
import { Dialog } from "./ItemDialog";
import Icon from "./Icon";
import { MAX_UPLOAD_BYTES, formatSize } from "@/lib/uploads.mjs";

export default function UploadDialog({ onClose, onUploaded, categories }) {
  const [queue, setQueue] = useState([]);
  const [uploadTitle, setUploadTitle] = useState("");
  const [category, setCategory] = useState("Uploads");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const picker = useRef(null);
  const sequence = useRef(0);
  const running = useRef(false);
  function addFiles(files) {
    if (running.current) return;
    const additions = Array.from(files).map(file => ({ id: ++sequence.current, file, title: uploadTitle.trim() ? uploadTitle : file.name.slice(0, 200), titleEdited: false, status: "ready", error: "" }));
    if (additions.some(item => item.file.size > MAX_UPLOAD_BYTES)) setError("Files larger than 10 MB were skipped. Choose smaller files.");
    else setError("");
    setQueue(current => [...current, ...additions.filter(item => item.file.size <= MAX_UPLOAD_BYTES)].slice(0, 10));
    if (queue.length + additions.length > 10) setError("Upload up to 10 files at a time. Additional files were skipped.");
  }
  const update = (id, changes) => setQueue(current => current.map(item => item.id === id ? { ...item, ...changes } : item));
  function changeUploadTitle(value) {
    setUploadTitle(value);
    setQueue(current => current.map(item => item.status === "saved" || item.titleEdited ? item : { ...item, title: value.trim() ? value : item.file.name.slice(0, 200), error: "" }));
  }
  async function upload() {
    if (running.current) return;
    const untitled = queue.filter(item => item.status !== "saved" && !item.title.trim());
    if (untitled.length) {
      for (const item of untitled) update(item.id, { error: "Enter a title for this file." });
      document.getElementById(`upload-title-${untitled[0].id}`)?.focus();
      return;
    }
    running.current = true; setBusy(true); setError("");
    let uploaded = 0;
    try {
      for (const item of queue.filter(item => item.status !== "saved")) {
        update(item.id, { status: "uploading", error: "" });
        const form = new FormData();
        form.append("file", item.file); form.append("title", item.title.trim()); form.append("category", category); form.append("tags", tags);
        try {
          const response = await fetch("/api/uploads", { method: "POST", body: form });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Upload failed. Please try again.");
          update(item.id, { status: "saved" }); uploaded++;
        } catch (error) { update(item.id, { status: "failed", error: error.message }); }
      }
    } finally { running.current = false; setBusy(false); if (uploaded) onUploaded(); }
  }
  const ready = queue.some(item => item.status !== "saved");
  return <Dialog title="Upload files" onClose={() => { if (!busy) onClose(); }}>
    <p className="dialog-subtitle">Give your uploads a title so you can find them later using search.</p>
    <fieldset disabled={busy} className="form-fields upload-title-field"><label htmlFor="upload-title">Title<input id="upload-title" aria-label="Upload title" aria-describedby="upload-title-hint" maxLength={200} placeholder="e.g. Project report or Meeting notes" value={uploadTitle} onChange={event => changeUploadTitle(event.target.value)}/><small id="upload-title-hint">Used for the files you select. Leave blank to use filenames, or edit each file’s title below.</small></label></fieldset>
    <input ref={picker} className="upload-input" aria-label="Choose files to upload" type="file" multiple disabled={busy} onChange={event => { addFiles(event.target.files); event.target.value = ""; }}/>
    <button type="button" className={`upload-dropzone ${dragging ? "dragging" : ""}`} disabled={busy} onClick={() => picker.current?.click()} onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}><span className="empty-icon"><Icon name="upload" size={29}/></span><strong>Drop files here or browse</strong><span>Any file type · Up to 10 MB each · 10 files at a time</span></button>
    {error && <p role="alert" className="inline-error">{error}</p>}
    <div className="upload-queue" aria-live="polite">{queue.map(item => <div className="upload-row" key={item.id}><Icon name={item.status === "saved" ? "check" : "file"} size={20}/><div><strong>{item.file.name}</strong><label className="upload-title-label" htmlFor={`upload-title-${item.id}`}>Title<input id={`upload-title-${item.id}`} aria-label={`Title for ${item.file.name}`} aria-invalid={!!item.error} aria-describedby={item.error ? `upload-error-${item.id}` : undefined} required maxLength={200} value={item.title} disabled={busy || item.status === "saved"} onChange={event => update(item.id, { title: event.target.value, titleEdited: true, error: "" })}/></label><span>{formatSize(item.file.size)} · {item.status === "saved" ? "Saved to Cloudinary" : item.status === "uploading" ? "Uploading…" : item.status === "failed" ? "Failed — ready to retry" : "Ready to upload"}</span>{item.error && <p id={`upload-error-${item.id}`} className="upload-error">{item.error}</p>}</div>{!busy && item.status !== "saved" && <button className="icon-button" aria-label={`Remove ${item.file.name}`} onClick={() => setQueue(current => current.filter(file => file.id !== item.id))}><Icon name="close" size={15}/></button>}</div>)}</div>
    <fieldset disabled={busy} className="form-fields"><div className="form-row"><label>Collection<input maxLength={80} list="upload-collections" value={category} onChange={event => setCategory(event.target.value)}/><datalist id="upload-collections">{categories.map(c => <option key={c.name} value={c.name}/>)}</datalist></label><label>Tags<input placeholder="reports, project" value={tags} onChange={event => setTags(event.target.value)}/></label></div></fieldset>
    <div className="dialog-actions"><button className="button secondary" disabled={busy} onClick={onClose}>{queue.length && !ready ? "Done" : "Close"}</button><button className="button primary" disabled={busy || !ready} onClick={upload}><Icon name="upload" size={16}/>{busy ? "Uploading…" : queue.some(item => item.status === "failed") ? "Retry failed uploads" : "Upload selected files"}</button></div>
  </Dialog>;
}
