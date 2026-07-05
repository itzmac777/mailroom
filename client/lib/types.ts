export type PublicConfig = {
  mailDomain: string;
  mailHostname: string;
  webmailUrl: string;
  dryRun: boolean;
  defaultQuotaMb: number;
  defaultOutboundDailyLimit: number;
  tempMailEnabled: boolean;
};

export type PublicMailbox = {
  id: string;
  local: string;
  domain: string;
  email: string;
  displayName: string;
  kind: "temporary" | "permanent";
  status: "dry-run" | "active";
  quotaMb: number;
  outboundDailyLimit: number;
  createdAt: string;
  inviteCode?: string;
  expiresAt?: string;
  disabledAt?: string;
  deletedAt?: string;
  webmailUrl: string;
};

export type AdminSummary = {
  dryRun: boolean;
  tempMailEnabled?: boolean;
  mailboxes: PublicMailbox[];
  mailboxCounts?: { permanent: number; temporary?: number; expiredTemporary?: number };
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