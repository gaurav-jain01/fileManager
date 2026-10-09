"use client";

import { useState } from "react";
import { Dialog } from "./ItemDialog";
import { TASK_STATUSES, TASK_PRIORITIES } from "@/lib/tasks.mjs";

export default function TaskForm({ task, onClose, onSave }) {
  const [form, setForm] = useState({ title: task?.title || "", description: task?.description || "", status: task?.status || "todo", priority: task?.priority || "medium", dueDate: task?.dueDate || "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));
  async function submit(event) {
    event.preventDefault();
    if (!form.title.trim()) { setError("A task title is required."); return; }
    setBusy(true); setError("");
    try { await onSave(form, task?._id); }
    catch (error) { setError(error.message); setBusy(false); }
  }
  return <Dialog title={task ? "Edit task" : "New task"} onClose={() => { if (!busy) onClose(); }}>
    <p className="dialog-subtitle">Give your next step a place in your workspace.</p>
    <form onSubmit={submit}>
      <fieldset className="form-fields" disabled={busy}>
        <label>Task title <span>*</span><input aria-label="Task title" autoFocus required maxLength={200} value={form.title} onChange={event => update("title", event.target.value)} placeholder="What needs to get done?"/></label>
        <label>Description<textarea aria-label="Description" rows={5} maxLength={4000} value={form.description} onChange={event => update("description", event.target.value)} placeholder="Add details or a plan…"/></label>
        <div className="form-row">
          <label>Status<select aria-label="Status" value={form.status} onChange={event => update("status", event.target.value)}>{Object.entries(TASK_STATUSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>Priority<select aria-label="Priority" value={form.priority} onChange={event => update("priority", event.target.value)}>{Object.entries(TASK_PRIORITIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        </div>
        <label>Due date<input aria-label="Due date" type="date" min="0001-01-01" max="9999-12-31" value={form.dueDate} onChange={event => update("dueDate", event.target.value)}/><small>Optional. Leave blank if there is no deadline.</small></label>
      </fieldset>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? "Saving…" : "Save task"}</button></div>
    </form>
  </Dialog>;
}
