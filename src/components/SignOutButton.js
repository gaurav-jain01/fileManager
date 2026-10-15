"use client";

import { useState } from "react";

export default function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Could not sign out. Try again.");
      // A full navigation clears the workspace's in-memory data caches.
      window.location.replace("/login");
    } catch {
      setError("Could not sign out. Try again.");
      setBusy(false);
    }
  }
  return <><button className="sign-out-button" onClick={signOut} disabled={busy}>{busy ? "Signing out…" : "Sign out"}</button>{error && <span role="alert">{error}</span>}</>;
}
