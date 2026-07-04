"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PublicMailbox, EmailMessage } from "@/lib/types";

export function DashboardPanel() {
  const [mailbox, setMailbox] = useState<PublicMailbox | null>(null);
  const [error, setError] = useState("");
  const [emails, setEmails] = useState<EmailMessage[] | null>(null);
  const [emailsLoading, setEmailsLoading] = useState(true);
  const [emailsError, setEmailsError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

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

  if (error) {
    return (
      <section className="grid min-h-[calc(100vh-76px)] place-items-start justify-center p-12 max-md:p-5">
        <div className="panel max-w-[620px] p-7">
          <p className="eyebrow">Dashboard</p>
          <h1 className="text-[clamp(34px,4.8vw,62px)] font-extrabold leading-none">Sign in required.</h1>
          <p className="mt-4 text-muted">{error}</p>
          <Link className="button button-primary mt-6" href="/login">Login</Link>
        </div>
      </section>
    );
  }

  if (!mailbox) return <main className="p-12 text-muted">Loading dashboard...</main>;

  return (
    <main className="grid gap-7 p-12 max-md:p-5 max-w-[1200px] mx-auto w-full">
      <section className="grid gap-4 border-b border-ink pb-7">
        <p className="eyebrow">Mailbox dashboard</p>
        <h1 className="break-words text-[clamp(34px,4vw,56px)] font-extrabold leading-none">{mailbox.email}</h1>
        <div className="flex flex-wrap gap-3">
          <a className="button button-primary" href="/webmail">Open webmail</a>
          <a className="button button-secondary" href="/logout">Logout</a>
        </div>
      </section>

      <section className="grid grid-cols-4 gap-px border border-ink bg-ink max-lg:grid-cols-2 max-md:grid-cols-1">
        {[
          ["Status", mailbox.status],
          ["Quota", `${mailbox.quotaMb} MB`],
          ["Daily outbound", String(mailbox.outboundDailyLimit)],
          ["Created", new Date(mailbox.createdAt).toLocaleString()]
        ].map(([label, value]) => (
          <div key={label} className="grid min-h-36 content-between bg-panel p-5">
            <span className="font-bold text-muted">{label}</span>
            <strong className="break-words text-2xl">{value}</strong>
          </div>
        ))}
      </section>

      <section className="panel grid gap-5 p-7">
        <div className="flex items-center justify-between border-b border-line pb-4 flex-wrap gap-3">
          <div>
            <p className="eyebrow m-0">Inbox overview</p>
            <h2 className="text-2xl font-extrabold mt-1">Recent Messages</h2>
          </div>
          <button 
            onClick={fetchEmailsList} 
            disabled={emailsLoading || refreshing}
            className="button button-secondary min-h-[38px] px-4 py-1 flex items-center gap-2 text-sm hover:bg-soft cursor-pointer transition-colors"
          >
            <span className={`inline-block transition-transform duration-500 ${refreshing ? "animate-spin" : ""}`}>🔄</span>
            {refreshing ? "Syncing..." : "Sync Mail"}
          </button>
        </div>

        {emailsLoading ? (
          <div className="grid gap-3 py-6">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-20 animate-pulse border border-line bg-soft/50 p-4 rounded-sm flex flex-col justify-between">
                <div className="h-4 bg-line w-1/3 rounded"></div>
                <div className="h-4 bg-line w-2/3 rounded"></div>
              </div>
            ))}
          </div>
        ) : emailsError ? (
          <div className="p-6 text-center border border-line bg-wash/30 rounded-sm">
            <p className="text-red-600 font-semibold mb-2">Sync Error</p>
            <p className="text-muted text-sm mb-4">{emailsError}</p>
            {emailsError.includes("log in again") ? (
              <Link className="button button-primary min-h-[38px]" href="/login">Sign In Again</Link>
            ) : (
              <button onClick={fetchEmailsList} className="button button-secondary min-h-[38px]">Retry Sync</button>
            )}
          </div>
        ) : !emails || emails.length === 0 ? (
          <div className="py-12 text-center border border-line bg-soft/20 rounded-sm">
            <div className="text-4xl mb-3">📬</div>
            <p className="font-extrabold text-lg text-ink">No emails found</p>
            <p className="text-muted text-sm mt-1 max-w-sm mx-auto">This mailbox is empty. Send a message to {mailbox.email} to test it out!</p>
          </div>
        ) : (
          <div className="grid border border-line divide-y divide-line bg-white">
            {emails.map((email) => (
              <div 
                key={email.uid} 
                className="group flex flex-col md:flex-row md:items-center justify-between p-5 hover:bg-wash transition-colors duration-150 cursor-pointer"
              >
                <div className="grid gap-1 max-w-[80%]">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-ink text-sm group-hover:text-cta transition-colors">
                      {email.from}
                    </span>
                  </div>
                  <h3 className="font-extrabold text-base text-ink line-clamp-1">
                    {email.subject}
                  </h3>
                </div>
                <div className="text-right text-xs text-muted mt-2 md:mt-0 max-md:text-left">
                  {new Date(email.date).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel max-w-[780px] p-7">
        <p className="eyebrow">Next action</p>
        <h2 className="text-2xl font-extrabold">Use webmail for inbox, compose, folders, and password changes.</h2>
        <p className="mt-3 leading-relaxed text-muted">The custom portal keeps account status and controls visible while Mailu handles the heavy mail client work.</p>
      </section>
    </main>
  );
}

