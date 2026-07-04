import type { PublicConfig } from "./types";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? "Request failed");
  return payload as T;
}

export async function getPublicConfig(): Promise<PublicConfig> {
  try {
    return await api<PublicConfig>("/api/public-config", { cache: "no-store" });
  } catch {
    const fallbackDomain = process.env.NEXT_PUBLIC_MAIL_DOMAIN ?? "yourdomain.com";
    return {
      mailDomain: fallbackDomain,
      mailHostname: `mail.${fallbackDomain}`,
      webmailUrl: `https://mail.${fallbackDomain}/webmail/`,
      dryRun: true,
      defaultQuotaMb: 1024,
      defaultOutboundDailyLimit: 50
    };
  }
}
