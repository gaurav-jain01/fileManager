"use client";

import { useState } from "react";
import Icon from "@/components/Icon";

export default function LoginForm({ next, configured }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not sign in. Please try again.");
      window.location.replace(next);
    } catch (error) {
      setError(error.message || "Could not connect. Please try again.");
      setBusy(false);
    }
  }

  return <main className="auth-page">
    <section className="auth-card" aria-labelledby="login-title">
      <a className="auth-brand" href="/login"><span><Icon name="folder" size={26} /></span>FileVault</a>
      <p className="auth-eyebrow">YOUR PRIVATE WORKSPACE</p>
      <h1 id="login-title">Welcome back.</h1>
      <p className="auth-description">Sign in to your files, notes, and daily plans.</p>
      {!configured && <div className="auth-notice" role="status">Set up your workspace account on the server with <code>npm run auth:setup</code>, then restart FileVault to sign in.</div>}
      <form onSubmit={submit}>
        <label htmlFor="email">Email address</label>
        <input id="email" name="email" type="email" autoComplete="username" placeholder="you@example.com" required maxLength={254} disabled={busy || !configured} />
        <label htmlFor="password">Password</label>
        <div className="auth-password">
          <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" required maxLength={128} disabled={busy || !configured} />
          <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}><Icon name="eye" size={19} /></button>
        </div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="auth-submit" type="submit" disabled={busy || !configured}>{busy ? "Signing in…" : "Sign in"}<Icon name="arrow" size={18} /></button>
      </form>
      <p className="auth-footnote">A private space for everything you want to keep.</p>
    </section>
  </main>;
}
