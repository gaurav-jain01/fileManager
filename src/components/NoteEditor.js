"use client";
import { useEffect, useRef, useState } from "react";
import NoteContent from "./NoteContent";
import { Dialog } from "./ItemDialog";
import Icon from "./Icon";
import { NOTE_IMAGE_ACCEPT, MAX_NOTE_IMAGES, validateNoteImageFile, imageMarkdown, cloudinaryImageUrl } from "@/lib/note-images.mjs";

export default function NoteEditor({ file, categories, onClose, onSave }) {
  const initial = { title: file?.title || "", notes: file?.notes || "", category: file?.category || "Notes", tags: file?.tags?.join(", ") || "" };
  const [form, setForm] = useState(initial);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [images, setImages] = useState([]);
  const [progress, setProgress] = useState("");
  const [dragging, setDragging] = useState(false);
  const editor = useRef(null);
  const formRef = useRef(null);
  const picker = useRef(null);
  const selection = useRef({ start: 0, end: 0 });
  const objectUrls = useRef(new Set());
  const saveLock = useRef(false);
  const dirty = Object.keys(initial).some(key => form[key] !== initial[key]);
  const pendingImages = images.filter(image => form.notes.includes(`note-image:${image.id}`));
  const draftImages = Object.fromEntries(images.map(image => [`note-image:${image.id}`, image.previewUrl]));

  useEffect(() => {
    const urls = objectUrls.current;
    return () => { for (const url of urls) URL.revokeObjectURL(url); urls.clear(); };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));
  function close() { if (!busy && (!dirty || window.confirm("Discard your unsaved note changes?"))) onClose(); }
  function rememberSelection() {
    if (editor.current) selection.current = { start: editor.current.selectionStart, end: editor.current.selectionEnd };
  }
  function format(before, after = "", placeholder = "text", line = false) {
    const input = editor.current;
    if (!input || busy) return;
    const start = line ? form.notes.lastIndexOf("\n", input.selectionStart - 1) + 1 : input.selectionStart;
    const end = input.selectionEnd;
    const selected = form.notes.slice(start, end) || placeholder;
    const inserted = line ? selected.split("\n").map(value => before + value).join("\n") : before + selected + after;
    const result = form.notes.slice(0, start) + inserted + form.notes.slice(end);
    if (result.length > 12000) { setError("Notes can contain up to 12,000 characters."); return; }
    update("notes", result);
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(start + before.length, start + inserted.length - after.length); });
  }

  function insertImages(files) {
    if (busy || !files.length) return;
    setError("");
    const chosen = Array.from(files);
    if (pendingImages.length + chosen.length > MAX_NOTE_IMAGES) { setError(`Insert up to ${MAX_NOTE_IMAGES} new images at a time, then save your note.`); return; }
    try { chosen.forEach(validateNoteImageFile); } catch (error) { setError(error.message); return; }
    const added = chosen.map(file => ({ id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file), url: null }));
    const start = preview ? form.notes.length : Math.min(selection.current.start, form.notes.length);
    const end = preview ? start : Math.min(selection.current.end, form.notes.length);
    const inserted = `\n\n${added.map(image => imageMarkdown(image.file.name, `note-image:${image.id}`)).join("\n\n")}\n\n`;
    const result = form.notes.slice(0, start) + inserted + form.notes.slice(end);
    if (result.length > 12000) { added.forEach(image => URL.revokeObjectURL(image.previewUrl)); setError("Make a little room in your note before inserting images (12,000 character limit)."); return; }
    added.forEach(image => objectUrls.current.add(image.previewUrl));
    setImages(current => [...current, ...added]);
    update("notes", result);
    selection.current = { start: start + inserted.length, end: start + inserted.length };
    if (!preview) requestAnimationFrame(() => { editor.current?.focus(); editor.current?.setSelectionRange(start + inserted.length, start + inserted.length); });
  }

  function removeImage(image) {
    // Remove every inline reference to this draft; keep its blob alive for undo.
    update("notes", form.notes.replace(new RegExp(`!\\[[^\\n]*?\\]\\(note-image:${image.id}\\)`, "g"), ""));
  }

  async function save(event) {
    event.preventDefault();
    if (saveLock.current) return;
    if (!form.title.trim() || !form.notes.trim()) { setError("Add a title and some text or an image before saving."); return; }
    saveLock.current = true;
    setBusy(true); setError("");
    try {
      let notes = form.notes;
      for (const [index, image] of pendingImages.entries()) {
        let url = image.url;
        if (!url) {
          setProgress(`Uploading image ${index + 1} of ${pendingImages.length}…`);
          const body = new FormData(); body.append("file", image.file);
          const response = await fetch("/api/note-images", { method: "POST", body, signal: AbortSignal.timeout(60000) });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Image upload failed. Your draft is still here; please try again.");
          url = cloudinaryImageUrl(data.image?.url);
          if (!url) throw new Error("The image service returned an invalid link. Please try again.");
          // Reuse successful uploads if a later upload or note save fails.
          setImages(current => current.map(item => item.id === image.id ? { ...item, url } : item));
        }
        notes = notes.replaceAll(`note-image:${image.id}`, url);
      }
      if (notes.length > 12000) throw new Error("The image links take this note over 12,000 characters. Shorten the text or remove an image and save again.");
      setProgress("Saving to your vault…");
      await onSave({ ...form, notes, kind: "note", type: "note", tags: form.tags.split(",").map(tag => tag.trim()).filter(Boolean) }, file?._id);
    } catch (error) {
      setError(error.name === "TimeoutError" ? "Image upload timed out. Your draft is still here; please try again." : error.message);
      setBusy(false); setProgress("");
    } finally { saveLock.current = false; }
  }

  return <Dialog title={file ? "Edit note" : "New note"} className="note-dialog" onClose={close}>
    <p className="dialog-subtitle">A place for your thoughts, meeting notes, and supporting images.</p>
    <form ref={formRef} onSubmit={save} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); if (!busy) formRef.current.requestSubmit(); } }}>
      <fieldset disabled={busy} className="form-fields">
        <label>Note title<input aria-label="Note title" autoFocus required maxLength={200} value={form.title} placeholder="Untitled note" onChange={event => update("title", event.target.value)}/></label>
        <input ref={picker} className="upload-input" type="file" multiple accept={NOTE_IMAGE_ACCEPT} aria-label="Choose note images" onChange={event => { insertImages(event.target.files); event.target.value = ""; }}/>
        <div className={`note-editor ${dragging ? "note-dragging" : ""}`} onDragOver={event => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); if (!busy) setDragging(true); } }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }} onDrop={event => { if (event.dataTransfer.files.length) { event.preventDefault(); setDragging(false); rememberSelection(); insertImages(event.dataTransfer.files); } }}>
          <div className="editor-toolbar" role="toolbar" aria-label="Note formatting">
            <div className="format-buttons"><button type="button" disabled={preview} aria-label="Bold" title="Bold (Ctrl/⌘ B)" onClick={() => format("**", "**")}><strong>B</strong></button><button type="button" disabled={preview} aria-label="Italic" title="Italic (Ctrl/⌘ I)" onClick={() => format("*", "*")}><em>I</em></button><button type="button" disabled={preview} aria-label="Heading" onClick={() => format("## ", "", "Heading", true)}>H2</button><button type="button" disabled={preview} aria-label="Bulleted list" onClick={() => format("- ", "", "List item", true)}>• List</button><button type="button" disabled={preview} aria-label="Quote" onClick={() => format("> ", "", "Quote", true)}>❞</button><button type="button" disabled={preview} aria-label="Code" onClick={() => format("`", "`", "code")}>{"</>"}</button><button type="button" disabled={preview} aria-label="Insert link" onClick={() => format("[", "](https://example.com)", "Link text")}><Icon name="link" size={15}/></button><button type="button" className="insert-image-button" aria-label="Insert images" onClick={() => { rememberSelection(); picker.current?.click(); }}><Icon name="image" size={15}/>Image</button></div>
            <div className="editor-tabs"><button type="button" aria-pressed={!preview} onClick={() => setPreview(false)}>Write</button><button type="button" aria-pressed={preview} onClick={() => { rememberSelection(); setPreview(true); }}>Preview</button></div>
          </div>
          {preview ? <div className="note-preview" role="region" aria-label="Note preview">{form.notes ? <NoteContent text={form.notes} draftImages={draftImages}/> : <p className="editor-placeholder">Your formatted note will appear here.</p>}</div> : <textarea ref={editor} className="note-textarea" aria-label="Note text" required maxLength={12000} spellCheck placeholder="Start writing… Insert, paste, or drop images to add context." value={form.notes} onSelect={rememberSelection} onChange={event => update("notes", event.target.value)} onPaste={event => { const files = Array.from(event.clipboardData.items).filter(item => item.kind === "file" && item.type.startsWith("image/")).map(item => item.getAsFile()).filter(Boolean); if (files.length) { event.preventDefault(); rememberSelection(); insertImages(files); } }} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && ["b", "i"].includes(event.key.toLowerCase())) { event.preventDefault(); format(event.key.toLowerCase() === "b" ? "**" : "*", event.key.toLowerCase() === "b" ? "**" : "*"); } }}/>}<div className="editor-status"><span>Markdown · PNG, JPG, WebP, GIF · 5 MB per image</span><span>{form.notes.length.toLocaleString()} / 12,000</span></div>
        </div>
        {pendingImages.length > 0 && <div className="note-image-queue" aria-label="Inserted images"><p>Images upload when you save. Edit the text between [brackets] to change an image description.</p>{pendingImages.map(image => <div className="note-image-row" key={image.id}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.previewUrl} alt=""/><span>{image.file.name}<small>{image.url ? "Uploaded · ready to save" : "Ready to upload"}</small></span><button type="button" className="icon-button" aria-label={`Remove image ${image.file.name}`} onClick={() => removeImage(image)}><Icon name="close" size={15}/></button>
        </div>)}</div>}
        <div className="form-row"><label>Collection<input maxLength={80} list="note-collections" value={form.category} onChange={event => update("category", event.target.value)}/><datalist id="note-collections">{categories.map(category => <option key={category.name} value={category.name}/>)}</datalist></label><label>Tags<input placeholder="ideas, meeting" value={form.tags} onChange={event => update("tags", event.target.value)}/></label></div>
      </fieldset>
      {error && <p role="alert" className="inline-error">{error}</p>}
      <div className="dialog-actions note-save-actions"><span role="status">{busy ? progress || "Saving to your vault…" : dirty ? "Unsaved changes" : file ? "Saved to your vault" : "Ready to write"}</span><button type="button" className="button secondary" disabled={busy} onClick={close}>Cancel</button><button className="button primary" disabled={busy}><Icon name="check" size={16}/>{busy ? "Saving…" : "Save note"}</button></div>
    </form>
  </Dialog>;
}
