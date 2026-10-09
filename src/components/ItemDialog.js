"use client";
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { TYPES, detectType, safeUrl, itemHref } from "@/lib/files.mjs";

import NoteContent from "./NoteContent";
import UploadPreview from "./UploadPreview";
import { formatSize } from "@/lib/uploads.mjs";

export function Dialog({ title, onClose, children, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { dialog.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <dialog ref={ref} className={`dialog ${className}`} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) { const rect = e.currentTarget.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) onClose(); } }} aria-labelledby="dialog-title">
    <div className="dialog-heading"><h2 id="dialog-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><Icon name="close"/></button></div>{children}
  </dialog>;
}

export function ItemForm({ file, categories, onClose, onSave }) {
  const [form, setForm] = useState({ title: file?.title || "", url: file?.url || "", description: file?.description || "", type: file?.type || "link", category: file?.category || "General", tags: file?.tags?.join(", ") || "", notes: file?.notes || "", favorite: file?.favorite || false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const update = (field, value) => setForm(current => ({ ...current, [field]: value }));
  async function submit(e) {
    e.preventDefault();
    if (file?.kind !== "upload" && !safeUrl(form.url)) { setError("Use a valid http:// or https:// link."); return; }
    setBusy(true); setError("");
    try { await onSave({ ...form, title: form.title.trim(), tags: form.tags.split(",").map(t => t.trim()).filter(Boolean) }, file?._id); }
    catch (error) { setError(error.message); setBusy(false); }
  }
  return <Dialog title={file ? "Edit saved item" : "Save something useful"} onClose={() => { if (!busy) onClose(); }}>
    <p className="dialog-subtitle">{file?.kind === "upload" ? `Edit details for ${file.filename}. The original file stays unchanged.` : "Keep a link, add a little context, find it whenever you need it."}</p>
    <form onSubmit={submit}>
      <fieldset disabled={busy} className="form-fields">
        {file?.kind !== "upload" && <label>Link <span>*</span><input autoFocus required type="url" maxLength={2048} placeholder="https://" value={form.url} onChange={e => { update("url", e.target.value); if (!file) update("type", detectType(e.target.value)); }}/></label>}
        <label>Title <span>*</span><input required maxLength={200} placeholder="Give your link a memorable name" value={form.title} onChange={e => update("title", e.target.value)}/></label>
        <label>Description<textarea maxLength={2000} rows={2} placeholder="What is this about?" value={form.description} onChange={e => update("description", e.target.value)}/></label>
        <div className="form-row"><label>File type<select value={form.type} onChange={e => update("type", e.target.value)}>{Object.entries(TYPES).map(([key, info]) => <option key={key} value={key}>{info.label}</option>)}</select></label><label>Collection<input maxLength={80} list="collection-options" value={form.category} onChange={e => update("category", e.target.value)}/><datalist id="collection-options">{categories.map(c => <option key={c.name} value={c.name}/>)}</datalist></label></div>
        <label>Tags<input placeholder="research, semester-1, inspiration" value={form.tags} onChange={e => update("tags", e.target.value)}/><small>Separate tags with commas.</small></label>
        <label>Notes<textarea maxLength={12000} rows={4} placeholder="Add details the assistant can help you find later…" value={form.notes} onChange={e => update("notes", e.target.value)}/></label>
        <label className="checkbox-label"><input type="checkbox" checked={form.favorite} onChange={e => update("favorite", e.target.checked)}/> Add to favorites</label>
      </fieldset>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? "Saving…" : file ? "Save changes" : "Save item"}<Icon name="arrow" size={16}/></button></div>
    </form>
  </Dialog>;
}

export function ItemDetails({ file, onClose, onEdit, onDelete, onReplace }) {
  const info = TYPES[file.type] || TYPES.other;
  return <Dialog title="Item details" onClose={onClose} className={file.kind === "upload" ? "upload-preview-dialog" : ""}>
    <div className="detail-title"><span className={`file-icon ${info.color}`}><Icon name={info.icon} size={26}/></span><div><span className="eyebrow">{info.label} · {file.category}</span><h3>{file.title}</h3></div></div>
    {file.description && <p className="detail-description">{file.description}</p>}
    <div className="tag-list">{file.tags?.map(tag => <span className="tag" key={tag}>#{tag}</span>)}</div>
    {file.notes && <section className="notes-block"><h4>{file.kind === "note" ? "Your note" : "Saved notes"}</h4>{file.kind === "note" ? <NoteContent text={file.notes}/> : <p>{file.notes}</p>}</section>}
    {file.kind === "upload" ? <div className="upload-file-info"><Icon name="file" size={20}/><span>{file.filename}<small>{formatSize(file.size)}</small></span></div> : <div className="detail-url">{file.url}</div>}
    {file.kind === "upload" && <UploadPreview key={file._id} file={file}/>}
    <div className="detail-dates"><span>Saved {new Date(file.createdAt).toLocaleDateString()}</span><span>Updated {new Date(file.updatedAt).toLocaleDateString()}</span></div>
    <div className="dialog-actions spread"><button className="icon-button danger" aria-label="Delete item" onClick={() => onDelete(file)}><Icon name="trash"/></button><div className="action-group">{file.kind === "upload" && <button className="button secondary" onClick={onReplace}><Icon name="upload" size={16}/>Replace file</button>}<button className="button secondary" onClick={onEdit}><Icon name="edit" size={16}/>Edit</button>{file.kind !== "note" && itemHref(file) && <a className="button primary" href={itemHref(file)} target="_blank" rel="noopener noreferrer">{file.kind === "upload" ? "Download" : "Open link"}<Icon name={file.kind === "upload" ? "download" : "external"} size={16}/></a>}</div></div>
  </Dialog>;
}
