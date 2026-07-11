"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { DomainAliasMapping, RotatorAccount, RotatorAuditEntry, RotatorDevice, RotatorOnboardingJob } from "@/lib/types";

type RotatorData = {
  accounts: RotatorAccount[];
  devices: RotatorDevice[];
  audit: RotatorAuditEntry[];
  jobs: RotatorOnboardingJob[];
  aliases: DomainAliasMapping[];
};

const statusTone: Record<RotatorAccount["status"], string> = {
  active: "border-green-200 bg-green-50 text-green-700",
  needs_relogin: "border-amber-200 bg-amber-50 text-amber-800",
  unknown: "border-line bg-soft text-muted"
};

const onboardingTone: Record<RotatorOnboardingJob["items"][number]["status"], string> = {
  queued: "border-line bg-soft text-muted",
  logging_in: "border-blue-200 bg-blue-50 text-blue-700",
  awaiting_otp: "border-blue-200 bg-blue-50 text-blue-700",
  verifying: "border-blue-200 bg-blue-50 text-blue-700",
  saved: "border-green-200 bg-green-50 text-green-700",
  failed: "border-red-200 bg-red-50 text-red-700",
  needs_manual: "border-amber-200 bg-amber-50 text-amber-800"
};

function formatDate(value?: string): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function parseBulkLines(value: string): Array<{ email: string; password?: string; label?: string }> {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [email = "", password = "", label = ""] = line.split(",").map((part) => part.trim());
      return {
        email,
        password: password || undefined,
        label: label || undefined
      };
    });
}

