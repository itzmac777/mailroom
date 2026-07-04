import { ClaimForm } from "@/components/ClaimForm";
import { getPublicConfig } from "@/lib/api";

export default async function ClaimPage() {
  const config = await getPublicConfig();

  return (
    <main className="bg-white">
      <section className="mx-auto grid max-w-[1180px] grid-cols-[0.8fr_0.72fr] gap-16 px-8 py-16 max-lg:grid-cols-1 max-md:px-5 max-md:py-10">
        <div className="max-w-[620px]">
          <p className="eyebrow">Claim mailbox</p>
          <h1 className="text-[clamp(44px,5.4vw,76px)] font-semibold leading-[0.98] tracking-[-0.055em]">Create a mailbox with permission, not chaos.</h1>
          <p className="mt-6 text-[18px] leading-8 text-muted">Invite codes keep account creation intentional. Every address is checked against reserved names and risky local-part patterns before the server creates anything.</p>
          <div className="mt-10 grid divide-y divide-line border-y border-line">
            {[
              ["01", "Verify invite", "Only approved users can create addresses."],
              ["02", "Choose local part", "Reserved names and unsafe patterns are blocked."],
              ["03", "Open webmail", "After creation, users land in their mailbox dashboard."]
            ].map(([number, title, body]) => (
              <div key={number} className="grid grid-cols-[52px_1fr] gap-5 py-5">
                <span className="font-bold text-cta">{number}</span>
                <div><strong>{title}</strong><p className="mt-1 text-sm leading-6 text-muted">{body}</p></div>
              </div>
            ))}
          </div>
        </div>
        <ClaimForm mailDomain={config.mailDomain} />
      </section>
    </main>
  );
}
