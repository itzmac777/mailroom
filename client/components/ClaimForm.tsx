"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

type Props = { mailDomain: string; tempMailEnabled?: boolean };
type Captcha = { id: string; question: string; token: string };

type ClaimMode = "temporary" | "permanent";

export function ClaimForm({ mailDomain, tempMailEnabled = false }: Props) {
  const tempEnabled = Boolean(tempMailEnabled);
  const [mode, setMode] = useState<ClaimMode>(tempEnabled ? "temporary" : "permanent");
  const [captcha, setCaptcha] = useState<Captcha | null>(null);
  const [local, setLocal] = useState("");
  const [durationHours, setDurationHours] = useState<1 | 24>(1);
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
    if (!tempEnabled && mode === "temporary") setMode("permanent");
  }, [mode, tempEnabled]);

  useEffect(() => {
    if (mode !== "permanent") return;
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
  }, [local, mode]);

  const statusClass = useMemo(() => availabilityState === "ok" ? "text-green-700" : availabilityState === "bad" ? "text-red-700" : "text-muted", [availabilityState]);

  async function submitPermanent(form: FormData) {
    return api<{ redirectTo?: string }>("/api/mailboxes", {
      method: "POST",
      body: JSON.stringify({
        inviteCode: form.get("inviteCode"),
        displayName: form.get("displayName"),
        local: form.get("local"),
        password: form.get("password"),
        captcha: {
          id: captcha?.id,
          token: captcha?.token,
          answer: form.get("captchaAnswer")
        }
      })
    });
  }

  async function submitTemporary(form: FormData) {
    return api<{ redirectTo?: string }>("/api/temp-mailboxes", {
      method: "POST",
      body: JSON.stringify({
        durationHours,
        captcha: {
          id: captcha?.id,
          token: captcha?.token,
          answer: form.get("captchaAnswer")
        }
      })
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!captcha) return;
    const form = new FormData(event.currentTarget);
    const useTemporary = tempEnabled && mode === "temporary";
    setBusy(true);
    setMessage(useTemporary ? "Creating temp inbox..." : "Creating mailbox...");
    setMessageState("");
    try {
      const result = useTemporary ? await submitTemporary(form) : await submitPermanent(form);
      window.location.href = result.redirectTo ?? (useTemporary ? "/temp" : "/dashboard");
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
        <p className="eyebrow">Claim mailbox</p>
        <strong>@{mailDomain}</strong>
      </div>

      {tempEnabled ? (
        <div className="grid grid-cols-2 border border-line bg-soft/50 p-1 text-sm font-extrabold">
          {(["temporary", "permanent"] as ClaimMode[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setMode(item);
                setMessage("");
                setMessageState("");
              }}
              className={`min-h-11 px-3 transition-colors ${mode === item ? "bg-white text-cta shadow-[0_10px_30px_rgba(17,17,17,0.06)]" : "text-muted hover:text-ink"}`}
            >
              {item === "temporary" ? "Temporary" : "Permanent"}
            </button>
          ))}
        </div>
      ) : null}

      {tempEnabled && mode === "temporary" ? (
        <div className="grid gap-4">
          <div className="border border-line bg-[#fbfaf7] p-4">
            <h2 className="text-xl font-extrabold tracking-[-0.02em] text-ink">Disposable inbox</h2>
            <p className="mt-2 text-sm leading-6 text-muted">Get a random receive-only address for signups, verification codes, and short tests. No login required.</p>
          </div>
          <label className="label">Lifetime
            <div className="grid grid-cols-2 border border-ink bg-white p-1">
              {[1, 24].map((hours) => (
                <button
                  key={hours}
                  type="button"
                  onClick={() => setDurationHours(hours as 1 | 24)}
                  className={`min-h-11 text-sm font-extrabold transition-colors ${durationHours === hours ? "bg-cta text-white" : "text-muted hover:text-ink"}`}
                >
                  {hours === 1 ? "1 hour" : "24 hours"}
                </button>
              ))}
            </div>
          </label>
        </div>
      ) : (
        <div className="grid gap-4">
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
        </div>
      )}

      <label className="label">Captcha <span className="text-muted">{captcha?.question ?? "Loading..."}</span><input className="field" name="captchaAnswer" inputMode="numeric" required /></label>
      <button className="button button-primary w-full" type="submit" disabled={busy || !captcha}>
        {busy ? "Creating..." : tempEnabled && mode === "temporary" ? "Create temp inbox" : "Create permanent mailbox"}
      </button>
      <p className={`min-h-6 text-sm font-bold ${messageState === "bad" ? "text-red-700" : "text-muted"}`}>{message}</p>
    </form>
  );
}