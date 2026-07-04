import type { Metadata } from "next";
import Link from "next/link";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/dm-sans/800.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mail Portal",
  description: "Invite-only mailbox creation for your own domain."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <div className="bg-soft px-5 py-3 text-center text-sm text-ink">Private email infrastructure for teams that care about deliverability.</div>
        <header className="border-b border-line bg-white">
          <div className="mx-auto flex min-h-[72px] max-w-[1320px] items-center justify-between gap-8 px-8 max-md:flex-col max-md:items-stretch max-md:px-5 max-md:py-4">
            <Link href="/" className="text-[42px] font-semibold leading-none tracking-[-0.03em] max-md:text-4xl" aria-label="Mail Portal home">
              Mailroom
            </Link>
            <nav className="flex items-center gap-8 text-sm font-medium text-ink max-md:grid max-md:grid-cols-4 max-md:gap-0 max-md:border max-md:border-line" aria-label="Primary navigation">
              <Link className="hover:text-cta max-md:border-r max-md:border-line max-md:px-2 max-md:py-3 max-md:text-center" href="/claim">Claim</Link>
              <Link className="hover:text-cta max-md:border-r max-md:border-line max-md:px-2 max-md:py-3 max-md:text-center" href="/dashboard">Dashboard</Link>
              <Link className="hover:text-cta max-md:border-r max-md:border-line max-md:px-2 max-md:py-3 max-md:text-center" href="/admin">Admin</Link>
              <Link className="hover:text-cta max-md:px-2 max-md:py-3 max-md:text-center" href="/login">Sign in</Link>
            </nav>
            <Link className="button button-primary max-md:w-full" href="/claim">Get started</Link>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}

