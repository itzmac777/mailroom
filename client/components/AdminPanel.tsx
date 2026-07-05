"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { AdminSummary } from "@/lib/types";

export function AdminPanel() {
  const [token, setToken] = useState("");
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [message, setMessage] = useState("Enter the admin token and refresh.");
  const [busy, setBusy] = useState(false);

  async function refresh(currentToken = token) {
    const data = await api<AdminSummary>("/api/admin/summary", { headers: { "x-admin-token": currentToken } });
    setSummary(data);
    setMessage("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("Generating invite...");
    try {
      const result = await api<{ invite: { code: string } }>("/api/admin/invites", {
        method: "POST",
        headers: { "x-admin-token": token },
        body: JSON.stringify({
          note: form.get("note"),
          maxUses: form.get("maxUses"),
          expiresInDays: form.get("expiresInDays")
        })
      });
      setMessage(`Invite created: ${result.invite.code}`);
      await refresh(token);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create invite.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid grid-cols-[minmax(0,0.78fr)_minmax(420px,1fr)] gap-8 p-12 max-lg:grid-cols-1 max-md:p-5">
      <form className="panel grid gap-4 p-7" onSubmit={submit}>
        <div className="flex items-start justify-between gap-4"><p className="eyebrow">Admin</p><strong>Invite control</strong></div>
        <h1 className="text-[clamp(34px,4.8vw,62px)] font-extrabold leading-none">Create invites.</h1>
        <label className="label">Admin token<input className="field" value={token} onChange={(event) => setToken(event.target.value)} type="password" autoComplete="off" required /></label>
        <label className="label">Invite note<input className="field" name="note" placeholder="Friend, team, beta batch" /></label>
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <label className="label">Max uses<input className="field" name="maxUses" type="number" min="1" max="10" defaultValue="1" /></label>
          <label className="label">Expires in days<input className="field" name="expiresInDays" type="number" min="1" max="365" defaultValue="30" /></label>
        </div>
        <button className="button button-primary w-full" type="submit" disabled={busy}>{busy ? "Generating..." : "Generate invite"}</button>
        <p className="min-h-6 text-sm font-bold text-muted">{message}</p>
      </form>

      <div className="panel min-h-[420px] p-7">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div><p className="eyebrow">Recent activity</p><h2 className="text-2xl font-extrabold">Invites and accounts</h2></div>
          <button className="button button-secondary" type="button" onClick={() => refresh().catch((error) => setMessage(error.message))}>Refresh</button>
        </div>
        {summary ? (
          <div>
            <div className={`mb-5 grid ${summary.tempMailEnabled ? "grid-cols-4" : "grid-cols-3"} gap-px border border-ink bg-ink max-md:grid-cols-1`}>
              <div className="grid gap-1 bg-paper p-4"><span className="text-xs font-bold uppercase text-muted">Dry run</span><strong>{summary.dryRun ? "On" : "Off"}</strong></div>
              <div className="grid gap-1 bg-paper p-4"><span className="text-xs font-bold uppercase text-muted">Permanent</span><strong>{summary.mailboxCounts?.permanent ?? summary.mailboxes.length}</strong></div>
              {summary.tempMailEnabled ? <div className="grid gap-1 bg-paper p-4"><span className="text-xs font-bold uppercase text-muted">Temp active</span><strong>{summary.mailboxCounts?.temporary ?? 0}</strong></div> : null}
              <div className="grid gap-1 bg-paper p-4"><span className="text-xs font-bold uppercase text-muted">Invites</span><strong>{summary.invites.length}</strong></div>
            </div>
            <div className="grid border-t border-line">
              {summary.invites.length ? summary.invites.map((invite) => (
                <div key={invite.code} className="grid grid-cols-[minmax(120px,1fr)_auto_minmax(90px,1fr)] gap-3 border-b border-line py-3 text-sm max-md:grid-cols-1">
                  <strong>{invite.code}</strong><span>{invite.uses}/{invite.maxUses} used</span><span className="break-words text-muted">{invite.note}</span>
                </div>
              )) : <p className="text-muted">No invites yet.</p>}
            </div>
          </div>
        ) : <p className="text-muted">{message}</p>}
      </div>
    </section>
  );
}


