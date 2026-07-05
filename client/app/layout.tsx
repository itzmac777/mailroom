import type { Metadata } from "next";
import { cookies } from "next/headers";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/dm-sans/800.css";
import "./globals.css";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "Mail Portal",
  description: "Invite-only mailbox creation for your own domain."
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const isLoggedIn = cookieStore.has("mail_portal_session");

  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <Header isLoggedIn={isLoggedIn} />
        {children}
      </body>
    </html>
  );
}
