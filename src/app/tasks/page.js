"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import WorkspaceProfile from "@/components/WorkspaceProfile";
import TaskForm from "@/components/TaskForm";
import { Dialog } from "@/components/ItemDialog";
import { TASK_STATUSES, TASK_PRIORITIES, localDate } from "@/lib/tasks.mjs";

const INITIAL_FILTERS = { search: "", status: "", priority: "", sort: "-updatedAt", page: 1 };
async function requestJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not save your changes. Please try again.");
  return data;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [meta, setMeta] = useState({ total: 0, todo: 0, in_progress: 0, done: 0 });
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: 12 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [modal, setModal] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [quickError, setQuickError] = useState("");
  const [undo, setUndo] = useState(null);
  const quickInput = useRef(null);
  const mutationLock = useRef(false);
  const addingLock = useRef(false);
  const requestEpoch = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const epoch = ++requestEpoch.current;
    const timer = setTimeout(async () => {
      try {
        const data = await requestJson(`/api/tasks?${new URLSearchParams(filters)}`, { signal: controller.signal });
        if (controller.signal.aborted || epoch !== requestEpoch.current) return;
        setTasks(data.tasks); setMeta(data.meta); setPagination(data.pagination); setError("");
      } catch (error) { if (!controller.signal.aborted && epoch === requestEpoch.current) setError(error.message); }
      finally { if (!controller.signal.aborted && epoch === requestEpoch.current) setLoading(false); }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [filters, refresh]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => { setToast(""); setUndo(null); }, 6000);
    return () => clearTimeout(timer);
  }, [toast, undo]);

  function filter(next) { setLoading(true); setFilters(current => ({ ...current, page: 1, ...next })); }
  function reload(message) { setRefresh(value => value + 1); if (message) setToast(message); }
  async function quickAdd(event) {
    event.preventDefault();
    if (addingLock.current || mutationLock.current) return;
    const title = quickTitle.trim();
    if (!title) { setQuickError("Write a to-do before adding it."); quickInput.current?.focus(); return; }
    addingLock.current = true; setAdding(true); setQuickError(""); setUndo(null);
    try {
      await requestJson("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, status: "todo", priority: "medium" }) });
      setQuickTitle(""); filter(INITIAL_FILTERS); reload("To-do added");
    } catch (error) { setQuickError(error.message); }
    finally { addingLock.current = false; setAdding(false); requestAnimationFrame(() => quickInput.current?.focus()); }
  }
  async function saveTask(data, id) {
    await requestJson(id ? `/api/tasks/${id}` : "/api/tasks", { method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    setModal(null); setActionError(""); setUndo(null); reload(id ? "Task updated" : "Task created");
  }
  async function changeStatus(task, status, undoing = false) {
    if (mutationLock.current || addingLock.current || task.status === status) return;
    mutationLock.current = true;
    // Ignore older list responses while this checkbox update is in flight.
    requestEpoch.current++;
    setBusyId(task._id); setActionError(""); setUndo(null); setToast("");
    setTasks(current => current.map(item => item._id === task._id ? { ...item, status } : item));
    setMeta(current => ({ ...current, [task.status]: Math.max(0, current[task.status] - 1), [status]: current[status] + 1 }));
    try {
      const data = await requestJson(`/api/tasks/${task._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (!undoing) setUndo({ task: data.task, status: task.status });
      reload(undoing ? "Change undone" : status === "done" ? "Task completed" : "Task updated");
    } catch (error) {
      setTasks(current => current.map(item => item._id === task._id ? { ...item, status: task.status } : item));
      setMeta(current => ({ ...current, [status]: Math.max(0, current[status] - 1), [task.status]: current[task.status] + 1 }));
      setActionError(error.message); reload();
    }
    finally { mutationLock.current = false; setBusyId(null); }
  }
  async function deleteTask() {
    setBusyId(modal.task._id); setActionError("");
    try { await requestJson(`/api/tasks/${modal.task._id}`, { method: "DELETE" }); setModal(null); setUndo(null); reload("Task deleted"); }
    catch (error) { setActionError(error.message); }
    finally { setBusyId(null); }
  }
  const hasFilters = filters.search || filters.status || filters.priority;
  const today = localDate();
  const remaining = meta.todo + meta.in_progress;

  return <div className="app-shell">
    {mobileNav && <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setMobileNav(false)}/>}
    <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`} aria-label="Main navigation">
      <Link className="brand" href="/" aria-label="FileVault home"><span className="brand-icon"><Icon name="folder" size={23}/></span>FileVault<span className="brand-dot">.</span></Link>
      <WorkspaceProfile/>
      <div className="nav-label">WORKSPACE</div>
      <nav className="main-nav"><Link href="/"><Icon name="grid" size={18}/>All files</Link><Link href="/tasks" className="active" aria-current="page" onClick={() => setMobileNav(false)}><Icon name="check" size={18}/>Tasks<span className="nav-count">{meta.total}</span></Link></nav>
      <div className="sidebar-bottom"><div className="sidebar-tip"><Icon name="check" size={22}/><strong>One step at a time.</strong><p>Keep track of what matters, from the first idea to the final check.</p></div></div>
    </aside>
    <div className="main-column">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Icon name="menu"/></button><Icon name="folder" size={16}/><span>Workspace</span><Icon name="chevron" size={13}/><strong>Tasks</strong></div><Link href="/" className="button secondary">Back to files</Link></header>
      <main>
        <section className="page-heading"><div><span className="eyebrow">MAKE ROOM FOR PROGRESS</span><h1>Tasks<span className="heading-dot">.</span></h1><p>Add a to-do, check it off, and keep your day moving.</p></div><button className="button secondary" disabled={!!busyId || adding} onClick={() => { setActionError(""); setModal({ kind: "form" }); }}><Icon name="plus" size={18}/>New task</button></section>
        <section className="todo-entry" aria-label="Add a to-do"><h2>Your to-do list</h2><form onSubmit={quickAdd}><Icon name="plus" size={20}/><input ref={quickInput} aria-label="New to-do" aria-invalid={!!quickError} aria-describedby={quickError ? "todo-add-error" : "todo-add-hint"} maxLength={200} placeholder="What needs to get done?" value={quickTitle} disabled={adding || !!busyId} onChange={event => { setQuickTitle(event.target.value); setQuickError(""); }}/><button className="button primary" disabled={adding || !!busyId}>{adding ? "Adding…" : "Add to-do"}</button></form><p id="todo-add-hint">Press Enter to add. Use New task for details, priority, and a due date.</p>{quickError && <p id="todo-add-error" className="inline-error" role="alert">{quickError}</p>}</section>
        <section className="task-summary" aria-label="Task overview">{Object.entries(TASK_STATUSES).map(([key, label]) => <button key={key} disabled={!!busyId || adding} aria-pressed={filters.status === key} onClick={() => filter({ status: filters.status === key ? "" : key })}><span>{label}</span><strong>{meta[key]}</strong></button>)}</section>
        <section aria-label="Task list">
          <div className="todo-overview"><div className="todo-filters" role="group" aria-label="To-do views">{[["", "All", meta.total], ["active", "Active", remaining], ["done", "Completed", meta.done]].map(([status, label, count]) => <button key={label} disabled={!!busyId || adding} aria-label={`${label} to-dos`} aria-pressed={filters.status === status || status === "active" && ["todo", "in_progress"].includes(filters.status)} onClick={() => filter({ status })}>{label}<span>{count}</span></button>)}</div><span className="todo-remaining" role="status">{remaining} {remaining === 1 ? "to-do" : "to-dos"} remaining</span></div>
          <div className="toolbar task-toolbar">
            <label className="search-field"><Icon name="search" size={18}/><input aria-label="Search tasks" placeholder="Search tasks…" disabled={!!busyId || adding} value={filters.search} onChange={event => filter({ search: event.target.value })}/></label>
            <select aria-label="Filter task status" disabled={!!busyId || adding} value={filters.status} onChange={event => filter({ status: event.target.value })}><option value="">All statuses</option><option value="active">Active</option>{Object.entries(TASK_STATUSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
            <select disabled={!!busyId || adding} aria-label="Filter task priority" value={filters.priority} onChange={event => filter({ priority: event.target.value })}><option value="">All priorities</option>{Object.entries(TASK_PRIORITIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
            <select disabled={!!busyId || adding} aria-label="Sort tasks" value={filters.sort} onChange={event => filter({ sort: event.target.value })}><option value="-updatedAt">Recently updated</option><option value="-createdAt">Newest first</option><option value="title">Title A–Z</option><option value="dueDate">Due date</option></select>
          </div>
          {hasFilters && <button disabled={!!busyId || adding} className="task-clear" onClick={() => filter(INITIAL_FILTERS)}>Clear filters</button>}
          {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => reload()}>Try again</button></div>}
          {actionError && !modal && <p className="inline-error" role="alert">{actionError}</p>}
          {loading ? <div className="task-loading" role="status">Loading tasks…</div> : !error && !tasks.length ? <div className="empty-state"><span className="empty-icon"><Icon name="check" size={32}/></span><h3>{hasFilters ? "No matching tasks" : "Start with your next step"}</h3><p>{hasFilters ? "Try another search or clear your filters." : "Add a task and make a little progress today."}</p><button className="button primary" onClick={() => hasFilters ? filter(INITIAL_FILTERS) : setModal({ kind: "form" })}>{hasFilters ? "Clear filters" : "Create your first task"}</button></div> : !error && <div className="task-list">{tasks.map(task => {
            const overdue = task.dueDate && task.dueDate < today && task.status !== "done";
            return <article className={`task-card ${task.status === "done" ? "task-done" : ""}`} key={task._id}>
              <input className="task-checkbox" type="checkbox" aria-label={`Mark ${task.title} ${task.status === "done" ? "incomplete" : "complete"}`} checked={task.status === "done"} disabled={!!busyId || adding} onChange={() => changeStatus(task, task.status === "done" ? "todo" : "done")}/>
              <div className="task-content"><button className="task-title" disabled={!!busyId || adding} onClick={() => { setActionError(""); setModal({ kind: "form", task }); }}>{task.title}</button>{task.description && <p>{task.description}</p>}<div className="task-badges"><span className={`task-priority priority-${task.priority}`}>{TASK_PRIORITIES[task.priority]} priority</span>{task.dueDate && <span className={overdue ? "task-overdue" : ""}><Icon name="clock" size={13}/>{overdue ? "Overdue · " : "Due "}<time dateTime={task.dueDate}>{task.dueDate}</time></span>}</div></div>
              <div className="task-actions"><select aria-label={`Status for ${task.title}`} value={task.status} disabled={!!busyId || adding} onChange={event => changeStatus(task, event.target.value)}>{Object.entries(TASK_STATUSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><button className="icon-button" disabled={!!busyId || adding} aria-label={`Edit ${task.title}`} onClick={() => { setActionError(""); setModal({ kind: "form", task }); }}><Icon name="edit" size={16}/></button><button className="icon-button danger" disabled={!!busyId || adding} aria-label={`Delete ${task.title}`} onClick={() => { setActionError(""); setModal({ kind: "delete", task }); }}><Icon name="trash" size={16}/></button></div>
            </article>;
          })}</div>}
          {!loading && !error && pagination.total > 0 && <div className="pagination"><span>{pagination.total} {pagination.total === 1 ? "task" : "tasks"}</span><div><button aria-label="Previous page" disabled={pagination.page <= 1 || !!busyId || adding} onClick={() => filter({ page: pagination.page - 1 })}><Icon name="chevron" className="rotate" size={15}/></button><span>{pagination.page} / {pagination.pages}</span><button aria-label="Next page" disabled={pagination.page >= pagination.pages || !!busyId || adding} onClick={() => filter({ page: pagination.page + 1 })}><Icon name="chevron" size={15}/></button></div></div>}
        </section>
      </main>
    </div>
    {modal?.kind === "form" && <TaskForm task={modal.task} onClose={() => setModal(null)} onSave={saveTask}/>}
    {modal?.kind === "delete" && <Dialog title="Delete task?" onClose={() => { if (!busyId) { setModal(null); setActionError(""); } }}><p className="delete-copy">“{modal.task.title}” will be permanently deleted.</p>{actionError && <p className="inline-error" role="alert">{actionError}</p>}<div className="dialog-actions"><button className="button secondary" disabled={!!busyId || adding} onClick={() => { setModal(null); setActionError(""); }}>Keep task</button><button className="button danger-button" disabled={!!busyId || adding} onClick={deleteTask}>{busyId ? "Deleting…" : "Delete task"}</button></div></Dialog>}
    {toast && <div className="toast" role="status"><Icon name="check" size={17}/>{toast}{undo && <button className="todo-undo" disabled={!!busyId || adding} onClick={() => changeStatus(undo.task, undo.status, true)}>Undo</button>}</div>}
  </div>;
}
