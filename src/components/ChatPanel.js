"use client";
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { safeSourceUrl } from "@/lib/files.mjs";

const prompts = ["What’s in my vault?", "Show my favorites", "Find my research notes"];
export default function ChatPanel({ open, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(null);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const pending = useRef(false);
  const controller = useRef(null);
  useEffect(() => {
    if (!open || mode !== null) return;
    const abort = new AbortController();
    fetch("/api/chat", { signal: abort.signal }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(data => setMode(data.mode)).catch(() => {});
    return () => abort.abort();
  }, [open, mode]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, busy, error]);
  async function send(question = input) {
    const content = question.trim();
    if (!content || pending.current) return;
    pending.current = true;
    setBusy(true); setError(""); setInput("");
    const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));
    setMessages(current => [...current, { role: "user", content }]);
    controller.current = new AbortController();
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.current.signal, body: JSON.stringify({ message: content, history }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not get an answer. Please try again.");
      setMessages(current => [...current, { role: "assistant", content: data.answer, sources: data.sources, mode: data.mode, notice: data.notice }]);
    } catch (error) {
      if (error.name !== "AbortError") { setError(error.message); setInput(content); }
    } finally { pending.current = false; setBusy(false); }
  }
  return <aside className={`chat-panel ${open ? "is-open" : ""}`} aria-label="Vault assistant" hidden={!open}>
    <div className="chat-heading"><span className="assistant-icon"><Icon name="sparkles"/></span><div><h2>Vault assistant</h2><span><i className="status-dot"/>{mode === "ai" ? "AI · Connected to your vault" : mode === "search" ? "Search mode · Your saved information" : "Your saved information"}</span></div><button className="icon-button" onClick={onClose} aria-label="Close assistant"><Icon name="close" size={18}/></button></div>
    <div className="chat-context"><Icon name="folder" size={15}/><span>Links, descriptions, tags & notes</span>{messages.length > 0 && <button disabled={busy} onClick={() => { setMessages([]); setError(""); }} title="Start a new conversation" aria-label="New conversation"><Icon name="plus" size={16}/></button>}</div>
    <div className="chat-messages" ref={scrollRef} role="log" aria-live="polite" aria-relevant="additions text">
      {messages.length === 0 && <div className="chat-welcome"><div className="welcome-orbit"><Icon name="sparkles" size={30}/></div><span className="eyebrow">A LITTLE LESS SEARCHING</span><h3>Your knowledge.<br/>A conversation away.</h3><p>Find that link, revisit an idea, or ask about the notes you’ve saved.</p><div className="chat-prompts">{prompts.map(prompt => <button key={prompt} disabled={busy} onClick={() => send(prompt)}>{prompt}<Icon name="arrow" size={15}/></button>)}</div></div>}
      {messages.map((message, index) => <div className={`chat-message ${message.role}`} key={index}>{message.role === "assistant" && <div className="message-label"><Icon name="sparkles" size={14}/>{message.mode === "ai" ? "Vault assistant" : "Vault search"}</div>}{message.notice && <p className="chat-notice">{message.notice}</p>}<p className="message-text">{message.content}</p>{message.sources?.length > 0 && <div className="chat-sources"><span>SAVED SOURCES</span>{message.sources.map((source, index) => safeSourceUrl(source.url) ? <a key={source.id} href={safeSourceUrl(source.url)} target="_blank" rel="noopener noreferrer"><span className="source-number">{index + 1}</span><span>{source.title}</span><Icon name="external" size={13}/></a> : <span key={source.id}>{source.title}</span>)}</div>}</div>)}
      {busy && <div className="thinking"><Icon name="sparkles" size={16}/><span>Looking through your vault<span className="thinking-dots">…</span></span></div>}
      {error && <p className="inline-error" role="alert">{error} Your question is ready to retry below.</p>}
    </div>
    <div className="chat-compose">{mode === "search" && <p className="mode-note">Search mode is ready. Add an OpenAI API key on the server to enable AI answers.</p>}<form onSubmit={e => { e.preventDefault(); send(); }}><textarea ref={inputRef} aria-label="Ask about your saved items" placeholder="Ask about your saved items…" maxLength={2000} rows={2} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}/><button type="submit" className="send-button" disabled={busy || !input.trim()} aria-label="Send question"><Icon name="arrow" size={18}/></button></form><p>Answers use saved information, not linked document contents.</p></div>
  </aside>;
}