export function RotatorAdminPanel() {
  const [token, setToken] = useState("");
  const [data, setData] = useState<RotatorData>({ accounts: [], devices: [], audit: [], jobs: [], aliases: [] });
  const [message, setMessage] = useState("Enter the admin token and refresh.");
  const [busy, setBusy] = useState(false);
  const [issuedToken, setIssuedToken] = useState<{ name: string; token: string } | null>(null);
  const [bulkInput, setBulkInput] = useState("");
  const [showAllOnboardingJobs, setShowAllOnboardingJobs] = useState(false);

  const accountById = useMemo(() => {
    return new Map(data.accounts.map((account) => [account.id, account]));
  }, [data.accounts]);

  const deviceById = useMemo(() => {
    return new Map(data.devices.map((device) => [device.id, device]));
  }, [data.devices]);

  const onboardingJobs = useMemo(() => {
    return [...data.jobs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [data.jobs]);

  const visibleOnboardingJobs = showAllOnboardingJobs ? onboardingJobs : onboardingJobs.slice(0, 3);

  async function refresh(currentToken = token) {
    setBusy(true);
    setMessage("Refreshing...");
    try {
      const [accountsResult, devicesResult, auditResult, jobsResult, aliasesResult] = await Promise.all([
        api<{ accounts: RotatorAccount[] }>("/api/rotator/accounts", { headers: { "x-admin-token": currentToken } }),
        api<{ devices: RotatorDevice[] }>("/api/rotator/devices", { headers: { "x-admin-token": currentToken } }),
        api<{ audit: RotatorAuditEntry[] }>("/api/rotator/audit", { headers: { "x-admin-token": currentToken } }),
        api<{ jobs: RotatorOnboardingJob[] }>("/api/rotator/onboarding/jobs", { headers: { "x-admin-token": currentToken } }),
        api<{ mappings: DomainAliasMapping[] }>("/api/rotator/aliases", { headers: { "x-admin-token": currentToken } })
      ]);
      setData({
        accounts: accountsResult.accounts,
        devices: devicesResult.devices,
        audit: auditResult.audit,
        jobs: jobsResult.jobs,
        aliases: aliasesResult.mappings
      });
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load rotator data.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!token || !data.jobs.some((job) => job.status === "running")) return;
    const timer = window.setInterval(() => {
      refresh(token).catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [token, data.jobs]);

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

  async function createOnboardingJob(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const items = parseBulkLines(bulkInput);
    if (!items.length) {
      setMessage("Paste at least one account line.");
      return;
    }
    if (items.length > 10) {
      setMessage("Bulk onboarding is capped at 10 accounts per job.");
      return;
    }
    setBusy(true);
    setMessage("Creating onboarding job...");
    try {
      await api<{ job: RotatorOnboardingJob }>("/api/rotator/onboarding/jobs", {
        method: "POST",
        headers: { "x-admin-token": token },
        body: JSON.stringify({ items })
      });
      setBulkInput("");
      await refresh(token);
      setMessage("Onboarding job created. Start it from the extension popup.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create onboarding job.");
    } finally {
      setBusy(false);
    }
  }

  function retryFailed(job: RotatorOnboardingJob) {
    const failed = job.items.filter((item) => item.status === "failed" || item.status === "needs_manual");
    if (!failed.length) return;
    setBulkInput(failed.map((item) => `${item.email},,${item.label || ""}`).join("\n"));
    setMessage("Failed items are loaded into the bulk box. Add passwords where needed, then submit a new job.");
  }

  async function removeOnboardingJob(job: RotatorOnboardingJob) {
    const label = `Job ${job.id.slice(0, 8)}`;
    const prompt = job.status === "running"
      ? `${label} is still running. Remove it and cancel any remaining queued items?`
      : `Remove ${label} from onboarding history?`;
    if (!confirm(prompt)) return;
    setBusy(true);
    setMessage("Removing onboarding job...");
    try {
      await api<{ deleted: boolean }>(`/api/rotator/onboarding/jobs/${encodeURIComponent(job.id)}`, {
        method: "DELETE",
        headers: { "x-admin-token": token }
      });
      await refresh(token);
      setMessage("Onboarding job removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove onboarding job.");
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

  async function deleteDomainAlias(mapping: DomainAliasMapping) {
    if (!confirm(`Remove the mapping for ${mapping.domain}? The alias ${mapping.alias} will stay active.`)) return;
    setBusy(true);
    setMessage("Removing site alias mapping...");
    try {
      await api<{ deleted: boolean }>(`/api/rotator/aliases/${encodeURIComponent(mapping.id)}`, {
        method: "DELETE",
        headers: { "x-admin-token": token }
      });
      await refresh(token);
      setMessage("Site alias mapping removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove site alias mapping.");
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

        <div className="grid grid-cols-4 gap-px border border-ink bg-ink max-md:grid-cols-1">
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
          <div className="grid gap-1 bg-paper p-5">
            <span className="text-xs font-bold uppercase text-muted">Site aliases</span>
            <strong className="text-3xl">{data.aliases.length}</strong>
          </div>
        </div>
      </div>

      <div className="panel p-7">
        <div className="mb-6 flex items-start justify-between gap-4 max-lg:grid">
          <div>
            <p className="eyebrow">Bulk onboarding</p>
            <h2 className="text-2xl font-extrabold">Automated account setup</h2>
            {onboardingJobs.length > 3 ? (
              <p className="mt-2 text-sm font-bold text-muted">
                Showing {visibleOnboardingJobs.length} of {onboardingJobs.length} jobs
              </p>
            ) : null}
          </div>
          <form className="grid min-w-[520px] gap-3 max-lg:min-w-0" onSubmit={createOnboardingJob}>
            <textarea
              className="field min-h-[128px] resize-y font-mono text-sm"
              value={bulkInput}
              onChange={(event) => setBulkInput(event.target.value)}
              placeholder="name@zenvy.com.bd,,acct-1&#10;name@outlook.com,password,acct-2"
              spellCheck={false}
            />
            <button className="button button-primary justify-self-end" type="submit" disabled={busy || !token}>Create job</button>
          </form>
        </div>

        <div className="grid gap-4">
          {onboardingJobs.length ? (
            <>
              <div className="flex items-center justify-between gap-3 border-y border-line py-3 max-md:grid">
                <p className="text-sm font-bold text-muted">
                  Latest onboarding jobs
                </p>
                {onboardingJobs.length > 3 ? (
                  <button
                    className="button button-secondary min-h-[34px] px-3 text-xs"
                    type="button"
                    onClick={() => setShowAllOnboardingJobs((value) => !value)}
                  >
                    {showAllOnboardingJobs ? "Show latest 3" : `Show all ${onboardingJobs.length}`}
                  </button>
                ) : null}
              </div>
              {visibleOnboardingJobs.map((job) => {
            const failedCount = job.items.filter((item) => item.status === "failed" || item.status === "needs_manual").length;
            return (
              <article key={job.id} className="border border-line p-4">
                <div className="mb-4 flex items-center justify-between gap-3 max-md:grid">
                  <div>
                    <strong className="text-sm">Job {job.id.slice(0, 8)}</strong>
                    <p className="mt-1 text-xs text-muted">{formatDate(job.createdAt)} · {job.items.length} item(s)</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex min-h-[32px] items-center border border-line bg-soft px-3 text-xs font-extrabold uppercase text-muted">
                      {job.status}
                    </span>
                    {failedCount ? (
                      <button className="button button-secondary min-h-[34px] px-3" type="button" onClick={() => retryFailed(job)}>
                        Retry failed
                      </button>
                    ) : null}
                    <button className="button min-h-[34px] border-red-600 px-3 text-xs font-extrabold text-red-600 hover:bg-red-50" type="button" onClick={() => removeOnboardingJob(job)} disabled={busy || !token}>
                      Remove
                    </button>
                  </div>
                </div>
                <div className="grid border-t border-line">
                  {job.items.map((item) => (
                    <div key={item.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-line py-3 text-sm max-lg:grid-cols-1">
                      <div>
                        <strong>{item.label || item.email}</strong>
                        <p className="mt-1 text-xs text-muted">
                          {item.email} · {item.hasPassword ? "Password supplied" : "Email code only"}
                          {item.errorDetail ? ` · ${item.errorDetail}` : item.errorReason ? ` · ${item.errorReason.replaceAll("_", " ")}` : ""}
                        </p>
                      </div>
                      <span className={`inline-flex min-h-[32px] items-center justify-center border px-3 text-xs font-extrabold uppercase ${onboardingTone[item.status]}`}>
                        {item.status.replace("_", " ")}
                      </span>
                      <span className="text-xs font-bold text-muted">Attempts {item.attempts}</span>
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
            </>
          ) : <p className="text-muted">No onboarding jobs yet.</p>}
        </div>
      </div>

      <div className="panel p-7">
        <div className="mb-6">
          <p className="eyebrow">Site Aliases</p>
          <h2 className="text-2xl font-extrabold">Domain mappings</h2>
        </div>
        <div className="grid border-t border-line">
          {data.aliases.length ? data.aliases.map((mapping) => (
            <div key={mapping.id} className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-3 border-b border-line py-4 text-sm max-lg:grid-cols-1">
              <div>
                <strong>{mapping.domain}</strong>
                <p className="mt-1 text-xs text-muted">Created {formatDate(mapping.createdAt)}</p>
              </div>
              <p className="break-all font-mono text-xs">{mapping.alias}</p>
              <span className="text-xs font-bold text-muted">Last used {formatDate(mapping.lastUsedAt)}</span>
              <button className="button button-secondary min-h-[38px] px-4" type="button" onClick={() => deleteDomainAlias(mapping)} disabled={busy || !token}>
                Remove mapping
              </button>
            </div>
          )) : <p className="py-8 text-muted">No site aliases yet.</p>}
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
                  <strong>{entry.accountId ? accountById.get(entry.accountId)?.label || entry.accountId : entry.event.replaceAll("_", " ")}</strong>
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
