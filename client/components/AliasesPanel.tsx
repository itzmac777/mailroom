"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { PublicMailAlias, PublicMailbox } from "@/lib/types";

type IconProps = {
  className?: string;
};

function CopyIcon({ className = "" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 9h10v10H9z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon({ className = "" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m5 12 4.2 4.2L19 6.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RefreshIcon({ className = "" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 6v5h-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 18v-5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18.2 9A7 7 0 0 0 6.7 6.4L4 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.8 15A7 7 0 0 0 17.3 17.6L20 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function splitForwards(value: FormDataEntryValue | null) {
  return String(value || "").split(/[;,\n]/).map((item) => item.trim()).filter(Boolean);
}

export function AliasesPanel() {
  const [mailbox, setMailbox] = useState<PublicMailbox | null>(null);
  const [aliases, setAliases] = useState<PublicMailAlias[]>([]);
  const [aliasLimit, setAliasLimit] = useState(5);
  const [forwardLimit, setForwardLimit] = useState(3);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [message, setMessage] = useState("");
  const [copiedValue, setCopiedValue] = useState("");

  const activeAliasCount = useMemo(() => aliases.filter((alias) => alias.status === "active").length, [aliases]);
  const isBusy = Boolean(busyAction);

  async function refresh() {
    setLoading(true);
    try {
      const [mailboxResult, aliasesResult] = await Promise.all([
        api<{ mailbox: PublicMailbox }>("/api/me/mailbox"),
        api<{ aliases: PublicMailAlias[]; limit: number; forwardLimit: number }>("/api/me/aliases")
      ]);
      setMailbox(mailboxResult.mailbox);
      setAliases(aliasesResult.aliases);
      setAliasLimit(aliasesResult.limit);
      setForwardLimit(aliasesResult.forwardLimit);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load aliases.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(value);
      window.setTimeout(() => setCopiedValue(""), 1600);
    } catch {
      setCopiedValue("");
    }
  }

  async function submitAlias(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusyAction("create");
    setMessage("Creating alias...");
    try {
      const result = await api<{ aliases: PublicMailAlias[] }>("/api/me/aliases", {
        method: "POST",
        body: JSON.stringify({
          local: form.get("local"),
          label: form.get("label"),
          forwardTo: splitForwards(form.get("forwardTo"))
        })
      });
      setAliases(result.aliases);
      setMessage("Alias created.");
      event.currentTarget.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Alias change failed.");
    } finally {
      setBusyAction("");
    }
  }

  async function patchAlias(alias: PublicMailAlias, patch: Record<string, unknown>, successMessage = "Alias updated.") {
    setBusyAction(alias.id);
    setMessage("Updating alias...");
    try {
      const result = await api<{ aliases: PublicMailAlias[] }>(`/api/me/aliases/${encodeURIComponent(alias.id)}`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      });
      setAliases(result.aliases);
      setMessage(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Alias update failed.");
    } finally {
      setBusyAction("");
    }
  }

  async function deleteAlias(alias: PublicMailAlias) {
    setBusyAction(alias.id);
    setMessage("Deleting alias...");
    try {
      const result = await api<{ aliases: PublicMailAlias[] }>(`/api/me/aliases/${encodeURIComponent(alias.id)}`, { method: "DELETE" });
      setAliases(result.aliases);
      setMessage("Alias deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Alias delete failed.");
    } finally {
      setBusyAction("");
    }
  }

  if (message && !mailbox && !loading) {
    return (
      <section className="grid min-h-[calc(100vh-132px)] place-items-start justify-center bg-[#fbfaf7] p-12 max-md:p-5">
        <div className="panel max-w-[620px] p-7">
          <p className="eyebrow">Aliases</p>
          <h1 className="text-[clamp(34px,4.8vw,62px)] font-extrabold leading-none">Sign in required.</h1>
          <p className="mt-4 text-muted">{message}</p>
          <Link className="button button-primary mt-6" href="/login">Login</Link>
        </div>
      </section>
    );
  }

  return (
    <main className="min-h-[calc(100vh-73px)] bg-[#fbfaf7] px-6 py-7 max-md:px-0 max-md:py-0">
      <section className="mx-auto max-w-[1180px] border border-line bg-white shadow-soft max-md:border-0">
        <header className="flex items-start justify-between gap-5 border-b border-line p-7 max-md:grid max-md:p-5">
          <div>
            <p className="eyebrow m-0">Aliases</p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.02em] text-ink max-md:text-2xl">Manage alias routing</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Create addresses for different services, keep mail visible in your inbox, and forward selected aliases outward.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link className="button button-secondary min-h-[42px] px-4" href="/dashboard">Back to inbox</Link>
            <button className="grid h-[42px] w-[42px] place-items-center border border-line bg-white text-ink hover:border-cta hover:text-cta disabled:opacity-50" type="button" onClick={refresh} disabled={loading || isBusy} aria-label="Refresh aliases" title="Refresh">
              <RefreshIcon className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </header>

        <div className="grid grid-cols-[minmax(280px,0.72fr)_1fr] gap-px bg-line max-lg:grid-cols-1">
          <aside className="grid content-start gap-5 bg-soft/45 p-6 max-md:p-5">
            <div className="grid grid-cols-2 border border-line bg-white text-sm">
              <div className="border-r border-line p-4">
                <span className="block text-xs font-bold uppercase tracking-wide text-muted">Active</span>
                <strong className="mt-1 block text-2xl text-ink">{activeAliasCount}/{aliasLimit}</strong>
              </div>
              <div className="p-4">
                <span className="block text-xs font-bold uppercase tracking-wide text-muted">Forward max</span>
                <strong className="mt-1 block text-2xl text-ink">{forwardLimit}</strong>
              </div>
            </div>

            <form className="grid gap-3 border border-line bg-white p-4" onSubmit={submitAlias}>
              <div>
                <p className="eyebrow m-0 text-[10px]">Create</p>
                <h2 className="mt-2 text-lg font-extrabold text-ink">New alias</h2>
              </div>
              <label className="label text-xs">Local part<input className="field min-h-11" name="local" placeholder="shop" required /></label>
              <label className="label text-xs">Label<input className="field min-h-11" name="label" placeholder="Shopping, trials, vendors" /></label>
              <label className="label text-xs">Forward recipients<textarea className="min-h-24 border border-line bg-white px-3 py-3 text-sm outline-none focus:border-cta" name="forwardTo" placeholder={`Optional, max ${forwardLimit}. Separate by comma or line.`} /></label>
              <button className="button button-primary min-h-[44px] w-full px-4" type="submit" disabled={isBusy || activeAliasCount >= aliasLimit}>{busyAction === "create" ? "Creating..." : "Create alias"}</button>
            </form>

            <p className={`min-h-5 text-sm font-bold ${message.toLowerCase().includes("failed") || message.toLowerCase().includes("invalid") || message.toLowerCase().includes("duplicate") ? "text-red-700" : "text-muted"}`}>{message || (loading ? "Loading aliases..." : "")}</p>
          </aside>

          <div className="bg-white p-6 max-md:p-5">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="eyebrow m-0 text-[10px]">Routing</p>
                <h2 className="mt-2 text-xl font-extrabold text-ink">Your aliases</h2>
              </div>
              <span className="text-xs font-bold text-muted">{aliases.length} total</span>
            </div>

            {loading ? (
              <div className="grid gap-3">
                {[1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse border border-line bg-[#fbfaf7]" />)}
              </div>
            ) : aliases.length ? (
              <div className="grid gap-3">
                {aliases.map((alias) => {
                  const disabled = alias.status !== "active";
                  return (
                    <form key={alias.id} className={`grid gap-4 border border-line p-4 ${disabled ? "bg-[#fbfaf7] opacity-70" : "bg-white"}`} onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      patchAlias(alias, {
                        label: form.get("label"),
                        forwardTo: splitForwards(form.get("forwardTo"))
                      });
                    }}>
                      <div className="grid grid-cols-[1fr_auto] items-start gap-4">
                        <div className="min-w-0">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <strong className="break-all text-base text-ink">{alias.email}</strong>
                            <span className={`border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${alias.status === "active" ? "border-cta/30 bg-wash text-cta" : "border-line bg-white text-muted"}`}>{alias.status}</span>
                          </div>
                          <p className="mt-1 text-xs text-muted">Created {new Date(alias.createdAt).toLocaleDateString()}</p>
                        </div>
                        <button className="grid h-9 w-9 place-items-center border border-line text-ink hover:border-cta hover:text-cta" type="button" onClick={() => copyText(alias.email)} aria-label={copiedValue === alias.email ? "Copied alias" : "Copy alias"} title={copiedValue === alias.email ? "Copied" : "Copy"}>
                          {copiedValue === alias.email ? <CheckIcon className="h-4 w-4 text-cta" /> : <CopyIcon className="h-4 w-4" />}
                        </button>
                      </div>

                      <div className="grid grid-cols-[minmax(180px,0.45fr)_1fr] gap-3 max-md:grid-cols-1">
                        <label className="label text-xs">Label<input className="field min-h-10" name="label" defaultValue={alias.label || ""} placeholder="Alias label" /></label>
                        <label className="label text-xs">Forward recipients<textarea className="min-h-20 border border-line bg-white px-3 py-3 text-sm outline-none focus:border-cta" name="forwardTo" defaultValue={alias.forwardTo.join(", ")} placeholder="Forward recipients" /></label>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                        <span className="text-xs font-bold text-muted">{alias.forwardTo.length ? `${alias.forwardTo.length} external recipient${alias.forwardTo.length === 1 ? "" : "s"}` : "No external forwarding"}</span>
                        <span className="flex flex-wrap gap-2">
                          <button className="button button-secondary min-h-[38px] px-3 text-xs" type="submit" disabled={isBusy}>{busyAction === alias.id ? "Saving..." : "Save routing"}</button>
                          <button className="button button-secondary min-h-[38px] px-3 text-xs" type="button" disabled={isBusy} onClick={() => patchAlias(alias, { disabled: alias.status === "active" }, alias.status === "active" ? "Alias disabled." : "Alias enabled.")}>{alias.status === "active" ? "Disable" : "Enable"}</button>
                          <button className="button min-h-[38px] border-red-600 px-3 text-xs font-extrabold text-red-600 hover:bg-red-50" type="button" disabled={isBusy} onClick={() => deleteAlias(alias)}>Delete</button>
                        </span>
                      </div>
                    </form>
                  );
                })}
              </div>
            ) : (
              <div className="grid min-h-[280px] place-items-center border border-line bg-[#fbfaf7] p-8 text-center">
                <div>
                  <p className="eyebrow m-0 text-[10px]">No aliases</p>
                  <h3 className="mt-3 text-xl font-extrabold text-ink">Create your first routed address.</h3>
                  <p className="mt-2 max-w-md text-sm leading-6 text-muted">{mailbox ? `Aliases will deliver into ${mailbox.email} and can forward to selected external inboxes.` : "Aliases deliver into your primary mailbox."}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
