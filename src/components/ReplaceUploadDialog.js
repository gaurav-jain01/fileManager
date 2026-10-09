"use client";

import { useRef, useState } from "react";
import { Dialog } from "./ItemDialog";
import Icon from "./Icon";
import { MAX_UPLOAD_BYTES, formatSize } from "@/lib/uploads.mjs";

export default function ReplaceUploadDialog({ file, onClose, onReplaced }) {
  const [replacement, setReplacement] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);

  function choose(event) {
    const selected = event.target.files?.[0];
    setError("");
    if (selected?.size > MAX_UPLOAD_BYTES) {
      setReplacement(null); event.target.value = "";
      setError("Each file must be 10 MB or smaller.");
    } else setReplacement(selected || null);
  }

  async function replace(event) {
    event.preventDefault();
    if (running.current || !replacement) return;
    running.current = true; setBusy(true); setError("");
    try {
      const form = new FormData();
      form.append("file", replacement);
      const response = await fetch(`/api/files/${file._id}/replace`, { method: "PUT", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not replace this file. Please try again.");
      onReplaced(data.file, data.cleanupPending);
    } catch (error) { setError(error.message); }
    finally { running.current = false; setBusy(false); }
  }

  return <Dialog title="Replace file" onClose={() => { if (!running.current) onClose(); }}>
    <p className="dialog-subtitle">Choose a new file for “{file.title}”. Replacing removes the old file permanently. Your title, collection, tags, and notes stay with this item.</p>
    <div className="upload-file-info"><Icon name="file" size={20}/><span>Current file: {file.filename}<small>{formatSize(file.size)}</small></span></div>
    <form onSubmit={replace}>
      <fieldset className="form-fields" disabled={busy}>
        <label>Replacement file<input type="file" required onChange={choose} aria-describedby="replacement-hint"/></label>
        <small id="replacement-hint">Any file type · Up to 10 MB. The old file stays available until the replacement succeeds.</small>
      </fieldset>
      {replacement && <div className="upload-file-info"><Icon name="upload" size={20}/><span>New file: {replacement.name}<small>{formatSize(replacement.size)}</small></span></div>}
      {error && <p role="alert" className="inline-error">{error}</p>}
      {busy && <p role="status" className="dialog-subtitle">Replacing file…</p>}
      <div className="dialog-actions"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" disabled={busy || !replacement}><Icon name="upload" size={16}/>{busy ? "Replacing…" : "Replace file"}</button></div>
    </form>
  </Dialog>;
}
