"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { dateInZone, shiftDay } from "@/lib/daily-todos.mjs";
import { createRequestCache } from "@/lib/request-cache.mjs";

async function jsonRequest(url, options) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const data = await response.json();
  if (!response.ok) { const error = new Error(data.error || "Could not update your daily list. Please try again."); error.status = response.status; throw error; }
  return data;
}
const shortDate = day => new Date(`${day}T12:00:00Z`).toLocaleDateString("en", { timeZone: "UTC", month: "short", day: "numeric" });
const fullDate = day => new Date(`${day}T12:00:00Z`).toLocaleDateString("en", { timeZone: "UTC", weekday: "long", month: "short", day: "numeric", year: "numeric" });

function TodoRow({ todo, editable, busy, onChange, onCopy }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(todo.title);
  const [deleting, setDeleting] = useState(false);
  return <li className={`daily-row ${todo.done ? "daily-done" : ""}`}>
    <input type="checkbox" checked={todo.done} disabled={!editable || busy} aria-label={`Complete daily task: ${todo.title}`} onChange={event => onChange(todo._id, { done: event.target.checked })}/>
    {editing && editable ? <form className="daily-edit" onSubmit={async event => { event.preventDefault(); if (await onChange(todo._id, { title })) setEditing(false); }}>
      <input aria-label="Edit daily task title" required maxLength={200} value={title} disabled={busy} onChange={event => setTitle(event.target.value)} autoFocus/>
      <button disabled={busy} type="submit">Save</button><button disabled={busy} type="button" onClick={() => setEditing(false)}>Cancel</button>
    </form> : <span className="daily-row-title">{todo.title}</span>}
    {!editing && editable && <div className="daily-row-actions">{deleting ? <><span>Remove?</span><button disabled={busy} onClick={() => onChange(todo._id, null)}>Yes</button><button disabled={busy} onClick={() => setDeleting(false)}>Keep</button></> : <><button className="icon-button" disabled={busy} aria-label={`Edit daily task: ${todo.title}`} onClick={() => { setTitle(todo.title); setEditing(true); }}><Icon name="edit" size={15}/></button><button className="icon-button" disabled={busy} aria-label={`Remove daily task: ${todo.title}`} onClick={() => setDeleting(true)}><Icon name="trash" size={15}/></button></>}</div>}
    {!editable && !todo.done && <button className="daily-copy" disabled={busy} onClick={() => onCopy(todo.title)}>Add to today<Icon name="plus" size={13}/></button>}
  </li>;
}

function ProgressChart({ buckets, mode, day }) {
  const max = Math.max(1, ...buckets.map(bucket => bucket.total));
  const totals = buckets.reduce((sum, bucket) => ({ total: sum.total + bucket.total, done: sum.done + bucket.done }), { total: 0, done: 0 });
  return <>
    <div className="daily-chart-summary"><strong>{totals.done}<span> / {totals.total}</span></strong><span>completed · {totals.total ? Math.round(totals.done / totals.total * 100) : 0}%</span></div>
    <div className="daily-chart" aria-label={`${mode === "weekly" ? "Weekly" : "Daily"} task completion chart`}>
      {buckets.map(bucket => {
        const label = mode === "weekly" ? `${shortDate(bucket.day)}–${shortDate(bucket.end)}` : fullDate(bucket.day);
        const description = `${label}: ${bucket.done} completed, ${bucket.remaining} unfinished, ${bucket.total} total`;
        return <div className="daily-chart-column" key={bucket.day} tabIndex={0} aria-label={description}>
          <span className="daily-chart-value">{bucket.total}</span>
          <div className="daily-chart-track"><div className="daily-chart-stack" style={{ height: `${bucket.total / max * 100}%` }}><span className="daily-bar-remaining" style={{ flex: bucket.remaining }}/><span className="daily-bar-done" style={{ flex: bucket.done }}/></div></div>
          <span className="daily-chart-label">{shortDate(bucket.day)}</span>
          <span className="daily-chart-tooltip" role="tooltip">{description}</span>
        </div>;
      })}
    </div>
    <div className="daily-chart-legend"><span><i className="daily-bar-done"/>Completed</span><span><i className="daily-bar-remaining"/>Unfinished</span></div>
    <p className="daily-chart-note">{mode === "weekly" ? "8 weeks · Monday–Sunday" : "7 days"} · Through {shortDate(day)}. {totals.total === 0 ? "Your progress will appear as you add tasks." : "Hover or focus a bar for details."}</p>
    <details className="daily-chart-data"><summary>View chart data</summary><table><caption>{mode === "weekly" ? "Weekly" : "Daily"} totals through {fullDate(day)}</caption><thead><tr><th scope="col">{mode === "weekly" ? "Week of" : "Day"}</th><th scope="col">Done</th><th scope="col">Unfinished</th></tr></thead><tbody>{buckets.map(bucket => <tr key={bucket.day}><th scope="row">{shortDate(bucket.day)}</th><td>{bucket.done}</td><td>{bucket.remaining}</td></tr>)}</tbody></table></details>
  </>;
}

