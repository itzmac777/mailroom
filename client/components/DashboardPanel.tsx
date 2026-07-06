"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { PublicMailbox, EmailMessage, PublicMailAlias, VerificationMatch } from "@/lib/types";

type MailFolder = "inbox" | "sent" | "spam" | "trash";

type Folder = {
  id: MailFolder;
  label: string;
  count?: number;
};

type IconProps = {
  className?: string;
};

const folders: Folder[] = [
  { id: "inbox", label: "Inbox" },
  { id: "sent", label: "Sent" },
  { id: "spam", label: "Spam" },
  { id: "trash", label: "Trash" }
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

function CheckIcon({ className = "" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m5 12 4.2 4.2L19 6.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
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
  deliveredToAlias?: PublicMailAlias;
  verification?: VerificationMatch;
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
  const [copiedValue, setCopiedValue] = useState("");

  const [showDetails, setShowDetails] = useState(false);
  const [emailBodies, setEmailBodies] = useState<Record<string, EmailBodyDetails>>({});
  const [bodyLoading, setBodyLoading] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "preview">("list");
  const [activeFolder, setActiveFolder] = useState<MailFolder>("inbox");
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeMessage, setComposeMessage] = useState("");
  const [composeFromAliasId, setComposeFromAliasId] = useState("");
  const [sending, setSending] = useState(false);
  const [moving, setMoving] = useState(false);
  const [aliases, setAliases] = useState<PublicMailAlias[]>([]);
  const [aliasLimit, setAliasLimit] = useState(5);
  const [verificationMatches, setVerificationMatches] = useState<VerificationMatch[]>([]);
  const [verificationLoading, setVerificationLoading] = useState(false);

  const fetchMailboxAndEmails = async () => {
    try {
      const result = await api<{ mailbox: PublicMailbox }>("/api/me/mailbox");
      setMailbox(result.mailbox);
      setAliases(result.mailbox.aliases || []);
      setAliasLimit(result.mailbox.aliasLimit || 5);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Not signed in.");
    }
  };

  const fetchEmailsList = async () => {
    setRefreshing(true);
    try {
      const result = await api<{ emails: EmailMessage[] }>(`/api/me/emails?folder=${activeFolder}`);
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
      if (activeFolder === "inbox") fetchVerificationCodes().catch(() => undefined);
    }
  }, [mailbox, activeFolder]);

  useEffect(() => {
    if (selectedEmail && !emailBodies[selectedEmail.uid]) {
      setBodyLoading(true);
      api<{ email: EmailBodyDetails }>(`/api/me/email?folder=${activeFolder}&uid=${selectedEmail.uid}`)
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
  }, [selectedEmailUid, activeFolder]);

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
  const selectedDeliveredAlias = selectedEmailBody?.deliveredToAlias ?? selectedEmail?.deliveredToAlias;
  const composeAlias = aliases.find((alias) => alias.id === composeFromAliasId);
  const activeAliasCount = aliases.filter((alias) => alias.status === "active").length;

  const mailboxInitial = mailbox?.displayName?.[0] ?? mailbox?.local?.[0] ?? "M";
  const activeFolders = folders.map((folder) => folder.id === "inbox" ? { ...folder, count: unreadCount } : folder);
  const activeFolderLabel = folders.find((folder) => folder.id === activeFolder)?.label ?? "Inbox";

  async function copyMailboxAddress() {
    if (!mailbox) return;
    await copyText(mailbox.email);
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(value);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
        setCopiedValue("");
      }, 1600);
    } catch {
      setCopied(false);
      setCopiedValue("");
    }
  }

  function openCompose() {
    setComposeTo("");
    setComposeSubject("");
    setComposeBody("");
    setComposeFromAliasId("");
    setComposeMessage("");
    setComposeOpen(true);
  }

  async function fetchVerificationCodes() {
    setVerificationLoading(true);
    try {
      const result = await api<{ matches: VerificationMatch[] }>("/api/me/verification-codes?limit=10");
      setVerificationMatches(result.matches);
    } catch {
      setVerificationMatches([]);
    } finally {
      setVerificationLoading(false);
    }
  }

  function openReply() {
    if (!selectedEmail) return;
    setComposeTo(senderAddress(selectedEmail.from));
    setComposeSubject(selectedEmail.subject?.toLowerCase().startsWith("re:") ? selectedEmail.subject : `Re: ${selectedEmail.subject || "(No subject)"}`);
    setComposeBody(`\n\nOn ${formatFullDate(selectedEmail.date)}, ${senderName(selectedEmail.from)} wrote:`);
    setComposeFromAliasId(selectedDeliveredAlias?.id || "");
    setComposeMessage("");
    setComposeOpen(true);
  }

  async function submitCompose(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setComposeMessage("Sending...");
    try {
      await api<{ result: unknown }>("/api/me/send", {
        method: "POST",
        body: JSON.stringify({ to: composeTo, subject: composeSubject, body: composeBody, replyToUid: selectedEmail?.uid, replyFolder: activeFolder, fromAliasId: composeFromAliasId || undefined })
      });
      setComposeMessage("Sent.");
      setComposeOpen(false);
      setComposeTo("");
      setComposeSubject("");
      setComposeBody("");
      if (activeFolder === "sent") await fetchEmailsList();
    } catch (error) {
      setComposeMessage(error instanceof Error ? error.message : "Failed to send email.");
    } finally {
      setSending(false);
    }
  }

  async function moveSelected(toFolder: MailFolder) {
    if (!selectedEmail || toFolder === activeFolder) return;
    setMoving(true);
    try {
      await api<{ result: unknown }>("/api/me/email/move", {
        method: "POST",
        body: JSON.stringify({ uid: selectedEmail.uid, fromFolder: activeFolder, toFolder })
      });
      setSelectedEmailUid(null);
      setEmailBodies({});
      await fetchEmailsList();
    } catch (error) {
      setEmailsError(error instanceof Error ? error.message : "Failed to move email.");
    } finally {
      setMoving(false);
    }
  }

  function renderSidebarContent() {
    if (!mailbox) return null;
    return (
      <>
        <div className="border-b border-line p-5">
          <div className="relative">
            <div 
              onClick={() => setShowProfileDropdown((prev) => !prev)}
              className="flex items-center gap-3 cursor-pointer group select-none hover:bg-wash/50 p-2 rounded-sm transition-colors duration-150"
            >
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-line bg-white text-lg font-extrabold text-cta shadow-[0_10px_30px_rgba(49,72,212,0.12)]">
                {mailboxInitial.toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-extrabold text-ink group-hover:text-cta transition-colors">Me</p>
                  <svg 
                    className={`h-4 w-4 text-muted transition-transform duration-200 ${showProfileDropdown ? "rotate-180" : ""}`}
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2.5"
                  >
                    <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p className="truncate text-xs font-medium text-muted">{mailbox.email}</p>
              </div>
            </div>

            {/* Profile Dropdown Menu */}
            {showProfileDropdown && (
              <div className="absolute left-0 top-full z-30 mt-2 w-full border border-line bg-white p-2 shadow-xl rounded-sm">
                <button
                  type="button"
                  onClick={() => {
                    copyMailboxAddress();
                    setShowProfileDropdown(false);
                  }}
                  className="flex w-full items-center gap-3 p-3 text-left text-sm font-semibold text-ink hover:bg-wash transition-colors"
                >
                  <svg className="h-4 w-4 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span>Copy my email address</span>
                </button>
                <a
                  href="/webmail"
                  onClick={() => setShowProfileDropdown(false)}
                  className="flex w-full items-center gap-3 p-3 text-left text-sm font-semibold text-ink hover:bg-wash transition-colors"
                >
                  <svg className="h-4 w-4 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  <span>Settings</span>
                </a>
                <a
                  href="/logout"
                  onClick={() => setShowProfileDropdown(false)}
                  className="flex w-full items-center gap-3 p-3 text-left text-sm font-semibold text-red-600 hover:bg-wash transition-colors"
                >
                  <svg className="h-4 w-4 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  <span>Log out</span>
                </a>
              </div>
            )}
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
          <button className="button button-primary min-h-[44px] w-full px-4" type="button" onClick={openCompose}>Compose</button>
          <nav className="grid gap-1" aria-label="Mailbox folders">
            {activeFolders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                onClick={() => setActiveFolder(folder.id)}
                className={`flex min-h-11 items-center justify-between border px-3 text-left text-sm font-bold transition-colors ${activeFolder === folder.id ? "border-cta bg-wash text-cta" : "border-transparent text-muted hover:border-line hover:bg-white hover:text-ink"}`}
              >
                <span className="flex items-center gap-2"><MailIcon className="h-4 w-4" />{folder.label}</span>
                {typeof folder.count === "number" ? <span className="rounded-full bg-white px-2 py-0.5 text-xs text-cta">{folder.count}</span> : null}
              </button>
            ))}
          </nav>
          <Link href="/dashboard/aliases" className="border border-line bg-white p-3 transition-colors hover:border-cta hover:bg-wash">
            <span className="eyebrow m-0 block text-[9px]">Routing</span>
            <span className="mt-2 flex items-center justify-between gap-3">
              <strong className="text-sm text-ink">{activeAliasCount}/{aliasLimit} aliases</strong>
              <span className="text-xs font-bold text-cta">Manage</span>
            </span>
          </Link>
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
      </>
    );
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
    <main className="bg-[#fbfaf7] px-6 py-7 max-md:px-0 max-md:py-0">
      {/* Left Sidebar Mobile Drawer */}
      {isLeftSidebarOpen && (
        <>
          {/* Backdrop Overlay */}
          <div 
            onClick={() => setIsLeftSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-sm transition-opacity duration-200" 
          />
          {/* Drawer Menu */}
          <aside className="fixed inset-y-0 left-0 z-50 w-[280px] border-r border-line bg-[#fbfaf7] shadow-xl flex flex-col animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between border-b border-line p-5 bg-white">
              <span className="text-lg font-bold tracking-tight text-ink">Mailbox Details</span>
              <button
                type="button"
                onClick={() => setIsLeftSidebarOpen(false)}
                className="grid h-10 w-10 place-items-center border border-line text-ink hover:text-cta transition-colors"
                aria-label="Close menu"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto flex flex-col justify-between">
              {renderSidebarContent()}
            </div>
          </aside>
        </>
      )}

      <section className="mx-auto grid min-h-[calc(100vh-178px)] max-md:min-h-[calc(100vh-56px)] max-w-[1480px] grid-cols-[260px_minmax(360px,460px)_1fr] overflow-hidden border border-line max-md:border-0 bg-white shadow-soft max-xl:grid-cols-[220px_minmax(330px,430px)_1fr] max-lg:grid-cols-1">
        {/* Desktop Sidebar (hidden on mobile) */}
        <aside className="grid border-r border-line bg-soft/45 max-lg:hidden">
          {renderSidebarContent()}
        </aside>

        <section className={`grid min-h-0 min-w-0 grid-rows-[auto_1fr] border-r border-line max-lg:border-b max-lg:border-r-0 ${mobileView === "preview" ? "max-lg:hidden" : "max-lg:grid"}`}>
          <header className="border-b border-line bg-white p-5 max-md:p-3.5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 max-md:gap-2">
                <button
                  type="button"
                  onClick={() => setIsLeftSidebarOpen(true)}
                  className="hidden max-lg:grid h-10 w-10 max-md:h-8 max-md:w-8 shrink-0 place-items-center border border-line bg-white text-ink hover:border-cta hover:text-cta transition-colors"
                  aria-label="Toggle mailbox details"
                >
                  <svg className="h-5 w-5 max-md:h-4 max-md:w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </svg>
                </button>
                <div>
                  <p className="eyebrow m-0 max-md:text-[9px] max-md:tracking-wider">Mailbox dashboard</p>
                  <h1 className="mt-2 max-md:mt-1 text-2xl max-md:text-lg font-extrabold tracking-[-0.02em] text-ink">{activeFolderLabel}</h1>
                </div>
              </div>
              <button
                type="button"
                onClick={fetchEmailsList}
                disabled={emailsLoading || refreshing}
                className="grid h-11 w-11 max-md:h-8 max-md:w-8 place-items-center border border-line bg-white text-ink transition-colors hover:border-cta hover:text-cta disabled:opacity-50"
                aria-label="Sync mail"
                title="Sync mail"
              >
                <RefreshIcon className={`h-5 w-5 max-md:h-4 max-md:w-4 ${refreshing ? "animate-spin" : ""}`} />
              </button>
            </div>
            <label className="mt-5 max-md:mt-3 grid grid-cols-[auto_1fr] items-center gap-2 border border-line bg-[#fbfaf7] px-3 max-md:px-2 focus-within:border-cta">
              <SearchIcon className="h-5 w-5 max-md:h-4 max-md:w-4 text-muted" />
              <input
                className="min-h-11 max-md:min-h-8 border-0 bg-transparent text-sm text-ink outline-none placeholder:text-muted/70 focus:outline-none"
                placeholder="Search messages"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </header>

          <div className="min-h-0 overflow-y-auto bg-white">
                        {activeFolder === "inbox" ? (
              <div className="border-b border-line bg-[#fbfaf7] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div><p className="eyebrow m-0 text-[9px]">Verification tray</p><strong className="text-sm text-ink">Verification codes</strong></div>
                  <button className="text-xs font-bold text-cta" type="button" onClick={() => fetchVerificationCodes().catch(() => undefined)}>{verificationLoading ? "Scanning..." : "Scan"}</button>
                </div>
                {verificationMatches.length ? (
                  <div className="grid gap-2">
                    {verificationMatches.slice(0, 3).map((match) => (
                      <div key={`${match.uid}-${match.code}`} className="grid grid-cols-[1fr_auto] items-center gap-3 border border-line bg-white p-3 text-xs">
                        <span className="min-w-0"><strong className="block truncate text-ink">{match.serviceHint || senderName(match.from)}</strong><span className="mt-1 block truncate text-muted">{match.subject}</span></span>
                        <span className="flex items-center gap-2">
                          <strong className="font-extrabold text-cta">{match.code}</strong>
                          <button className="grid h-8 w-8 place-items-center border border-line text-ink hover:border-cta hover:text-cta" type="button" onClick={() => match.code ? copyText(match.code) : undefined} aria-label={copiedValue === match.code ? "Copied" : "Copy verification code"} title={copiedValue === match.code ? "Copied" : "Copy"}>
                            {copiedValue === match.code ? <CheckIcon className="h-4 w-4 text-cta" /> : <CopyIcon className="h-4 w-4" />}
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs leading-5 text-muted">{verificationLoading ? "Scanning recent inbox messages..." : "No recent verification codes found."}</p>}
              </div>
            ) : null}{emailsLoading ? (
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
                      onClick={() => {
                        setSelectedEmailUid(email.uid);
                        setMobileView("preview");
                      }}
                      className={`grid w-full grid-cols-[auto_1fr_auto] gap-4 p-5 max-md:p-4 text-left transition-colors border-b border-line/30 ${active ? "bg-wash" : "bg-white hover:bg-[#fbfaf7]"}`}
                    >
                      <span className={`mt-2 h-2 w-2 rounded-full shrink-0 ${active ? "bg-cta" : "bg-[#f05a28]"}`} aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] max-md:text-[14px] font-extrabold text-ink">
                          {email.subject || "(No subject)"}
                        </span>
                        <span className="mt-1 block truncate text-xs text-muted">
                          {senderName(email.from)} &lt;{senderAddress(email.from)}&gt;
                        </span>
                        <span className="mt-2 flex flex-wrap gap-2">
                          {email.deliveredToAlias ? <span className="border border-cta/30 bg-wash px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cta">to {email.deliveredToAlias.local}</span> : null}
                          {email.verification ? <span className="border border-line bg-[#fbfaf7] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">code</span> : null}
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

        <section className={`grid min-h-0 min-w-0 grid-rows-[auto_1fr] bg-white ${mobileView === "list" ? "max-lg:hidden" : "max-lg:grid"}`}>
          <header className="flex min-h-[86px] max-md:min-h-[64px] items-center justify-between gap-4 border-b border-line px-7 py-5 max-md:px-4 max-md:py-3">
            <div className="flex items-center gap-3 min-w-0">
              {/* Mobile Back Button */}
              <button
                type="button"
                onClick={() => setMobileView("list")}
                className="hidden max-lg:grid h-10 w-10 max-md:h-8 max-md:w-8 shrink-0 place-items-center border border-line bg-white text-ink hover:border-cta hover:text-cta transition-colors"
                aria-label="Back to inbox"
              >
                <svg className="h-5 w-5 max-md:h-4 max-md:w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
              </button>
              <div className="min-w-0">
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-cta max-md:text-[9px]">Message preview</p>
                <p className="mt-1 truncate text-sm max-md:text-xs font-medium text-muted">{selectedDeliveredAlias ? `to ${selectedDeliveredAlias.email}` : selectedEmail ? senderAddress(selectedEmail.from) : mailbox.email}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {selectedEmail ? (
                <>
                  <button type="button" onClick={openReply} className="button button-secondary min-h-[36px] px-3 text-xs">Reply</button>
                  {activeFolder !== "inbox" ? <button type="button" onClick={() => moveSelected("inbox")} disabled={moving} className="button button-secondary min-h-[36px] px-3 text-xs">Inbox</button> : null}
                  {activeFolder !== "spam" ? <button type="button" onClick={() => moveSelected("spam")} disabled={moving} className="button button-secondary min-h-[36px] px-3 text-xs">Spam</button> : null}
                  {activeFolder !== "trash" ? <button type="button" onClick={() => moveSelected("trash")} disabled={moving} className="button button-secondary min-h-[36px] px-3 text-xs">Trash</button> : null}
                </>
              ) : null}
              <button
                type="button"
                onClick={copyMailboxAddress}
                className="grid h-11 w-11 max-md:h-8 max-md:w-8 place-items-center border border-line bg-white text-ink transition-colors hover:border-cta hover:text-cta"
                aria-label="Copy mailbox address"
                title={copied ? "Copied" : "Copy mailbox address"}
              >
                <CopyIcon className="h-5 w-5 max-md:h-4 max-md:w-4" />
              </button>
            </div>
          </header>

          <div className="min-h-0 overflow-y-auto p-7 max-md:p-4">
            {selectedEmail ? (
              <article className="mx-auto max-w-[780px] w-full min-w-0">
                <div className="border-b border-line pb-6 max-md:pb-4">
                  {/* Subject and Date line */}
                  <div className="flex flex-wrap items-baseline gap-3 pb-3 mb-5 max-md:mb-3">
                    <span className="h-2 w-2 rounded-full bg-cta shrink-0 self-center" />
                    <h2 className="text-xl max-md:text-base font-bold tracking-tight text-ink">
                      {selectedEmail.subject || "(No subject)"}
                    </h2>
                    <span className="text-xs font-medium text-muted">
                      {formatFullDate(selectedEmail.date)}
                    </span>
                  </div>

                  {/* Sender details and 'to me' dropdown */}
                  <div className="relative flex items-start gap-3 mt-4 max-md:mt-3">
                    <span className="grid h-10 w-10 max-md:h-8 max-md:w-8 shrink-0 place-items-center rounded-full bg-wash text-sm max-md:text-xs font-extrabold text-cta">
                      {senderName(selectedEmail.from)[0]?.toUpperCase() ?? "M"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm max-md:text-xs">
                        <strong className="font-semibold text-ink">{senderName(selectedEmail.from)}</strong>{" "}
                        <span className="text-muted/80 text-xs max-md:text-[10px] font-medium">&lt;{senderAddress(selectedEmail.from)}&gt;</span>
                      </div>
                      {selectedDeliveredAlias ? <p className="mt-1 inline-flex border border-cta/30 bg-wash px-2 py-1 text-[11px] font-bold text-cta">Delivered to {selectedDeliveredAlias.email}</p> : null}
                      {selectedEmailBody?.verification ? (
                        <div className="mt-2 inline-flex items-center gap-2 border border-line bg-[#fbfaf7] px-3 py-2 text-xs font-bold text-ink">
                          <span>Code: {selectedEmailBody.verification.code}</span>
                          <button type="button" onClick={() => selectedEmailBody.verification?.code ? copyText(selectedEmailBody.verification.code) : undefined} className="grid h-7 w-7 place-items-center border border-line bg-white text-ink hover:border-cta hover:text-cta" aria-label="Copy verification code" title={copiedValue === selectedEmailBody.verification.code ? "Copied" : "Copy"}>
                            {copiedValue === selectedEmailBody.verification.code ? <CheckIcon className="h-3.5 w-3.5 text-cta" /> : <CopyIcon className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      ) : null}
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
                          <div className="absolute left-0 top-full z-20 mt-2 w-full max-w-md border border-line bg-white p-4 max-md:p-3 shadow-soft rounded-sm">
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
                <div className="py-8 max-md:py-4">
                  {bodyLoading ? (
                    <div className="grid gap-3 py-4 animate-pulse">
                      <div className="h-4 bg-soft w-full rounded" />
                      <div className="h-4 bg-soft w-5/6 rounded" />
                      <div className="h-4 bg-soft w-4/5 rounded" />
                      <div className="h-4 bg-soft w-11/12 rounded" />
                    </div>
                  ) : selectedEmailBody?.html ? (
                    <div className="relative w-full h-[550px] max-md:h-[400px] border border-line/40 rounded-sm overflow-x-auto bg-white">
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
                              ${selectedEmailBody.html}
                            </body>
                          </html>
                        `}
                        className="w-full h-full border-0 bg-white"
                        title="Email Content"
                      />
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap font-sans text-[15px] max-md:text-sm leading-7 max-md:leading-6 text-muted bg-[#faf9f6]/40 p-6 max-md:p-4 border border-line/40 rounded-sm">
                      {selectedEmailBody?.body || "No message body content."}
                    </div>
                  )}
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

      {composeOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4 backdrop-blur-sm">
          <form className="grid w-full max-w-[620px] gap-4 border border-line bg-white p-6 shadow-soft" onSubmit={submitCompose}>
            <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
              <div>
                <p className="eyebrow m-0">Permanent mail</p>
                <h2 className="mt-2 text-2xl font-extrabold text-ink">Compose</h2>
              </div>
              <button type="button" className="grid h-10 w-10 place-items-center border border-line text-ink hover:text-cta" onClick={() => setComposeOpen(false)} aria-label="Close compose">x</button>
            </div>
            {composeAlias ? <div className="border border-cta/30 bg-wash p-3 text-sm font-bold text-cta">Replying from {composeAlias.email}</div> : null}
            <label className="label">To<input className="field" value={composeTo} onChange={(event) => setComposeTo(event.target.value)} placeholder="friend@example.com" required /></label>
            <label className="label">Subject<input className="field" value={composeSubject} onChange={(event) => setComposeSubject(event.target.value)} placeholder="Subject" required /></label>
            <label className="label">Message<textarea className="min-h-48 w-full border border-line bg-white p-3 text-ink focus:outline-2 focus:outline-cta" value={composeBody} onChange={(event) => setComposeBody(event.target.value)} required /></label>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="min-h-6 text-sm font-bold text-muted">{composeMessage}</p>
              <button className="button button-primary" type="submit" disabled={sending}>{sending ? "Sending..." : "Send"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}









