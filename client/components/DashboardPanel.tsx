"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PublicMailbox } from "@/lib/types";

export function DashboardPanel() {
  const [mailbox, setMailbox] = useState<PublicMailbox | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ mailbox: PublicMailbox }>("/api/me/mailbox")
      .then((result) => setMailbox(result.mailbox))
      .catch((err) => setError(err instanceof Error ? err.message : "Not signed in."));
  }, []);

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
    <main className="grid gap-7 p-12 max-md:p-5">
      <section className="grid gap-4 border-b border-ink pb-7">
        <p className="eyebrow">Mailbox dashboard</p>
        <h1 className="break-words text-[clamp(34px,4.8vw,62px)] font-extrabold leading-none">{mailbox.email}</h1>
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
      <section className="panel max-w-[780px] p-7">
        <p className="eyebrow">Next action</p>
        <h2 className="text-2xl font-extrabold">Use webmail for inbox, compose, folders, and password changes.</h2>
        <p className="mt-3 leading-relaxed text-muted">The custom portal keeps account status and controls visible while Mailu handles the heavy mail client work.</p>
      </section>
    </main>
  );
}

