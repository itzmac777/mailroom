"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { TempInboxAccount, TempInboxFetchResult, TempInboxMessage } from "@/lib/types";

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

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function senderName(from: string) {
  return from.replace(/<.*?>/g, "").replace(/"/g, "").trim() || from || "Unknown Sender";
}

function senderAddress(from: string) {
  const match = from.match(/<([^>]+)>/);
  return match?.[1] ?? from;
}

function cleanBody(value: string) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]{3,}/g, "  ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export function TempInboxAccessPanel() {
  const [accounts, setAccounts] = useState<TempInboxAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [resultsByAccount, setResultsByAccount] = useState<Record<string, TempInboxFetchResult>>({});
  const [selectedMessageId, setSelectedMessageId] = useState("");
  const [folder, setFolder] = useState("ALL");
  const [keyword, setKeyword] = useState("");
  const [maxCount, setMaxCount] = useState(10);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [message, setMessage] = useState("");
  const [copiedValue, setCopiedValue] = useState("");
  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "preview">("list");

  const selectedAccount = useMemo(() => accounts.find((account) => account.id === selectedAccountId) ?? accounts[0] ?? null, [accounts, selectedAccountId]);
  const selectedResult = selectedAccount ? resultsByAccount[selectedAccount.id] : null;
  const messages = selectedResult?.messages ?? [];
  const selectedMessage = useMemo<TempInboxMessage | null>(() => messages.find((item) => item.id === selectedMessageId) ?? messages[0] ?? null, [messages, selectedMessageId]);

  async function loadAccounts() {
    setLoadingAccounts(true);
    try {
      const result = await api<{ accounts: TempInboxAccount[] }>("/api/temp-inbox/accounts");
      setAccounts(result.accounts);
      setSelectedAccountId((current) => current && result.accounts.some((account) => account.id === current) ? current : result.accounts[0]?.id ?? "");
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load mailbox accounts.");
    } finally {
      setLoadingAccounts(false);
    }
  }

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    if (!selectedAccount || resultsByAccount[selectedAccount.id] || fetching) return;
    fetchMailbox(selectedAccount.id).catch(() => undefined);
  }, [selectedAccount?.id]);

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(value);
      window.setTimeout(() => setCopiedValue(""), 1500);
    } catch {
      setCopiedValue("");
    }
  }

  async function addAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim().toLowerCase();
    setMessage("Saving mailbox...");
    try {
      const result = await api<{ accounts: TempInboxAccount[] }>("/api/temp-inbox/accounts", {
        method: "POST",
        body: JSON.stringify({
          email,
          password: form.get("password"),
          label: form.get("label")
        })
      });
      setAccounts(result.accounts);
      const selected = result.accounts.find((account) => account.email === email) ?? result.accounts[0];
      setSelectedAccountId(selected?.id ?? "");
      setMessage("Mailbox saved.");
      event.currentTarget.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save mailbox.");
    }
  }

  async function removeAccount(account: TempInboxAccount) {
    setMessage("Removing mailbox...");
    try {
      const result = await api<{ accounts: TempInboxAccount[] }>(`/api/temp-inbox/accounts/${encodeURIComponent(account.id)}`, { method: "DELETE" });
      setAccounts(result.accounts);
      setResultsByAccount((current) => {
        const next = { ...current };
        delete next[account.id];
        return next;
      });
      setSelectedAccountId((current) => current === account.id ? result.accounts[0]?.id ?? "" : current);
      setMessage("Mailbox removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove mailbox.");
    }
  }

  async function fetchMailbox(accountId = selectedAccount?.id) {
    if (!accountId) return;
    setFetching(true);
    setMessage("Fetching mailbox...");
    try {
      const result = await api<TempInboxFetchResult>("/api/temp-inbox/fetch", {
        method: "POST",
        body: JSON.stringify({ accountId, folder, keyword, maxCount })
      });
      setResultsByAccount((current) => ({ ...current, [accountId]: result }));
      setSelectedMessageId(result.messages[0]?.id ?? "");
      setMessage(`Fetched ${result.count} of ${result.total} messages.`);
      await loadAccounts();
      setSelectedAccountId(accountId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not fetch mailbox.");
    } finally {
      setFetching(false);
    }
  }

  function renderControls() {
    return (
      <>
        <div>
          <p className="eyebrow">Temp inbox access</p>
          <h1 className="text-xl font-extrabold tracking-[-0.02em] text-ink">Mailbox switcher</h1>
          <p className="mt-2 text-sm leading-6 text-muted">Add external inbox credentials, then switch between them without leaving this page.</p>
        </div>

        <form className="grid gap-3 border border-line bg-white p-4 max-md:p-3" onSubmit={addAccount}>
          <label className="label text-xs">Email<input className="field min-h-11" name="email" type="email" placeholder="name@example.com" required /></label>
          <label className="label text-xs">Password<input className="field min-h-11" name="password" type="password" autoComplete="off" required /></label>
          <label className="label text-xs">Label<input className="field min-h-11" name="label" placeholder="Optional label" /></label>
          <button className="button button-primary min-h-[44px]" type="submit">Add mailbox</button>
        </form>

        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <p className="eyebrow m-0 text-[10px]">Saved</p>
            <span className="text-xs font-bold text-muted">{accounts.length} accounts</span>
          </div>
          {loadingAccounts ? (
            <div className="border border-line bg-white p-4 text-sm text-muted">Loading accounts...</div>
          ) : accounts.length ? (
            <>
              <label className="hidden max-lg:grid label text-xs">
                Active mailbox
                <select
                  className="field min-h-11"
                  value={selectedAccount?.id || ""}
                  onChange={(event) => {
                    setSelectedAccountId(event.target.value);
                    setMobileView("list");
                    setIsControlsOpen(false);
                  }}
                >
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.label || account.email}</option>)}
                </select>
              </label>
              <div className="grid gap-2 max-lg:hidden">
                {accounts.map((account) => (
                  <div key={account.id} className={`border p-3 ${selectedAccount?.id === account.id ? "border-cta bg-wash" : "border-line bg-white"}`}>
                    <button className="w-full text-left" type="button" onClick={() => setSelectedAccountId(account.id)}>
                      <strong className="block truncate text-[13px] text-ink">{account.label || account.email}</strong>
                      <span className="mt-1 block truncate text-xs font-medium text-muted">{account.email}</span>
                    </button>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] font-bold text-muted">{account.lastFetchedAt ? `Synced ${formatDate(account.lastFetchedAt)}` : "Not synced yet"}</span>
                      <button className="text-xs font-extrabold text-red-600" type="button" onClick={() => removeAccount(account)}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
              {selectedAccount ? (
                <div className="hidden border border-line bg-white p-3 max-lg:grid">
                  <strong className="truncate text-[13px] text-ink">{selectedAccount.label || selectedAccount.email}</strong>
                  <span className="mt-1 truncate text-xs font-medium text-muted">{selectedAccount.email}</span>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] font-bold text-muted">{selectedAccount.lastFetchedAt ? `Synced ${formatDate(selectedAccount.lastFetchedAt)}` : "Not synced yet"}</span>
                    <button className="text-xs font-extrabold text-red-600" type="button" onClick={() => removeAccount(selectedAccount)}>Remove</button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="border border-line bg-white p-4 text-sm leading-6 text-muted">No mailboxes yet. Add one above to start.</div>
          )}
        </div>

        <p className="min-h-5 text-sm font-bold text-muted">{message}</p>
      </>
    );
  }

  return (
    <main className="bg-[#fbfaf7] px-6 py-7 max-md:px-0 max-md:py-0">
      {isControlsOpen ? (
        <>
          <div onClick={() => setIsControlsOpen(false)} className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-sm" />
          <aside className="fixed inset-y-0 left-0 z-50 hidden w-[320px] max-w-[88vw] overflow-y-auto border-r border-line bg-[#fbfaf7] p-5 shadow-xl max-lg:grid max-lg:content-start max-lg:gap-5 max-md:p-4">
            <div className="flex items-center justify-between gap-4 border-b border-line bg-white p-4">
              <span className="text-lg font-bold tracking-tight text-ink">Mailbox switcher</span>
              <button className="grid h-9 w-9 place-items-center border border-line text-ink hover:text-cta" type="button" onClick={() => setIsControlsOpen(false)} aria-label="Close mailbox switcher">x</button>
            </div>
            {renderControls()}
          </aside>
        </>
      ) : null}

      <section className="mx-auto grid min-h-[calc(100vh-178px)] max-w-[1480px] grid-cols-[300px_minmax(360px,460px)_minmax(0,1fr)] overflow-hidden border border-line bg-white shadow-soft max-xl:grid-cols-[280px_minmax(330px,430px)_minmax(0,1fr)] max-lg:grid-cols-1 max-md:min-h-[calc(100vh-56px)] max-md:border-0">
        <aside className="grid min-h-0 min-w-0 content-start gap-5 overflow-y-auto border-r border-line bg-soft/45 p-5 max-lg:hidden">
          {renderControls()}
        </aside>

        <section className={`grid min-h-0 min-w-0 grid-rows-[auto_1fr] border-r border-line max-lg:min-h-[calc(100vh-56px)] max-lg:border-b max-lg:border-r-0 ${mobileView === "preview" ? "max-lg:hidden" : "max-lg:grid"}`}>
          <header className="min-w-0 border-b border-line bg-white p-5 max-md:p-4">
            <div className="flex min-w-0 items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <button className="hidden h-10 w-10 shrink-0 place-items-center border border-line bg-white text-ink hover:border-cta hover:text-cta max-lg:grid max-md:h-8 max-md:w-8" type="button" onClick={() => setIsControlsOpen(true)} aria-label="Open mailbox switcher">
                  <svg className="h-5 w-5 max-md:h-4 max-md:w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
                <div className="min-w-0">
                  <p className="eyebrow m-0 max-md:text-[9px] max-md:tracking-wider">Temp inbox</p>
                  <h2 className="mt-2 truncate text-xl font-extrabold text-ink max-md:mt-1 max-md:text-lg">{selectedAccount?.label || selectedAccount?.email || "No mailbox"}</h2>
                </div>
              </div>
              <button className="grid h-11 w-11 shrink-0 place-items-center border border-line bg-white text-ink transition-colors hover:border-cta hover:text-cta disabled:opacity-50" type="button" onClick={() => fetchMailbox()} disabled={!selectedAccount || fetching} aria-label="Fetch mailbox" title="Fetch mailbox">
                <RefreshIcon className={`h-5 w-5 ${fetching ? "animate-spin" : ""}`} />
              </button>
            </div>

            <label className="mt-4 hidden grid-cols-[auto_1fr] items-center gap-2 border border-line bg-[#fbfaf7] px-3 focus-within:border-cta max-lg:grid max-md:mt-3 max-md:px-2">
              <span className="text-xs font-extrabold uppercase tracking-wide text-muted">Account</span>
              <select
                className="min-h-10 border-0 bg-transparent text-[13px] font-bold text-ink outline-none focus:outline-none"
                value={selectedAccount?.id || ""}
                onChange={(event) => {
                  setSelectedAccountId(event.target.value);
                  setMobileView("list");
                }}
              >
                <option value="">No mailbox</option>
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.label || account.email}</option>)}
              </select>
            </label>

            <div className="mt-5 grid min-w-0 grid-cols-[84px_minmax(0,1fr)_84px] gap-2 max-md:grid-cols-1">
              <label className="label text-xs">Folder<input className="field min-h-10" value={folder} onChange={(event) => setFolder(event.target.value || "ALL")} /></label>
              <label className="label text-xs">Keyword<input className="field min-h-10" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Search keyword" /></label>
              <label className="label text-xs">Max<input className="field min-h-10" value={maxCount} min={1} max={50} onChange={(event) => setMaxCount(Number(event.target.value) || 10)} type="number" /></label>
            </div>
          </header>

          <div className="min-h-0 min-w-0 overflow-y-auto bg-white">
            {!selectedAccount ? (
              <div className="m-5 border border-line bg-[#fbfaf7] p-8 text-center text-muted">Add a mailbox to fetch messages.</div>
            ) : fetching && !messages.length ? (
              <div className="grid gap-px bg-line p-px">
                {[1, 2, 3, 4].map((item) => <div key={item} className="grid gap-3 bg-white p-5"><div className="h-4 w-3/4 animate-pulse rounded bg-soft" /><div className="h-3 w-1/2 animate-pulse rounded bg-soft" /></div>)}
              </div>
            ) : messages.length ? messages.map((email) => (
              <button key={email.id} type="button" onClick={() => {
                setSelectedMessageId(email.id);
                setMobileView("preview");
              }} className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-line p-4 text-left transition-colors ${selectedMessage?.id === email.id ? "bg-wash" : "hover:bg-[#fbfaf7]"}`}>
                <span className="min-w-0">
                  <span className="flex min-w-0 items-center gap-2">
                    {email.otp ? <span className="h-2 w-2 shrink-0 rounded-full bg-cta" /> : null}
                    <strong className="block truncate text-[14px] font-bold text-ink">{email.subject || "(No subject)"}</strong>
                  </span>
                  <span className="mt-1 block truncate text-sm text-muted">{senderName(email.from)}</span>
                </span>
                <span className="max-w-[92px] shrink-0 text-right text-xs font-bold leading-5 text-muted">{formatDate(email.date)}</span>
              </button>
            )) : (
              <div className="m-5 border border-line bg-[#fbfaf7] p-8 text-center text-muted">No messages loaded. Refresh this mailbox to fetch messages.</div>
            )}
          </div>
        </section>

        <section className={`grid min-h-0 min-w-0 grid-rows-[auto_1fr] bg-white ${mobileView === "list" ? "max-lg:hidden" : "max-lg:grid"}`}>
          <header className="hidden min-h-[64px] items-center gap-3 border-b border-line px-4 py-3 max-lg:flex">
            <button
              type="button"
              onClick={() => setMobileView("list")}
              className="grid h-8 w-8 shrink-0 place-items-center border border-line bg-white text-ink hover:border-cta hover:text-cta"
              aria-label="Back to messages"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M19 12H5m7 7-7-7 7-7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="min-w-0">
              <p className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-cta">Message preview</p>
              <p className="mt-1 truncate text-xs font-medium text-muted">{selectedMessage ? senderAddress(selectedMessage.from) : selectedAccount?.email || "No mailbox"}</p>
            </div>
          </header>
          <div className="min-h-0 overflow-y-auto p-7 max-md:p-4">
          {selectedMessage ? (
            <article className="mx-auto min-w-0 max-w-[820px]">
              <div className="grid min-w-0 gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-cta">Message preview</p>
                  <h2 className="mt-4 break-words text-[clamp(24px,2.5vw,34px)] font-semibold leading-[1.08] tracking-[-0.01em] text-ink">{selectedMessage.subject || "(No subject)"}</h2>
                </div>
                {selectedMessage.otp ? (
                  <div className="inline-flex w-fit items-center gap-2 border border-line bg-[#fbfaf7] px-3 py-2 text-xs font-bold text-ink">
                    <span>Code: {selectedMessage.otp}</span>
                    <button className="grid h-7 w-7 place-items-center border border-line bg-white text-ink hover:border-cta hover:text-cta" type="button" onClick={() => copyText(selectedMessage.otp)} aria-label={copiedValue === selectedMessage.otp ? "Copied code" : "Copy code"} title={copiedValue === selectedMessage.otp ? "Copied" : "Copy"}>
                      {copiedValue === selectedMessage.otp ? <CheckIcon className="h-3.5 w-3.5 text-cta" /> : <CopyIcon className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="mt-5 border-b border-line pb-5 text-sm leading-6 text-muted">
                <p><strong className="text-ink">{senderName(selectedMessage.from)}</strong> &lt;{senderAddress(selectedMessage.from)}&gt;</p>
                <p className="break-all">to {selectedMessage.to || selectedAccount?.email}</p>
                <p>{formatDate(selectedMessage.date)}</p>
              </div>

              <div className="mt-8 overflow-x-auto whitespace-pre-wrap break-words border border-line/40 bg-[#faf9f6]/40 p-6 font-sans text-[15px] leading-7 text-muted max-md:p-4 max-md:text-sm max-md:leading-6">
                {cleanBody(selectedMessage.body) || "No message body content."}
              </div>
            </article>
          ) : (
            <div className="grid min-h-[520px] place-items-center text-center">
              <div className="max-w-[420px]">
                <h2 className="text-3xl font-extrabold tracking-[-0.03em] text-ink">Choose a message</h2>
                <p className="mt-3 leading-7 text-muted">Fetch a mailbox and select a message to preview its body.</p>
              </div>
            </div>
          )}
          </div>
        </section>
      </section>
    </main>
  );
}
