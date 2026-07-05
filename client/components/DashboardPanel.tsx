"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { PublicMailbox, EmailMessage } from "@/lib/types";

type Folder = {
  label: string;
  count?: number;
  active?: boolean;
};

type IconProps = {
  className?: string;
};

const folders: Folder[] = [
  { label: "Inbox", active: true },
  { label: "Sent" },
  { label: "Drafts" },
  { label: "Spam" },
  { label: "Trash" }
];

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

function MailIcon({ className = "" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.5 6.5h15v11h-15z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="m5 7 7 6 7-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CopyIcon({ className = "" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 9h10v10H9z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIcon({ className = "" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m21 21-4.3-4.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function formatMessageDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return date.toLocaleString(undefined, sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
  );
}

function formatFullDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function senderName(from: string) {
  return from.replace(/<.*?>/g, "").replace(/\"/g, "").trim() || from;
}

function senderAddress(from: string) {
  const match = from.match(/<([^>]+)>/);
  return match?.[1] ?? from;
}

type EmailBodyDetails = {
  uid: string;
  body: string;
  html?: string;
  replyTo?: string;
  to?: string;
};

export function DashboardPanel() {
  const [mailbox, setMailbox] = useState<PublicMailbox | null>(null);
  const [error, setError] = useState("");
  const [emails, setEmails] = useState<EmailMessage[] | null>(null);
  const [emailsLoading, setEmailsLoading] = useState(true);
  const [emailsError, setEmailsError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEmailUid, setSelectedEmailUid] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);

  const [showDetails, setShowDetails] = useState(false);
  const [emailBodies, setEmailBodies] = useState<Record<string, EmailBodyDetails>>({});
  const [bodyLoading, setBodyLoading] = useState(false);

  const fetchMailboxAndEmails = async () => {
    try {
      const result = await api<{ mailbox: PublicMailbox }>("/api/me/mailbox");
      setMailbox(result.mailbox);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Not signed in.");
    }
  };

  const fetchEmailsList = async () => {
    setRefreshing(true);
    try {
      const result = await api<{ emails: EmailMessage[] }>("/api/me/emails");
      setEmails(result.emails);
      setEmailsError("");
      setSelectedEmailUid((current) => {
        if (current && result.emails.some((email) => email.uid === current)) return current;
        return result.emails[0]?.uid ?? null;
      });
    } catch (err) {
      setEmailsError(err instanceof Error ? err.message : "Failed to sync emails.");
    } finally {
      setEmailsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMailboxAndEmails();
  }, []);

  useEffect(() => {
    if (mailbox) {
      fetchEmailsList();
    }
  }, [mailbox]);

  useEffect(() => {
    if (selectedEmail && !emailBodies[selectedEmail.uid]) {
      setBodyLoading(true);
      api<{ email: EmailBodyDetails }>(`/api/me/email?uid=${selectedEmail.uid}`)
        .then((res) => {
          setEmailBodies((prev) => ({
            ...prev,
            [selectedEmail.uid]: res.email
          }));
        })
        .catch((err) => {
          console.error("Failed to load email body:", err);
        })
        .finally(() => {
          setBodyLoading(false);
        });
    } else {
      setBodyLoading(false);
    }
    setShowDetails(false);
  }, [selectedEmailUid]);

  const unreadCount = emails?.length ?? 0;
  const storageUsedMb = 0;
  const storagePercent = mailbox ? Math.min(100, Math.round((storageUsedMb / mailbox.quotaMb) * 100)) : 0;

  const filteredEmails = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!emails) return [];
    if (!value) return emails;
    return emails.filter((email) =>
      [email.subject, email.from, email.date].some((field) => field.toLowerCase().includes(value))
    );
  }, [emails, query]);

  const selectedEmail = useMemo(() => {
    return filteredEmails.find((email) => email.uid === selectedEmailUid) ?? filteredEmails[0] ?? null;
  }, [filteredEmails, selectedEmailUid]);

  const selectedEmailBody = selectedEmail ? emailBodies[selectedEmail.uid] : null;

  const mailboxInitial = mailbox?.displayName?.[0] ?? mailbox?.local?.[0] ?? "M";
  const activeFolders = folders.map((folder) => folder.label === "Inbox" ? { ...folder, count: unreadCount } : folder);

  async function copyMailboxAddress() {
    if (!mailbox) return;
    try {
      await navigator.clipboard.writeText(mailbox.email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  if (error) {
    return (
      <section className="grid min-h-[calc(100vh-132px)] place-items-start justify-center p-12 max-md:p-5">
        <div className="panel max-w-[620px] p-7">
          <p className="eyebrow">Dashboard</p>
          <h1 className="text-[clamp(34px,4.8vw,62px)] font-extrabold leading-none">Sign in required.</h1>
          <p className="mt-4 text-muted">{error}</p>
          <Link className="button button-primary mt-6" href="/login">Login</Link>
        </div>
      </section>
    );
  }

  if (!mailbox) return <main className="p-12 text-muted max-md:p-5">Loading dashboard...</main>;

  return (
    <main className="bg-[#fbfaf7] px-6 py-7 max-md:px-4 max-md:py-4">
      <section className="mx-auto grid min-h-[calc(100vh-178px)] max-w-[1480px] grid-cols-[260px_minmax(360px,460px)_1fr] overflow-hidden border border-line bg-white shadow-soft max-xl:grid-cols-[220px_minmax(330px,430px)_1fr] max-lg:grid-cols-1">
        <aside className="grid border-r border-line bg-soft/45 max-lg:border-b max-lg:border-r-0">
          <div className="border-b border-line p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-line bg-white text-lg font-extrabold text-cta shadow-[0_10px_30px_rgba(49,72,212,0.12)]">
                {mailboxInitial.toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold text-ink">{mailbox.displayName || mailbox.local}</p>
                <p className="truncate text-xs font-medium text-muted">{mailbox.email}</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 border border-line bg-white text-xs">
              <div className="border-r border-line p-3">
                <span className="block font-bold text-muted">Status</span>
                <strong className="mt-1 block capitalize text-ink">{mailbox.status}</strong>
              </div>
              <div className="p-3">
                <span className="block font-bold text-muted">Limit</span>
                <strong className="mt-1 block text-ink">{mailbox.outboundDailyLimit}/day</strong>
              </div>
            </div>
          </div>

          <div className="grid content-start gap-5 p-5">
            <a className="button button-primary min-h-[44px] w-full px-4" href="/webmail">Compose in webmail</a>
            <nav className="grid gap-1" aria-label="Mailbox folders">
              {activeFolders.map((folder) => (
                <button
                  key={folder.label}
                  type="button"
                  className={`flex min-h-11 items-center justify-between border px-3 text-left text-sm font-bold transition-colors ${folder.active ? "border-cta bg-wash text-cta" : "border-transparent text-muted hover:border-line hover:bg-white hover:text-ink"}`}
                >
                  <span className="flex items-center gap-2"><MailIcon className="h-4 w-4" />{folder.label}</span>
                  {typeof folder.count === "number" ? <span className="rounded-full bg-white px-2 py-0.5 text-xs text-cta">{folder.count}</span> : null}
                </button>
              ))}
            </nav>
          </div>

          <div className="mt-auto border-t border-line p-5">
            <div className="mb-3 flex items-center justify-between text-xs font-bold text-muted">
              <span>Storage</span>
              <span>{storageUsedMb} MB / {mailbox.quotaMb} MB</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white">
              <div className="h-full bg-cta" style={{ width: `${storagePercent}%` }} />
            </div>
            <p className="mt-3 text-xs leading-5 text-muted">Portal sync is intentionally light. Full folders and message bodies stay in webmail.</p>
          </div>
        </aside>

        <section className="grid min-h-0 grid-rows-[auto_1fr] border-r border-line max-lg:border-b max-lg:border-r-0">
          <header className="border-b border-line bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow m-0">Mailbox dashboard</p>
                <h1 className="mt-2 text-2xl font-extrabold tracking-[-0.02em] text-ink">Inbox</h1>
              </div>
              <button
                type="button"
                onClick={fetchEmailsList}
                disabled={emailsLoading || refreshing}
                className="grid h-11 w-11 place-items-center border border-line bg-white text-ink transition-colors hover:border-cta hover:text-cta disabled:opacity-50"
                aria-label="Sync mail"
                title="Sync mail"
              >
                <RefreshIcon className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`} />
              </button>
            </div>
            <label className="mt-5 grid grid-cols-[auto_1fr] items-center gap-2 border border-line bg-[#fbfaf7] px-3 focus-within:border-cta">
              <SearchIcon className="h-5 w-5 text-muted" />
              <input
                className="min-h-11 border-0 bg-transparent text-sm text-ink outline-none placeholder:text-muted/70 focus:outline-none"
                placeholder="Search messages"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </header>

          <div className="min-h-0 overflow-y-auto bg-white">
            {emailsLoading ? (
              <div className="grid gap-px bg-line p-px">
                {[1, 2, 3, 4, 5].map((item) => (
                  <div key={item} className="grid gap-3 bg-white p-5">
                    <div className="h-3 w-28 animate-pulse rounded-full bg-soft" />
                    <div className="h-4 w-4/5 animate-pulse rounded-full bg-soft" />
                    <div className="h-3 w-2/3 animate-pulse rounded-full bg-soft" />
                  </div>
                ))}
              </div>
            ) : emailsError ? (
              <div className="m-5 border border-line bg-wash/45 p-6">
                <p className="text-sm font-extrabold text-red-700">Sync error</p>
                <p className="mt-2 text-sm leading-6 text-muted">{emailsError}</p>
                {emailsError.includes("log in again") ? (
                  <Link className="button button-primary mt-5 min-h-[40px]" href="/login">Sign in again</Link>
                ) : (
                  <button onClick={fetchEmailsList} className="button button-secondary mt-5 min-h-[40px]" type="button">Retry sync</button>
                )}
              </div>
            ) : !emails || emails.length === 0 ? (
              <div className="m-5 grid min-h-[320px] place-items-center border border-line bg-[#fbfaf7] p-8 text-center">
                <div>
                  <MailIcon className="mx-auto h-12 w-12 text-cta" />
                  <h2 className="mt-5 text-xl font-extrabold text-ink">Your inbox is quiet</h2>
                  <p className="mx-auto mt-2 max-w-[320px] text-sm leading-6 text-muted">Send a test message to {mailbox.email}, then sync this view.</p>
                </div>
              </div>
            ) : filteredEmails.length === 0 ? (
              <div className="m-5 border border-line bg-[#fbfaf7] p-6 text-sm text-muted">No messages match your search.</div>
            ) : (
              <div className="grid divide-y divide-line">
                {filteredEmails.map((email) => {
                  const active = selectedEmail?.uid === email.uid;
                  return (
                    <button
                      key={email.uid}
                      type="button"
                      onClick={() => setSelectedEmailUid(email.uid)}
                      className={`grid w-full grid-cols-[auto_1fr_auto] gap-4 p-5 text-left transition-colors border-b border-line/30 ${active ? "bg-wash" : "bg-white hover:bg-[#fbfaf7]"}`}
                    >
                      <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${active ? "bg-cta" : "bg-[#f05a28]"}`} aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-extrabold text-ink">
                          {email.subject || "(No subject)"}
                        </span>
                        <span className="mt-1.5 block truncate text-sm text-muted">
                          <strong className="font-semibold text-ink/80">{senderName(email.from)}</strong>: {email.subject || "(No subject)"}
                        </span>
                      </span>
                      <span className="whitespace-nowrap text-xs font-semibold text-muted/80">{formatMessageDate(email.date)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="grid min-h-0 grid-rows-[auto_1fr] bg-white">
          <header className="flex min-h-[86px] items-center justify-between gap-4 border-b border-line px-7 py-5 max-md:block max-md:px-5">
            <div className="min-w-0">
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-cta">Message preview</p>
              <p className="mt-1 truncate text-sm font-medium text-muted">{selectedEmail ? senderAddress(selectedEmail.from) : mailbox.email}</p>
            </div>
            <div className="flex items-center gap-3 max-md:mt-4">
              <button
                type="button"
                onClick={copyMailboxAddress}
                className="grid h-11 w-11 place-items-center border border-line bg-white text-ink transition-colors hover:border-cta hover:text-cta"
                aria-label="Copy mailbox address"
                title={copied ? "Copied" : "Copy mailbox address"}
              >
                <CopyIcon className="h-5 w-5" />
              </button>
              <a className="button button-secondary min-h-[44px] px-4" href="/logout">Logout</a>
              <a className="button button-primary min-h-[44px] px-4" href="/webmail">Open webmail</a>
            </div>
          </header>

          <div className="min-h-0 overflow-y-auto p-7 max-md:p-5">
            {selectedEmail ? (
              <article className="mx-auto max-w-[780px]">
                <div className="border-b border-line pb-6">
                  {/* Subject and Date line */}
                  <div className="flex flex-wrap items-baseline gap-3 pb-3 mb-5">
                    <span className="h-2 w-2 rounded-full bg-cta shrink-0 self-center" />
                    <h2 className="text-xl font-bold tracking-tight text-ink">
                      {selectedEmail.subject || "(No subject)"}
                    </h2>
                    <span className="text-xs font-medium text-muted">
                      {formatFullDate(selectedEmail.date)}
                    </span>
                  </div>

                  {/* Sender details and 'to me' dropdown */}
                  <div className="relative flex items-start gap-3 mt-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-wash text-sm font-extrabold text-cta">
                      {senderName(selectedEmail.from)[0]?.toUpperCase() ?? "M"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm">
                        <strong className="font-semibold text-ink">{senderName(selectedEmail.from)}</strong>{" "}
                        <span className="text-muted/80 text-xs font-medium">&lt;{senderAddress(selectedEmail.from)}&gt;</span>
                      </div>
                      <div className="relative mt-0.5">
                        <button
                          type="button"
                          onClick={() => setShowDetails((prev) => !prev)}
                          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-cta transition-colors py-0.5 cursor-pointer font-medium"
                        >
                          <span>to me</span>
                          <svg 
                            className={`h-3.5 w-3.5 transition-transform duration-200 ${showDetails ? "rotate-180" : ""}`} 
                            viewBox="0 0 24 24" 
                            fill="none" 
                            stroke="currentColor" 
                            strokeWidth="2.5" 
                            strokeLinecap="round" 
                            strokeLinejoin="round"
                          >
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </button>

                        {showDetails && (
                          <div className="absolute left-0 top-full z-20 mt-2 w-full max-w-md border border-line bg-white p-4 shadow-soft rounded-sm">
                            <table className="w-full text-xs border-collapse">
                              <tbody>
                                {[
                                  ["from:", `${senderName(selectedEmail.from)} <${senderAddress(selectedEmail.from)}>`],
                                  ["reply-to:", selectedEmailBody?.replyTo || senderAddress(selectedEmail.from)],
                                  ["to:", selectedEmailBody?.to || mailbox.email],
                                  ["date:", formatFullDate(selectedEmail.date)],
                                  ["subject:", selectedEmail.subject || "(No subject)"]
                                ].map(([key, val]) => (
                                  <tr key={key}>
                                    <td className="w-16 py-1.5 text-muted font-medium align-top pr-2">{key}</td>
                                    <td className="py-1.5 text-ink font-semibold break-all">{val}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Email Body Content */}
                <div className="py-8">
                  {bodyLoading ? (
                    <div className="grid gap-3 py-4 animate-pulse">
                      <div className="h-4 bg-soft w-full rounded" />
                      <div className="h-4 bg-soft w-5/6 rounded" />
                      <div className="h-4 bg-soft w-4/5 rounded" />
                      <div className="h-4 bg-soft w-11/12 rounded" />
                    </div>
                  ) : selectedEmailBody?.html ? (
                    <div className="relative w-full h-[550px] border border-line/40 rounded-sm overflow-hidden bg-white">
                      <iframe
                        srcDoc={`
                          <!DOCTYPE html>
                          <html>
                            <head>
                              <style>
                                body {
                                  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                                  font-size: 14px;
                                  line-height: 1.6;
                                  color: #333333;
                                  margin: 16px;
                                }
                                a { color: #3148d4; }
                                p { margin-top: 0; margin-bottom: 1em; }
                              </style>
                            </head>
                            <body>
                              ${selectedEmailBody.html}
                            </body>
                          </html>
                        `}
                        className="w-full h-full border-0 bg-white"
                        title="Email Content"
                      />
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap font-sans text-[15px] leading-7 text-muted bg-[#faf9f6]/40 p-6 border border-line/40 rounded-sm">
                      {selectedEmailBody?.body || "No message body content."}
                    </div>
                  )}
                </div>

                <div className="border-t border-line/50 pt-6 mt-4">
                  <div className="grid grid-cols-3 border border-line bg-[#fbfaf7] text-sm max-md:grid-cols-1">
                    <div className="border-r border-line p-4 max-md:border-b max-md:border-r-0">
                      <span className="block font-bold text-muted">Mailbox</span>
                      <strong className="mt-1 block break-words text-ink">{mailbox.email}</strong>
                    </div>
                    <div className="border-r border-line p-4 max-md:border-b max-md:border-r-0">
                      <span className="block font-bold text-muted">Quota</span>
                      <strong className="mt-1 block text-ink">{mailbox.quotaMb} MB</strong>
                    </div>
                    <div className="p-4">
                      <span className="block font-bold text-muted">Created</span>
                      <strong className="mt-1 block text-ink">{new Date(mailbox.createdAt).toLocaleDateString()}</strong>
                    </div>
                  </div>
                </div>
              </article>
            ) : (
              <div className="grid min-h-[520px] place-items-center text-center">
                <div className="max-w-[420px]">
                  <div className="mx-auto grid h-28 w-28 place-items-center rounded-full bg-wash text-cta">
                    <MailIcon className="h-14 w-14" />
                  </div>
                  <h2 className="mt-7 text-3xl font-extrabold tracking-[-0.03em] text-ink">Choose a message</h2>
                  <p className="mt-3 leading-7 text-muted">Select an email from the inbox list, or open webmail for the complete mailbox experience.</p>
                  <a className="button button-primary mt-7" href="/webmail">Open webmail</a>
                </div>
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}


