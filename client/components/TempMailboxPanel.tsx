"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { EmailMessage, PublicMailbox } from "@/lib/types";

type EmailBodyDetails = {
  uid: string;
  body: string;
  html?: string;
  replyTo?: string;
  to?: string;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function senderName(from: string) {
  return from.replace(/<.*?>/g, "").replace(/\"/g, "").trim() || from;
}

function senderAddress(from: string) {
  const match = from.match(/<([^>]+)>/);
  return match?.[1] ?? from;
}

function formatRemaining(expiresAt?: string) {
  if (!expiresAt) return "--";
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return hours > 0 ? `${hours}h ${remMinutes}m` : `${Math.max(1, remMinutes)}m`;
}

export function TempMailboxPanel() {
  const [mailbox, setMailbox] = useState<PublicMailbox | null>(null);
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [bodies, setBodies] = useState<Record<string, EmailBodyDetails>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function loadMailbox() {
    setLoading(true);
    try {
      const result = await api<{ mailbox: PublicMailbox }>("/api/temp-mailboxes/me");
      setMailbox(result.mailbox);
      setError("");
      await loadEmails();
    } catch (err) {
      setMailbox(null);
      setError(err instanceof Error ? err.message : "No active temp inbox.");
    } finally {
      setLoading(false);
    }
  }

  async function loadEmails() {
    setSyncing(true);
    try {
      const result = await api<{ emails: EmailMessage[] }>("/api/temp-mailboxes/emails");
      setEmails(result.emails);
      setSelectedUid((current) => current && result.emails.some((email) => email.uid === current) ? current : result.emails[0]?.uid ?? null);
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    loadMailbox();
  }, []);

  const selectedEmail = useMemo(() => emails.find((email) => email.uid === selectedUid) ?? emails[0] ?? null, [emails, selectedUid]);
  const selectedBody = selectedEmail ? bodies[selectedEmail.uid] : null;
  const expired = mailbox?.expiresAt ? new Date(mailbox.expiresAt).getTime() <= Date.now() : false;

  useEffect(() => {
    if (!selectedEmail || bodies[selectedEmail.uid]) return;
    api<{ email: EmailBodyDetails }>(`/api/temp-mailboxes/email?uid=${encodeURIComponent(selectedEmail.uid)}`)
      .then((result) => setBodies((current) => ({ ...current, [selectedEmail.uid]: result.email })))
      .catch(() => undefined);
  }, [selectedEmail?.uid]);

  async function copyAddress() {
    if (!mailbox) return;
    await navigator.clipboard.writeText(mailbox.email);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  if (loading) return <main className="p-12 text-muted max-md:p-5">Loading temp inbox...</main>;

  if (!mailbox || expired) {
    return (
      <main className="grid min-h-[calc(100vh-120px)] place-items-center bg-[#fbfaf7] p-6">
        <section className="panel max-w-[560px] p-8 text-center">
          <p className="eyebrow">Temporary mail</p>
          <h1 className="text-[clamp(34px,4.8vw,58px)] font-semibold leading-none tracking-[-0.04em] text-ink">{expired ? "This inbox expired." : "No active temp inbox."}</h1>
          <p className="mx-auto mt-4 max-w-[420px] leading-7 text-muted">Create a new disposable address for verification codes and short-lived signups.</p>
          <Link className="button button-primary mt-7" href="/claim">Create new temp inbox</Link>
          {error ? <p className="mt-4 text-sm font-bold text-muted">{error}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="bg-[#fbfaf7] px-6 py-7 max-md:px-0 max-md:py-0">
      <section className="mx-auto grid min-h-[calc(100vh-178px)] max-w-[1480px] grid-cols-[320px_minmax(360px,460px)_1fr] overflow-hidden border border-line bg-white shadow-soft max-lg:grid-cols-1 max-md:border-0">
        <aside className="grid content-between border-r border-line bg-soft/45 p-5 max-lg:border-b max-lg:border-r-0">
          <div>
            <p className="eyebrow">Temporary inbox</p>
            <h1 className="break-all text-2xl font-extrabold tracking-[-0.03em] text-ink">{mailbox.email}</h1>
            <div className="mt-5 grid grid-cols-2 border border-line bg-white text-sm">
              <div className="border-r border-line p-4"><span className="block text-xs font-bold uppercase text-muted">Expires</span><strong>{formatRemaining(mailbox.expiresAt)}</strong></div>
              <div className="p-4"><span className="block text-xs font-bold uppercase text-muted">Mode</span><strong>Receive only</strong></div>
            </div>
            <div className="mt-5 grid gap-3">
              <button className="button button-primary min-h-[44px]" type="button" onClick={copyAddress}>{copied ? "Copied" : "Copy address"}</button>
              <button className="button button-secondary min-h-[44px]" type="button" onClick={loadEmails} disabled={syncing}>{syncing ? "Syncing..." : "Refresh inbox"}</button>
            </div>
          </div>
          <p className="mt-8 text-xs leading-5 text-muted">Temporary inboxes expire automatically. They cannot send mail and do not require a login.</p>
        </aside>

        <section className="grid min-h-0 grid-rows-[auto_1fr] border-r border-line max-lg:border-b max-lg:border-r-0">
          <header className="border-b border-line p-5">
            <p className="eyebrow m-0">Messages</p>
            <h2 className="mt-2 text-2xl font-extrabold text-ink">Inbox</h2>
          </header>
          <div className="min-h-0 overflow-y-auto">
            {emails.length ? emails.map((email) => (
              <button key={email.uid} type="button" onClick={() => setSelectedUid(email.uid)} className={`grid w-full grid-cols-[1fr_auto] gap-4 border-b border-line p-5 text-left transition-colors ${selectedEmail?.uid === email.uid ? "bg-wash" : "hover:bg-[#fbfaf7]"}`}>
                <span className="min-w-0"><strong className="block truncate text-ink">{email.subject || "(No subject)"}</strong><span className="mt-1 block truncate text-sm text-muted">{senderName(email.from)}</span></span>
                <span className="text-xs font-bold text-muted">{formatDate(email.date)}</span>
              </button>
            )) : <div className="m-5 border border-line bg-[#fbfaf7] p-8 text-center text-muted">No messages yet. Send a test email to this address and refresh.</div>}
          </div>
        </section>

        <section className="min-h-0 overflow-y-auto p-7 max-md:p-5">
          {selectedEmail ? (
            <article className="mx-auto max-w-[780px]">
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-cta">Message preview</p>
              <h2 className="mt-4 text-[clamp(28px,4vw,48px)] font-semibold leading-none tracking-[-0.04em] text-ink">{selectedEmail.subject || "(No subject)"}</h2>
              <p className="mt-4 text-sm font-medium text-muted">{senderName(selectedEmail.from)} &lt;{senderAddress(selectedEmail.from)}&gt; · {formatDate(selectedEmail.date)}</p>
              <div className="mt-8 border-t border-line pt-6">
                {!selectedBody ? (
                  <div className="grid gap-3 py-4 animate-pulse">
                    <div className="h-4 w-full rounded bg-soft" />
                    <div className="h-4 w-5/6 rounded bg-soft" />
                    <div className="h-4 w-4/5 rounded bg-soft" />
                  </div>
                ) : selectedBody.html ? (
                  <div className="relative h-[550px] w-full overflow-hidden rounded-sm border border-line/40 bg-white max-md:h-[400px]">
                    <iframe
                      srcDoc={`
                        <!DOCTYPE html>
                        <html>
                          <head>
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <style>
                              body {
                                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                                font-size: 14px;
                                line-height: 1.6;
                                color: #333333;
                                margin: 12px;
                              }
                              a { color: #3148d4; }
                              p { margin-top: 0; margin-bottom: 1em; }
                              img { max-width: 100% !important; height: auto !important; }
                              table, div, p { max-width: 100% !important; box-sizing: border-box !important; }
                            </style>
                          </head>
                          <body>
                            ${selectedBody.html}
                          </body>
                        </html>
                      `}
                      className="h-full w-full border-0 bg-white"
                      title="Email content"
                    />
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap rounded-sm border border-line/40 bg-[#faf9f6]/40 p-6 font-sans text-[15px] leading-7 text-muted max-md:p-4 max-md:text-sm max-md:leading-6">
                    {selectedBody.body || "No message body content."}
                  </div>
                )}
              </div>
            </article>
          ) : (
            <div className="grid min-h-[420px] place-items-center text-center text-muted">Choose a message from the list.</div>
          )}
        </section>
      </section>
    </main>
  );
}
