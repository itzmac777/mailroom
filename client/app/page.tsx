import Link from "next/link";
import { getPublicConfig } from "@/lib/api";

export default async function HomePage() {
  const config = await getPublicConfig();

  return (
    <main className="bg-white">
      <section className="mx-auto grid max-w-[1320px] grid-cols-[0.82fr_1.18fr] items-center gap-16 px-8 py-16 max-lg:grid-cols-1 max-md:px-5 max-md:py-10">
        <div className="max-w-[610px]">
          <p className="eyebrow">Invite-only domain mail</p>
          <h1 className="text-[clamp(56px,6.3vw,96px)] font-semibold leading-[0.95] tracking-[-0.055em] text-ink max-md:text-[48px]">
            Private email, built for your domain.
          </h1>
          <p className="mt-7 max-w-[540px] text-[18px] leading-8 text-muted">
            Let trusted users claim addresses, open webmail, and stay inside sane sending limits before your domain reputation is on the line.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link className="button button-primary" href="/claim">Claim an address</Link>
            <Link className="button button-secondary" href="/login">Sign in</Link>
          </div>
        </div>

        <div className="relative min-h-[520px] overflow-hidden border border-line bg-wash max-md:min-h-[480px]">
          <div className="absolute inset-0 bg-[linear-gradient(90deg,#ffffff_0%,rgba(255,255,255,.88)_35%,rgba(255,255,255,.45)_70%,rgba(255,255,255,.15)_100%)]" />
          <div className="absolute bottom-0 right-0 h-[86%] w-[76%] border-l border-t border-line bg-white/85 shadow-soft backdrop-blur-sm max-md:w-[92%]">
            <div className="flex h-14 items-center justify-between border-b border-line px-5 text-sm font-semibold">
              <span>{config.mailDomain}</span>
              <span className="text-cta">Protected warmup</span>
            </div>
            <div className="grid h-[calc(100%-56px)] grid-cols-[160px_1fr] max-md:grid-cols-[118px_1fr]">
              <aside className="border-r border-line bg-soft/70 p-5 text-sm font-medium text-muted">
                <div className="mb-4 text-ink">Inbox</div>
                <div className="mb-4">Sent</div>
                <div className="mb-4">Quarantine</div>
                <div>Audit</div>
              </aside>
              <div className="grid grid-rows-[auto_1fr]">
                <div className="grid divide-y divide-line border-b border-line">
                  <div className="bg-white p-5"><strong>Welcome packet</strong><p className="mt-1 text-sm text-muted">Mailbox ready</p></div>
                  <div className="p-5"><strong>DNS monitor</strong><p className="mt-1 text-sm text-muted">DMARC passing</p></div>
                  <div className="p-5"><strong>Outbound guard</strong><p className="mt-1 text-sm text-muted">{config.defaultOutboundDailyLimit} daily sends</p></div>
                </div>
                <div className="p-8 max-md:p-5">
                  <p className="eyebrow">example@{config.mailDomain}</p>
                  <h2 className="max-w-[430px] text-[44px] font-semibold leading-none tracking-[-0.04em] max-md:text-3xl">Inbox enabled with limits visible.</h2>
                  <div className="mt-8 grid max-w-[420px] grid-cols-2 border border-line text-sm">
                    <div className="border-r border-line p-4"><span className="text-muted">Quota</span><strong className="mt-1 block text-lg">{config.defaultQuotaMb} MB</strong></div>
                    <div className="p-4"><span className="text-muted">Daily send</span><strong className="mt-1 block text-lg">{config.defaultOutboundDailyLimit}</strong></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1320px] grid-cols-3 border-y border-line px-8 py-8 max-lg:grid-cols-1 max-md:px-5">
        {[
          ["Curated access", "Invite codes keep mailbox creation controlled from day one."],
          ["Server-side Mailu", "The browser never sees your Mailu API token or domain controls."],
          ["Reputation aware", "Warmup limits, audit logs, and DNS checks are treated as product primitives."]
        ].map(([title, body], index) => (
          <article key={title} className={`flex gap-5 py-4 ${index < 2 ? "border-r border-line pr-10 max-lg:border-b max-lg:border-r-0 max-lg:pr-0" : "pl-10 max-lg:pl-0"}`}>
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-soft text-cta">{index + 1}</span>
            <div>
              <h2 className="font-bold">{title}</h2>
              <p className="mt-2 max-w-[360px] text-sm leading-6 text-muted">{body}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="mx-auto max-w-[1320px] px-8 py-20 max-md:px-5">
        <div className="mb-8 flex items-end justify-between gap-6 max-md:block">
          <h2 className="text-[42px] font-semibold tracking-[-0.04em]">Operator essentials</h2>
          <Link href="/admin" className="text-sm font-bold text-cta">View admin -&gt;</Link>
        </div>
        <div className="grid grid-cols-3 gap-6 max-lg:grid-cols-1">
          {[
            ["Address rules", "Reserved names and unsafe local-part patterns are blocked before creation."],
            ["Mailbox dashboard", "Users see quota, status, send limits, and webmail access in one place."],
            ["Launch checklist", "Keep PTR, SPF, DKIM, DMARC, TLS, and port checks close to operations."]
          ].map(([title, body]) => (
            <article key={title} className="surface p-7">
              <h3 className="text-xl font-bold">{title}</h3>
              <p className="mt-3 leading-7 text-muted">{body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
