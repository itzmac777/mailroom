"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

type Props = { mailDomain: string };
type Captcha = { id: string; question: string; token: string };

export function ClaimForm({ mailDomain }: Props) {
  const [captcha, setCaptcha] = useState<Captcha | null>(null);
  const [local, setLocal] = useState("");
  const [availability, setAvailability] = useState("Type an address to check availability.");
  const [availabilityState, setAvailabilityState] = useState<"" | "ok" | "bad">("");
  const [message, setMessage] = useState("");
  const [messageState, setMessageState] = useState<"" | "ok" | "bad">("");
  const [busy, setBusy] = useState(false);

  async function refreshCaptcha() {
    setCaptcha(await api<Captcha>("/api/captcha"));
  }

  useEffect(() => {
    refreshCaptcha().catch((error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    const value = local.trim().toLowerCase();
    if (!value) {
      setAvailability("Type an address to check availability.");
      setAvailabilityState("");
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const result = await api<{ available: boolean; email: string; reason?: string }>(`/api/mailboxes/check?local=${encodeURIComponent(value)}`);
        setAvailability(result.available ? `${result.email} is available.` : result.reason ?? "Unavailable.");
        setAvailabilityState(result.available ? "ok" : "bad");
      } catch (error) {
        setAvailability(error instanceof Error ? error.message : "Could not check address.");
        setAvailabilityState("bad");
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [local]);

  const statusClass = useMemo(() => availabilityState === "ok" ? "text-green-700" : availabilityState === "bad" ? "text-red-700" : "text-muted", [availabilityState]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!captcha) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("Creating mailbox...");
    setMessageState("");
    try {
      const result = await api<{ redirectTo?: string }>("/api/mailboxes", {
        method: "POST",
        body: JSON.stringify({
          inviteCode: form.get("inviteCode"),
          displayName: form.get("displayName"),
          local: form.get("local"),
          password: form.get("password"),
          captcha: {
            id: captcha.id,
            token: captcha.token,
            answer: form.get("captchaAnswer")
          }
        })
      });
      window.location.href = result.redirectTo ?? "/dashboard";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Mailbox creation failed.");
      setMessageState("bad");
      refreshCaptcha().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel grid gap-4 p-7" onSubmit={submit}>
      <div className="flex items-start justify-between gap-4">
        <p className="eyebrow">New mailbox</p>
        <strong>@{mailDomain}</strong>
      </div>
      <label className="label">Invite code<input className="field" name="inviteCode" autoComplete="one-time-code" placeholder="PASTE-CODE" required /></label>
      <label className="label">Display name<input className="field" name="displayName" autoComplete="name" placeholder="Alex Morgan" required /></label>
      <label className="label">Email address
        <div className="grid grid-cols-[minmax(0,1fr)_auto] border border-ink bg-[#fffef9] max-md:grid-cols-1">
          <input className="min-h-12 min-w-0 border-0 bg-transparent px-3" name="local" autoComplete="username" placeholder="alex" value={local} onChange={(event) => setLocal(event.target.value)} required />
          <span className="px-3 py-3 text-muted max-md:pt-0">@{mailDomain}</span>
        </div>
      </label>
      <p className={`min-h-6 text-sm font-bold ${statusClass}`}>{availability}</p>
      <label className="label">Password<input className="field" name="password" type="password" autoComplete="new-password" placeholder="12+ chars, mixed case, number" required /></label>
      <label className="label">Captcha <span className="text-muted">{captcha?.question ?? "Loading..."}</span><input className="field" name="captchaAnswer" inputMode="numeric" required /></label>
      <button className="button button-primary w-full" type="submit" disabled={busy || !captcha}>{busy ? "Creating..." : "Create mailbox"}</button>
      <p className={`min-h-6 text-sm font-bold ${messageState === "bad" ? "text-red-700" : "text-muted"}`}>{message}</p>
    </form>
  );
}
