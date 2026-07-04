export type PublicConfig = {
  mailDomain: string;
  mailHostname: string;
  webmailUrl: string;
  dryRun: boolean;
  defaultQuotaMb: number;
  defaultOutboundDailyLimit: number;
};

export type PublicMailbox = {
  id: string;
  local: string;
  domain: string;
  email: string;
  displayName: string;
  status: "dry-run" | "active";
  quotaMb: number;
  outboundDailyLimit: number;
  createdAt: string;
  inviteCode: string;
  webmailUrl: string;
};

export type AdminSummary = {
  dryRun: boolean;
  mailboxes: PublicMailbox[];
  invites: Array<{
    code: string;
    note?: string;
    maxUses: number;
    uses: number;
    createdAt: string;
    expiresAt?: string;
  }>;
  audit: Array<Record<string, unknown>>;
};

export type EmailMessage = {
  uid: string;
  subject: string;
  from: string;
  date: string;
};
