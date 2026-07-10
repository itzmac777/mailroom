"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { RotatorAccount, RotatorAuditEntry, RotatorDevice } from "@/lib/types";

type RotatorData = {
  accounts: RotatorAccount[];
  devices: RotatorDevice[];
  audit: RotatorAuditEntry[];
};

const statusTone: Record<RotatorAccount["status"], string> = {
  active: "border-green-200 bg-green-50 text-green-700",
  needs_relogin: "border-amber-200 bg-amber-50 text-amber-800",
  unknown: "border-line bg-soft text-muted"
};

function formatDate(value?: string): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function RotatorAdminPanel() {
  const [token, setToken] = useState("");
  const [data, setData] = useState<RotatorData>({ accounts: [], devices: [], audit: [] });
  const [message, setMessage] = useState("Enter the admin token and refresh.");
  const [busy, setBusy] = useState(false);
  const [issuedToken, setIssuedToken] = useState<{ name: string; token: string } | null>(null);

  const accountById = useMemo(() => {
    return new Map(data.accounts.map((account) => [account.id, account]));
  }, [data.accounts]);

  const deviceById = useMemo(() => {
    return new Map(data.devices.map((device) => [device.id, device]));
  }, [data.devices]);

  async function refresh(currentToken = token) {
    setBusy(true);
    setMessage("Refreshing...");
    try {
      const [accountsResult, devicesResult, auditResult] = await Promise.all([
        api<{ accounts: RotatorAccount[] }>("/api/rotator/accounts", { headers: { "x-admin-token": currentToken } }),
        api<{ devices: RotatorDevice[] }>("/api/rotator/devices", { headers: { "x-admin-token": currentToken } }),
        api<{ audit: RotatorAuditEntry[] }>("/api/rotator/audit", { headers: { "x-admin-token": currentToken } })
      ]);
      setData({
        accounts: accountsResult.accounts,
        devices: devicesResult.devices,
        audit: auditResult.audit
      });
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load rotator data.");
    } finally {
      setBusy(false);
    }
  }

  async function createAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = new FormData(form);
    setBusy(true);
    setMessage("Creating account...");
    try {
      await api<{ account: RotatorAccount }>("/api/rotator/accounts", {
        method: "POST",
        headers: { "x-admin-token": token },
        body: JSON.stringify({ label: body.get("label"), email: body.get("email") })
      });
      form.reset();
      await refresh(token);
      setMessage("Account created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create account.");
    } finally {
      setBusy(false);
    }
  }

  async function updateAccount(account: RotatorAccount, form: HTMLFormElement) {
    const body = new FormData(form);
    setBusy(true);
    setMessage("Saving account...");
    try {
      await api<{ account: RotatorAccount }>(`/api/rotator/accounts/${encodeURIComponent(account.id)}`, {
        method: "PATCH",
        headers: { "x-admin-token": token },
        body: JSON.stringify({ label: body.get("label"), email: body.get("email") })
      });
      await refresh(token);
      setMessage("Account saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save account.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount(account: RotatorAccount) {
    if (!confirm(`Delete ${account.label}? This also removes its saved session snapshot.`)) return;
    setBusy(true);
    setMessage("Deleting account...");
    try {
      await api<{ deleted: boolean }>(`/api/rotator/accounts/${encodeURIComponent(account.id)}`, {
        method: "DELETE",
        headers: { "x-admin-token": token }
      });
      await refresh(token);
      setMessage("Account deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete account.");
    } finally {
      setBusy(false);
    }
  }

  async function createDevice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = new FormData(form);
    const name = String(body.get("name") || "");
    setBusy(true);
    setMessage("Creating device...");
    try {
      const result = await api<{ device: RotatorDevice; token: string }>("/api/rotator/devices", {
        method: "POST",
        headers: { "x-admin-token": token },
        body: JSON.stringify({ name })
      });
      setIssuedToken({ name: result.device.name, token: result.token });
      form.reset();
      await refresh(token);
      setMessage("Device token issued.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create device.");
    } finally {
      setBusy(false);
    }
  }

  async function copyIssuedToken() {
    if (!issuedToken) return;
    try {
      await navigator.clipboard.writeText(issuedToken.token);
      setMessage("Device token copied.");
    } catch {
      setMessage("Could not copy device token.");
    }
  }

  async function revokeDevice(device: RotatorDevice) {
    if (!confirm(`Revoke ${device.name}?`)) return;
    setBusy(true);
    setMessage("Revoking device...");
    try {
      await api<{ deleted: boolean }>(`/api/rotator/devices/${encodeURIComponent(device.id)}`, {
        method: "DELETE",
        headers: { "x-admin-token": token }
      });
      await refresh(token);
      setMessage("Device revoked.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not revoke device.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-8 p-12 max-md:p-5">
      <div className="grid grid-cols-[minmax(280px,0.55fr)_minmax(0,1fr)] gap-8 max-lg:grid-cols-1">
        <div className="panel grid gap-5 p-7">
          <div>
            <p className="eyebrow">Admin</p>
            <h1 className="text-4xl font-extrabold leading-tight">Account rotator</h1>
          </div>
          <label className="label">Admin token
            <input className="field" value={token} onChange={(event) => setToken(event.target.value)} type="password" autoComplete="off" />
          </label>
          <button className="button button-primary w-full" type="button" onClick={() => refresh()} disabled={busy || !token}>
            {busy ? "Working..." : "Refresh"}
          </button>
          <p className="min-h-6 text-sm font-bold text-muted">{message}</p>
        </div>

        <div className="grid grid-cols-3 gap-px border border-ink bg-ink max-md:grid-cols-1">
          <div className="grid gap-1 bg-paper p-5">
            <span className="text-xs font-bold uppercase text-muted">Accounts</span>
            <strong className="text-3xl">{data.accounts.length}</strong>
          </div>
          <div className="grid gap-1 bg-paper p-5">
            <span className="text-xs font-bold uppercase text-muted">Saved sessions</span>
            <strong className="text-3xl">{data.accounts.filter((account) => account.hasSession).length}</strong>
          </div>
          <div className="grid gap-1 bg-paper p-5">
            <span className="text-xs font-bold uppercase text-muted">Devices</span>
            <strong className="text-3xl">{data.devices.length}</strong>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(320px,0.52fr)] gap-8 max-xl:grid-cols-1">
        <div className="panel p-7">
          <div className="mb-6 flex items-start justify-between gap-4 max-md:grid">
            <div>
              <p className="eyebrow">Accounts</p>
              <h2 className="text-2xl font-extrabold">ChatGPT identities</h2>
            </div>
            <form className="grid min-w-[360px] grid-cols-[1fr_1.2fr_auto] gap-2 max-md:min-w-0 max-md:grid-cols-1" onSubmit={createAccount}>
              <input className="field" name="label" placeholder="acct-1" required />
              <input className="field" name="email" type="email" placeholder="name@example.com" required />
              <button className="button button-primary" type="submit" disabled={busy || !token}>Add</button>
            </form>
          </div>

          <div className="grid border-t border-line">
            {data.accounts.length ? data.accounts.map((account) => (
              <form
                key={account.id}
                className="grid grid-cols-[1fr_1.35fr_auto_auto_auto] items-center gap-3 border-b border-line py-4 text-sm max-lg:grid-cols-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  updateAccount(account, event.currentTarget).catch(() => undefined);
                }}
              >
                <input className="field min-h-[42px]" name="label" defaultValue={account.label} aria-label={`${account.label} label`} />
                <input className="field min-h-[42px]" name="email" type="email" defaultValue={account.email} aria-label={`${account.label} email`} />
                <span className={`inline-flex min-h-[34px] items-center justify-center border px-3 text-xs font-extrabold uppercase ${statusTone[account.status]}`}>
                  {account.status.replace("_", " ")}
                </span>
                <span className="text-xs font-bold text-muted">{account.hasSession ? "Session saved" : "No session"}</span>
                <div className="flex gap-2">
                  <button className="button button-secondary min-h-[38px] px-4" type="submit" disabled={busy || !token}>Save</button>
                  <button className="button button-secondary min-h-[38px] px-4" type="button" onClick={() => deleteAccount(account)} disabled={busy || !token}>Delete</button>
                </div>
                <p className="col-span-full text-xs text-muted">
                  Last used: {formatDate(account.lastUsed)} · Verified: {formatDate(account.lastVerifiedAt)}
                </p>
              </form>
            )) : <p className="py-8 text-muted">No rotator accounts yet.</p>}
          </div>
        </div>

        <div className="grid gap-8">
          <div className="panel p-7">
            <div className="mb-6">
              <p className="eyebrow">Devices</p>
              <h2 className="text-2xl font-extrabold">Registered computers</h2>
            </div>
            <form className="mb-5 grid grid-cols-[1fr_auto] gap-2 max-md:grid-cols-1" onSubmit={createDevice}>
              <input className="field" name="name" placeholder="work laptop" required />
              <button className="button button-primary" type="submit" disabled={busy || !token}>Issue token</button>
            </form>
            {issuedToken ? (
              <div className="mb-5 border border-cta bg-wash p-4">
                <div className="flex items-center justify-between gap-3">
                  <strong className="text-sm">Token for {issuedToken.name}</strong>
                  <button className="button button-secondary min-h-[34px] px-3" type="button" onClick={copyIssuedToken}>Copy</button>
                </div>
                <p className="mt-3 break-all font-mono text-xs">{issuedToken.token}</p>
              </div>
            ) : null}
            <div className="grid border-t border-line">
              {data.devices.length ? data.devices.map((device) => (
                <div key={device.id} className="grid grid-cols-[1fr_auto] gap-3 border-b border-line py-4 text-sm">
                  <div>
                    <strong>{device.name}</strong>
                    <p className="mt-1 text-xs text-muted">Created {formatDate(device.createdAt)} · Seen {formatDate(device.lastSeenAt)}</p>
                  </div>
                  <button className="button button-secondary min-h-[38px] px-4" type="button" onClick={() => revokeDevice(device)} disabled={busy || !token}>Revoke</button>
                </div>
              )) : <p className="py-8 text-muted">No devices registered.</p>}
            </div>
          </div>

          <div className="panel p-7">
            <div className="mb-6">
              <p className="eyebrow">Activity</p>
              <h2 className="text-2xl font-extrabold">Session activations</h2>
            </div>
            <div className="grid border-t border-line">
              {data.audit.length ? data.audit.map((entry) => (
                <div key={entry.id} className="border-b border-line py-4 text-sm">
                  <strong>{accountById.get(entry.accountId)?.label || entry.accountId}</strong>
                  <p className="mt-1 text-xs text-muted">
                    {deviceById.get(entry.deviceId)?.name || entry.deviceId} · {formatDate(entry.at)}
                  </p>
                </div>
              )) : <p className="py-8 text-muted">No session activations yet.</p>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
