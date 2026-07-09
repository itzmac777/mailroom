export type PublicConfig = {
  mailDomain: string;
  mailHostname: string;
  webmailUrl: string;
  dryRun: boolean;
  defaultQuotaMb: number;
  defaultOutboundDailyLimit: number;
  defaultAliasLimit?: number;
  aliasForwardLimit?: number;
  forwardingRecipientLimit?: number;
  forwardingVerifyTtlMinutes?: number;
  tempMailEnabled: boolean;
};

export type PublicMailAlias = {
  id: string;
  local: string;
  email: string;
  label?: string;
  status: "active" | "disabled";
  forwardTo: string[];
  createdAt: string;
  disabledAt?: string;
};

export type PublicForwardingRecipient = {
  id: string;
  email: string;
  status: "pending" | "verified";
  includeInGlobalForwarding?: boolean;
  createdAt: string;
  verifiedAt?: string;
  disabledAt?: string;
  codeExpiresAt?: string;
};

export type VerificationMatch = {
  uid: string;
  subject: string;
  from: string;
  code?: string;
  serviceHint?: string;
  date: string;
  confidence: number;
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
  aliasLimit?: number;
  aliases?: PublicMailAlias[];
  forwardingEnabled?: boolean;
  forwardTo?: PublicForwardingRecipient[];
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
  to?: string;
  deliveredToAlias?: PublicMailAlias;
  verification?: VerificationMatch;
  date: string;
};

export type TempInboxAccount = {
  id: string;
  email: string;
  label?: string;
  createdAt: string;
  lastFetchedAt?: string;
};

export type TempInboxMessage = {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  body: string;
  html?: string;
  otp: string;
};

export type TempInboxFetchResult = {
  ok: boolean;
  email: string;
  folder: string;
  total: number;
  count: number;
  messages: TempInboxMessage[];
};
