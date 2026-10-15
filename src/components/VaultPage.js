"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import WorkspaceProfile from "@/components/WorkspaceProfile";
import ChatPanel from "@/components/ChatPanel";
import { Dialog, ItemForm, ItemDetails } from "@/components/ItemDialog";
import NoteEditor from "@/components/NoteEditor";
import UploadDialog from "@/components/UploadDialog";
import ReplaceUploadDialog from "@/components/ReplaceUploadDialog";
import DailyTodos from "@/components/DailyTodos";
import { formatSize } from "@/lib/uploads.mjs";
import { createRequestCache } from "@/lib/request-cache.mjs";
import { TYPES, itemHref } from "@/lib/files.mjs";

const INITIAL_FILTERS = { search: "", kind: "", category: "", type: "", tag: "", favorite: false, sort: "-updatedAt", page: 1 };
async function requestJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}
function domain(url) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "Saved link"; } }
function date(value) { return new Date(value).toLocaleDateString("en", { month: "short", day: "numeric" }); }

export default function HomePage() {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [meta, setMeta] = useState({ total: 0, favorites: 0, categories: [], tags: [] });
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: 12 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [view, setView] = useState("grid");
  const [mobileNav, setMobileNav] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const searchRef = useRef(null);
  const [listCache] = useState(() => createRequestCache());
  const [detailCache] = useState(() => createRequestCache());
  const metaLoadedAt = useRef(0);
  const detailEpoch = useRef(0);
  const [metaReady, setMetaReady] = useState(false);

  useEffect(() => {
    if (!libraryOpen) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true); setError("");
      try {
        if (metaLoadedAt.current && Date.now() - metaLoadedAt.current >= 60000) listCache.clear();
        const params = new URLSearchParams({ ...filters, search: filters.search.trim(), favorite: String(filters.favorite), limit: "12", summary: "1" });
        const data = await listCache.read(params.toString(), async () => {
          params.set("meta", Date.now() - metaLoadedAt.current < 60000 ? "0" : "1");
          const result = await requestJson(`/api/files?${params}`);
          return { ...result, metaFetchedAt: result.meta ? Date.now() : 0 };
        });
        if (!cancelled) {
          setFiles(data.files); setPagination(data.pagination);
          if (data.meta && data.metaFetchedAt >= metaLoadedAt.current) { setMeta(data.meta); setMetaReady(true); metaLoadedAt.current = data.metaFetchedAt; }
        }
      } catch (error) { if (!cancelled) setError(error.message); }
      finally { if (!cancelled) setLoading(false); }
    }, filters.search ? 250 : 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [filters, refresh, libraryOpen, listCache]);
  useEffect(() => {
    function shortcut(e) { if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setLibraryOpen(true); requestAnimationFrame(() => searchRef.current?.focus()); } }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 4000); return () => clearTimeout(timer); }, [toast]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("item");
    if (!id || !/^[a-f\d]{24}$/i.test(id)) return;
    const controller = new AbortController();
    detailCache.read(id, () => requestJson(`/api/files/${id}`)).then(data => { if (!controller.signal.aborted) setModal({ kind: "details", file: data.file }); }).catch(error => { if (!controller.signal.aborted) setModal({ kind: "loading", file: { _id: id }, error: error.message }); });
    return () => controller.abort();
  }, [detailCache]);

  async function openItem(file, editing = false) {
    const epoch = ++detailEpoch.current;
    setModal({ kind: "loading", file, editing });
    try {
      const data = await detailCache.read(file._id, () => requestJson(`/api/files/${file._id}`));
      if (epoch === detailEpoch.current) setModal({ kind: editing ? (data.file.kind === "note" ? "note" : "form") : "details", file: data.file });
    } catch (error) { if (epoch === detailEpoch.current) setModal({ kind: "loading", file, editing, error: error.message }); }
  }
  function editItem(file) { openItem(file, true); }
  function filter(changes) {
    setLibraryOpen(true);
    const next = { ...filters, ...changes, page: changes.page || 1 };
    if (Object.keys(next).every(key => next[key] === filters[key])) return;
    setLoading(true); setFilters(next);
  }
  function navigate(changes) { filter({ ...INITIAL_FILTERS, ...changes }); setMobileNav(false); }
  function reload(message) { listCache.clear(); detailCache.clear(); metaLoadedAt.current = 0; setMetaReady(false); setRefresh(n => n + 1); if (message) setToast(message); }
  async function saveFile(body, id) {
    await requestJson(id ? `/api/files/${id}` : "/api/files", { method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setModal(null); reload(id ? "Changes saved" : "Item added to your vault");
  }
  async function toggleFavorite(file) {
    if (busyId) return;
    setBusyId(file._id);
    try { await requestJson(`/api/files/${file._id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ favorite: !file.favorite }) }); reload(file.favorite ? "Removed from favorites" : "Added to favorites"); }
    catch (error) { setError(error.message); }
    finally { setBusyId(null); }
  }
  async function deleteFile() {
    setBusyId(modal.file._id); setDeleteError("");
    try { const result = await requestJson(`/api/files/${modal.file._id}`, { method: "DELETE" }); setModal(null); reload(result.cleanupPending ? "Item deleted. Cloudinary cleanup is pending and will be retried." : "Item deleted"); }
    catch (error) { setDeleteError(error.message); }
    finally { setBusyId(null); }
  }
  const hasFilters = filters.search || filters.category || filters.type || filters.tag || filters.favorite || filters.kind;
  const title = filters.favorite ? "Your favorites" : filters.category || (filters.kind === "note" ? "Notepad" : filters.kind === "upload" ? "Uploads" : "All files");

  return <div className={`app-shell ${chatOpen ? "with-chat" : ""}`}>
    {mobileNav && <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setMobileNav(false)}/>}
    <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`} aria-label="Main navigation">
      <Link className="brand" href="/" aria-label="FileVault home"><span className="brand-icon"><Icon name="folder" size={23}/></span>FileVault<span className="brand-dot">.</span></Link>
      <WorkspaceProfile/>
      <div className="nav-label">WORKSPACE</div>
      <nav className="main-nav"><Link href="/tasks"><Icon name="check" size={18}/>Tasks</Link><button className={!filters.favorite && !filters.category && !filters.kind ? "active" : ""} onClick={() => navigate({})}><Icon name="grid" size={18}/>All files{metaReady && <span className="nav-count">{meta.total}</span>}</button><button className={filters.favorite ? "active" : ""} onClick={() => navigate({ favorite: true })}><Icon name="star" size={18}/>Favorites{metaReady && <span className="nav-count">{meta.favorites}</span>}</button><button className={filters.kind === "note" ? "active" : ""} onClick={() => navigate({ kind: "note" })}><Icon name="edit" size={18}/>Notepad{metaReady && <span className="nav-count">{meta.notes || 0}</span>}</button><button className={filters.kind === "upload" ? "active" : ""} onClick={() => navigate({ kind: "upload" })}><Icon name="upload" size={18}/>Uploads{metaReady && <span className="nav-count">{meta.uploads || 0}</span>}</button><button onClick={() => { setChatOpen(true); setMobileNav(false); }} className={chatOpen ? "assistant-nav active" : "assistant-nav"}><Icon name="sparkles" size={18}/>Vault assistant<span className="ai-badge">AI</span></button></nav>
      {metaReady && <><div className="nav-label collection-label">COLLECTIONS<span>{meta.categories.length}</span></div>
      <nav className="collection-nav" aria-label="Collections">{meta.categories.length ? meta.categories.map((c, i) => <button key={c.name} className={filters.category === c.name ? "active" : ""} onClick={() => navigate({ category: c.name })}><span className={`collection-dot dot-${i % 5}`}/><span className="truncate">{c.name}</span><span className="nav-count">{c.count}</span></button>) : <p className="nav-empty">Collections appear when you save an item.</p>}</nav></>}
      <div className="sidebar-bottom"><div className="sidebar-tip"><Icon name="sparkles" size={22}/><strong>Less digging. More doing.</strong><p>Your next answer might already be in your vault.</p><button onClick={() => { setChatOpen(true); setMobileNav(false); }}>Ask your assistant<Icon name="arrow" size={15}/></button></div><div className="local-workspace"><span className="status-dot"/>Personal vault<span>Made for your mind</span></div></div>
    </aside>

    <div className="main-column">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Icon name="menu"/></button><Icon name="folder" size={16}/><span>Workspace</span><Icon name="chevron" size={13}/><strong>{title}</strong></div><button className="assistant-toggle" aria-expanded={chatOpen} onClick={() => setChatOpen(!chatOpen)}><Icon name="sparkles" size={16}/><span>Ask assistant</span></button></header>
      <main>
        <section className="page-heading"><div><span className="eyebrow">A PLACE FOR EVERYTHING</span><h1>{title}<span className="heading-dot">.</span></h1><p>{filters.kind === "note" ? "Write, format, and save your ideas. Your notes stay in your vault." : filters.kind === "upload" ? "Your files, safely kept together. View them here or download a copy." : "Good finds deserve a place to stay. Keep yours here."}</p></div><div className="page-actions"><a className="button secondary" href="#daily-todos" aria-expanded={dailyOpen} onClick={() => setDailyOpen(true)}><Icon name="check" size={17}/>Daily to-do</a><button className="button secondary" onClick={() => setModal({ kind: "note" })}><Icon name="edit" size={17}/>New note</button><button className="button secondary" onClick={() => setModal({ kind: "upload" })}><Icon name="upload" size={17}/>Upload files</button><button className="button primary" onClick={() => setModal({ kind: "form" })}><Icon name="plus" size={18}/>Add item</button></div></section>
        <DailyTodos active={dailyOpen} onClose={() => setDailyOpen(false)}/>
        <section className="assistant-banner"><div className="banner-art" aria-hidden="true"><Icon name="sparkles" size={31}/></div><div><span className="eyebrow">MEET YOUR VAULT ASSISTANT</span><h2>You saved it. Let’s find it.</h2><p>Ask a question and rediscover the links and ideas in your vault.</p></div><button className="button banner-button" onClick={() => setChatOpen(true)}>Let’s ask<Icon name="arrow" size={17}/></button><span className="banner-decoration" aria-hidden="true"/></section>
        {libraryOpen && metaReady && <section className="stats" aria-label="Vault overview"><div><span className="stat-icon blue"><Icon name="folder"/></span><div><span>Saved items</span><strong>{meta.total}<small>in your vault</small></strong></div></div><div><span className="stat-icon amber"><Icon name="star"/></span><div><span>Favorites</span><strong>{meta.favorites}<small>worth keeping close</small></strong></div></div><div><span className="stat-icon green"><Icon name="grid"/></span><div><span>Collections</span><strong>{meta.categories.length}<small>everything in its place</small></strong></div></div></section>}
        <section className="library" aria-labelledby="library-title"><div className="library-heading"><h2 id="library-title">{filters.kind === "note" ? "Your notes" : filters.kind === "upload" ? "Your uploads" : "Your library"} {libraryOpen && !loading && <span>{pagination.total}</span>}</h2><div className="library-controls"><button className="button secondary" aria-expanded={libraryOpen} onClick={() => setLibraryOpen(value => !value)}>{libraryOpen ? "Hide library" : "Show library"}</button>{libraryOpen && <><button className="button secondary" onClick={() => reload()}>Refresh library</button><div className="view-toggle" aria-label="Display style"><button aria-label="Grid view" aria-pressed={view === "grid"} className={view === "grid" ? "selected" : ""} onClick={() => setView("grid")}><Icon name="grid" size={16}/></button><button aria-label="List view" aria-pressed={view === "list"} className={view === "list" ? "selected" : ""} onClick={() => setView("list")}><Icon name="list" size={18}/></button></div></>}</div></div>
          {!libraryOpen && <p className="library-collapsed">Open your library to browse or search saved items.</p>}
          {libraryOpen && <><div className="toolbar"><div className="search-field"><Icon name="search" size={18}/><input ref={searchRef} aria-label="Search saved items" placeholder="Search titles, tags, notes…" value={filters.search} onChange={e => filter({ search: e.target.value })}/>{filters.search ? <button className="icon-button" aria-label="Clear search" onClick={() => filter({ search: "" })}><Icon name="close" size={15}/></button> : <kbd>⌘ K</kbd>}</div><select aria-label="Filter by file type" value={filters.type} onChange={e => filter({ type: e.target.value })}><option value="">All types</option>{Object.entries(TYPES).map(([key, info]) => <option value={key} key={key}>{info.label}</option>)}</select><select aria-label="Sort saved items" value={filters.sort} onChange={e => filter({ sort: e.target.value })}><option value="-updatedAt">Last updated</option><option value="-createdAt">Recently added</option><option value="title">Name: A–Z</option><option value="-title">Name: Z–A</option></select></div>
          {meta.tags.length > 0 && <div className="tag-filters"><span>Explore tags</span>{meta.tags.slice(0, 8).map(tag => <button key={tag} aria-pressed={filters.tag === tag} className={filters.tag === tag ? "active" : ""} onClick={() => filter({ tag: filters.tag === tag ? "" : tag })}>#{tag}</button>)}</div>}
          {hasFilters && <div className="filter-summary"><span>{loading ? "Searching…" : `${pagination.total} matching ${pagination.total === 1 ? "item" : "items"}`}{filters.category && ` in ${filters.category}`}{filters.tag && ` · #${filters.tag}`}</span><button onClick={() => navigate({})}>Clear filters<Icon name="close" size={13}/></button></div>}
          {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => { setLoading(true); reload(); }}>Try again</button></div>}
          {loading ? <div className="file-grid" aria-label="Loading your library" aria-busy="true">{Array.from({ length: 6 }, (_, i) => <div className="skeleton-card" key={i}><span/><span/><span/><span/></div>)}</div> : !error && files.length === 0 ? <div className="empty-state"><span className="empty-icon"><Icon name={hasFilters ? "search" : "folder"} size={32}/></span><h3>{hasFilters ? "Nothing here just yet" : "Start your collection"}</h3><p>{hasFilters ? "Try another keyword or clear your filters to see all your saved items." : "Save a useful link, add your notes, and make it easy to find again."}</p><button className="button primary" onClick={() => filters.kind ? setModal({ kind: filters.kind }) : hasFilters ? navigate({}) : setModal({ kind: "form" })}>{filters.kind === "note" ? "Write your first note" : filters.kind === "upload" ? "Upload your first file" : hasFilters ? "Clear filters" : "Save your first item"}<Icon name="plus" size={16}/></button></div> : !error && <div className={view === "grid" ? "file-grid" : "file-list"}>{files.map(file => {
            const info = TYPES[file.type] || TYPES.other;
            return <article className="file-card" key={file._id}><div className="card-top"><span className={`file-icon ${info.color}`}><Icon name={info.icon} size={24}/></span><span className="card-type">{info.label}</span><button className={`icon-button favorite-button ${file.favorite ? "is-favorite" : ""}`} aria-label={`${file.favorite ? "Remove" : "Add"} ${file.title} ${file.favorite ? "from" : "to"} favorites`} aria-pressed={file.favorite} disabled={busyId === file._id} onClick={() => toggleFavorite(file)}><Icon name="star" size={18}/></button></div><div className="card-content"><button className="card-title" onClick={() => openItem(file)}>{file.title}</button><p className="card-description">{file.description || (file.kind === "note" ? file.preview : file.kind === "upload" ? `${file.filename} · ${formatSize(file.size)}` : "Add a description to give this link a little context.")}</p><div className="card-tags"><span className="category-chip">{file.category || "General"}</span>{file.tags?.slice(0, 2).map(tag => <button key={tag} onClick={() => filter({ tag })}>#{tag}</button>)}{file.tags?.length > 2 && <span className="more-tags">+{file.tags.length - 2}</span>}</div></div><div className="card-footer"><span title={file.filename || file.url}>{file.kind === "note" ? "Saved note" : file.kind === "upload" ? formatSize(file.size) + " · Uploaded file" : domain(file.url)}</span><span className="card-date">{date(file.updatedAt)}</span>{file.kind === "upload" && <button className="upload-view-button" aria-label={`View ${file.title}`} onClick={() => openItem(file)}><Icon name="eye" size={15}/>View</button>}{file.kind !== "note" && itemHref(file) && <a href={itemHref(file)} target="_blank" rel="noopener noreferrer" aria-label={`${file.kind === "upload" ? "Download" : "Open"} ${file.title}`}><Icon name={file.kind === "upload" ? "download" : "external"} size={15}/></a>}<button className="icon-button edit-item" aria-label={`Edit ${file.title}`} onClick={() => editItem(file)}><Icon name="edit" size={15}/></button></div></article>;
          })}</div>}
          {!loading && !error && pagination.total > 0 && <div className="pagination"><span>Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} items</span><div><button disabled={pagination.page <= 1} onClick={() => filter({ page: pagination.page - 1 })} aria-label="Previous page"><Icon name="chevron" size={15} className="rotate"/></button><span>{pagination.page} / {pagination.pages}</span><button disabled={pagination.page >= pagination.pages} onClick={() => filter({ page: pagination.page + 1 })} aria-label="Next page"><Icon name="chevron" size={15}/></button></div></div>}
        </>}</section><footer className="main-footer"><span>A little more organized. A little more headspace.</span><span>FileVault</span></footer>
      </main>
    </div>
    <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)}/>
    {modal?.kind === "loading" && <Dialog title="Item details" onClose={() => { detailEpoch.current++; setModal(null); }}>{modal.error ? <><p role="alert" className="inline-error">{modal.error}</p><button className="button secondary" onClick={() => openItem(modal.file, modal.editing)}>Try again</button></> : <p role="status">Loading item…</p>}</Dialog>}
    {modal?.kind === "note" && <NoteEditor file={modal.file} categories={meta.categories} onClose={() => setModal(null)} onSave={saveFile}/>}
    {modal?.kind === "upload" && <UploadDialog categories={meta.categories} onClose={() => setModal(null)} onUploaded={() => reload("File uploaded to your vault")}/>}
    {modal?.kind === "form" && <ItemForm file={modal.file} categories={meta.categories} onClose={() => setModal(null)} onSave={saveFile}/>}
    {modal?.kind === "replace" && <ReplaceUploadDialog file={modal.file} onClose={() => setModal({ kind: "details", file: modal.file })} onReplaced={(file, cleanupPending) => { reload(cleanupPending ? "File replaced. Old file cleanup is pending and will be retried." : "File replaced. The old file has been removed."); setModal({ kind: "details", file }); }}/>}
    {modal?.kind === "details" && <ItemDetails file={modal.file} onClose={() => setModal(null)} onEdit={() => editItem(modal.file)} onReplace={() => setModal({ kind: "replace", file: modal.file })} onDelete={file => { setDeleteError(""); setModal({ kind: "delete", file }); }}/>}
    {modal?.kind === "delete" && <Dialog title="Delete saved item?" onClose={() => { if (!busyId) setModal(null); }}><p className="delete-copy">“{modal.file.title}” and its saved notes will be removed from your vault. {modal.file.kind === "upload" ? "The uploaded file will also be permanently deleted." : modal.file.kind === "note" ? "This note cannot be recovered after deletion." : "The original linked file will stay where it is."}</p>{deleteError && <p className="inline-error" role="alert">{deleteError}</p>}<div className="dialog-actions"><button className="button secondary" disabled={!!busyId} onClick={() => setModal(null)}>Keep item</button><button className="button danger-button" disabled={!!busyId} onClick={deleteFile}>{busyId ? "Deleting…" : "Delete item"}</button></div></Dialog>}
    {toast && <div className="toast" role="status"><Icon name="check" size={17}/>{toast}</div>}
  </div>;
}
