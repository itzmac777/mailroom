"use client";

import { useState } from "react";
import { api } from "@/lib/api";

export function LoginForm({ mailDomain }: { mailDomain: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("Signing in...");
    try {
      const result = await api<{ redirectTo?: string }>("/api/login", {
        method: "POST",
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") })
      });
      window.location.href = result.redirectTo ?? "/dashboard";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel grid w-full max-w-[520px] gap-4 p-7" onSubmit={submit}>
      <div className="relative mb-3 h-12 w-16 border border-ink bg-[#f2eee4] before:absolute before:left-0 before:right-0 before:top-3 before:h-px before:rotate-[27deg] before:bg-ink after:absolute after:left-0 after:right-0 after:top-3 after:h-px after:-rotate-[27deg] after:bg-ink" />
      <p className="eyebrow">Mailbox login</p>
      <h1 className="text-[clamp(34px,4.8vw,62px)] font-extrabold leading-none">Open your control panel.</h1>
      <label className="label">Email<input className="field" name="email" type="email" autoComplete="email" placeholder={`you@${mailDomain}`} required /></label>
      <label className="label">Portal password<input className="field" name="password" type="password" autoComplete="current-password" required /></label>
      <button className="button button-primary w-full" type="submit" disabled={busy}>{busy ? "Opening..." : "Open dashboard"}</button>
      <p className="min-h-6 text-sm font-bold text-red-700">{message}</p>
    </form>
  );
}