export default function DailyTodos({ active = true, onClose }) {
  const [cache] = useState(() => createRequestCache());
  const [clock, setClock] = useState(null);
  const [selectedDay, setSelectedDay] = useState("");
  const [mode, setMode] = useState("none");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const epoch = useRef(0);
  const input = useRef(null);
  const today = clock?.today;
  const timeZone = clock?.timeZone;
  const day = selectedDay || today;

  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const now = new Date();
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      setClock({ now: now.getTime(), today: dateInZone(timeZone, now), timeZone });
    };
    tick();
    const timer = setInterval(tick, 1000);
    const refresh = () => { tick(); setRevision(value => value + 1); };
    window.addEventListener("focus", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [active]);

  useEffect(() => {
    if (!active || !day || !timeZone || lock.current || today !== dateInZone(timeZone)) return;
    const controller = new AbortController();
    const current = ++epoch.current;
    const url = `/api/daily-todos?${new URLSearchParams({ day, timeZone, mode, page, today })}`;
    cache.read(url, () => jsonRequest(url)).then(result => {
      if (current !== epoch.current || controller.signal.aborted) return;
      setData(result); setError(""); setLoading(false);
    }).catch(error => {
      if (current !== epoch.current || controller.signal.aborted) return;
      setError(error.message); setLoading(false);
    });
    return () => controller.abort();
  }, [active, day, today, timeZone, mode, page, revision, cache, busy]);

  function refresh() { cache.clear(); setLoading(true); setRevision(value => value + 1); }
  function chooseDay(value) { if (!value || value > today || value < "1900-01-01") return; setSelectedDay(value === today ? "" : value); setPage(1); setLoading(true); setNotice(""); setActionError(""); }
  async function mutate(url, method, body) {
    if (lock.current) return false;
    lock.current = true; epoch.current++; setBusy(true); setActionError(""); setNotice("");
    const previous = data;
    if (method === "PATCH" && body?.done !== undefined) {
      const id = url.split("/").pop();
      const task = data.todos.find(todo => todo._id === id);
      const change = Number(body.done) - Number(task.done);
      setData({ ...data, todos: data.todos.map(todo => todo._id === id ? { ...todo, done: body.done } : todo), summary: { ...data.summary, done: data.summary.done + change }, buckets: data.buckets.map(bucket => day >= bucket.day && day <= bucket.end ? { ...bucket, done: bucket.done + change, remaining: bucket.remaining - change } : bucket) });
    }
    try {
      const result = await jsonRequest(url, { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      cache.clear();
      if (method === "PATCH") {
        const old = previous.todos.find(todo => todo._id === result.todo._id);
        const change = Number(result.todo.done) - Number(old.done);
        const next = { ...previous, todos: previous.todos.map(todo => todo._id === result.todo._id ? result.todo : todo), summary: { ...previous.summary, done: previous.summary.done + change }, buckets: previous.buckets.map(bucket => day >= bucket.day && day <= bucket.end ? { ...bucket, done: bucket.done + change, remaining: bucket.remaining - change } : bucket) };
        setData(next);
        const key = `/api/daily-todos?${new URLSearchParams({ day, timeZone, mode, page, today })}`;
        await cache.read(key, () => next);
      } else refresh();
      return true;
    } catch (error) { setData(previous); setActionError(error.message); if (error.status === 409) refresh(); return false; }
    finally { lock.current = false; setBusy(false); }
  }
  async function addTodo(value, copying = false) {
    const success = await mutate("/api/daily-todos", "POST", { title: value, timeZone, day: today });
    if (success) {
      if (!copying) { setTitle(""); setPage(1); requestAnimationFrame(() => input.current?.focus()); }
      setNotice(copying ? "Added to today. The original stays in your history." : "Added to today's list.");
    }
  }
  const currentData = data?.day === day && data?.today === today;
  const ready = currentData && !loading && !error;
  const isToday = day === today;
  const seconds = data && clock ? Math.max(0, Math.ceil((new Date(data.closesAt).getTime() - clock.now) / 1000)) : 0;
  const countdown = `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const percent = ready && data.summary.total ? Math.round(data.summary.done / data.summary.total * 100) : 0;

  return <section hidden={!active} className="daily-section" id="daily-todos" aria-labelledby="daily-heading" tabIndex={-1}>
    <div className="section-tools"><button disabled={busy} onClick={refresh}>Refresh to-dos</button>{onClose && <button disabled={busy} onClick={onClose}>Hide to-dos</button>}</div>
    <div className="daily-heading"><div><span className="eyebrow">ONE DAY AT A TIME</span><h2 id="daily-heading">Daily to-do list<span className="heading-dot">.</span></h2><p>A fresh list at midnight. A record of every day.</p></div><span className="daily-timer"><Icon name="clock" size={16}/><span>{currentData ? `${countdown} until midnight` : "Your day, your pace"}<small>{timeZone || "Local time"}</small></span></span></div>
    <div className="daily-layout"><div className="daily-checklist">
      <div className="daily-date-nav"><button className="icon-button" aria-label="Previous day" disabled={!day || busy || day <= "1900-01-01"} onClick={() => chooseDay(shiftDay(day, -1))}><Icon name="chevron" size={16} className="rotate"/></button><label><span>{isToday ? "Today" : "Day history"}</span><input aria-label="To-do date" type="date" min="1900-01-01" max={today || undefined} value={day || ""} disabled={busy || !day} onChange={event => chooseDay(event.target.value)}/></label><button className="icon-button" aria-label="Next day" disabled={!day || isToday || busy} onClick={() => chooseDay(shiftDay(day, 1))}><Icon name="chevron" size={16}/></button>{!isToday && day && <button className="daily-today" disabled={busy} onClick={() => chooseDay(today)}>Today</button>}</div>
      {isToday ? <form className="daily-add" onSubmit={event => { event.preventDefault(); addTodo(title); }}><input ref={input} aria-label="New daily to-do" placeholder="What will you do today?" required maxLength={200} value={title} disabled={busy || !ready} onChange={event => setTitle(event.target.value)}/><button className="button primary" disabled={busy || !ready} aria-label="Add daily to-do"><Icon name="plus" size={17}/>Add</button></form> : <p className="daily-history-note">This day is saved. Bring unfinished tasks into today with “Add to today”.</p>}
      {actionError && <p className="inline-error" role="alert">{actionError}</p>}
      {notice && <p className="daily-notice" role="status">{notice}</p>}
      {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={refresh}>Try again</button></div>}
      {!ready && !error && <p className="daily-empty" role="status">Loading your daily list…</p>}
      {ready && <><div className="daily-completion"><span>{data.summary.done} of {data.summary.total} completed</span><strong>{percent}%</strong></div><div className="daily-progress" role="progressbar" aria-label="Day completion" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${percent}%` }}/></div>
        {data.todos.length ? <ul className="daily-list">{data.todos.map(todo => <TodoRow key={todo._id} todo={todo} busy={busy || loading} editable={isToday && new Date(todo.closesAt).getTime() > clock.now} onChange={(id, body) => mutate(`/api/daily-todos/${id}`, body ? "PATCH" : "DELETE", body)} onCopy={value => addTodo(value, true)}/>)}</ul> : <div className="daily-empty"><Icon name="check" size={25}/><p>{isToday ? "A little focus goes a long way." : "No tasks recorded for this day."}</p><small>{isToday ? "Add your first task for today above." : "Choose another date to see your history."}</small></div>}
        {data.pagination.pages > 1 && <div className="daily-pagination"><button disabled={page <= 1 || busy} onClick={() => { setPage(page - 1); setLoading(true); }}>Previous</button><span>{data.pagination.page} / {data.pagination.pages}</span><button disabled={page >= data.pagination.pages || busy} onClick={() => { setPage(page + 1); setLoading(true); }}>Next</button></div>}
      </>}
    </div><div className="daily-insights"><div className="daily-insights-heading"><h3>Your progress</h3><div className="todo-filters" aria-label="Progress period">{["daily", "weekly"].map(value => <button key={value} aria-pressed={mode === value} disabled={busy} onClick={() => { if (mode !== value) { setMode(value); setLoading(true); } }}>{value === "daily" ? "Daily" : "Weekly"}</button>)}</div></div>
      {mode === "none" ? <p className="daily-empty">Choose Daily or Weekly to view your progress.</p> : ready ? <ProgressChart buckets={data.buckets} mode={mode} day={day}/> : <p className="daily-empty">{error ? "Progress is unavailable. Try again." : "Loading progress…"}</p>}
    </div></div>
  </section>;
}
