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
  link?: string;
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

export type RotatorAccount = {
  id: string;
  label: string;
  email: string;
  status: "unknown" | "active" | "needs_relogin";
  hasSession: boolean;
  lastUsed?: string;
  lastVerifiedAt?: string;
  createdAt: string;
};

export type RotatorDevice = {
  id: string;
  name: string;
  createdAt: string;
  lastSeenAt?: string;
};

export type DomainAliasMapping = {
  id: string;
  domain: string;
  alias: string;
  createdAt: string;
  lastUsedAt: string;
};

export type RotatorAuditEntry = {
  id: string;
  at: string;
  deviceId: string;
  accountId?: string;
  jobId?: string;
  itemId?: string;
  event:
    | "session_fetched"
    | "onboarding_credential_claimed"
    | "onboarding_otp_fetch"
    | "site_alias_created"
    | "site_alias_lookup"
    | "site_alias_otp_fetch"
    | "site_alias_mapping_deleted";
};

export type RotatorOnboardingItem = {
  id: string;
  accountId: string;
  email: string;
  hasPassword: boolean;
  label?: string;
  status: "queued" | "logging_in" | "awaiting_otp" | "verifying" | "saved" | "failed" | "needs_manual";
  errorReason?: "wrong_password" | "otp_timeout" | "captcha_encountered" | "unexpected_page" | "unknown_error" | "missing_password" | "otp_not_found";
  errorDetail?: string;
  attempts: number;
  claimedByDeviceId?: string;
  claimedAt?: string;
  completedAt?: string;
};

export type RotatorOnboardingJob = {
  id: string;
  createdAt: string;
  status: "running" | "completed" | "cancelled";
  createdByDevice?: string;
  items: RotatorOnboardingItem[];
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
  forwardSender?: TempInboxForwardSender;
  forwarding?: {
    enabled: boolean;
    recipients: string[];
    intervalSeconds: 10 | 20 | 30;
    lastForwardCheckAt?: string;
    lastForwardedAt?: string;
    lastForwardedCount?: number;
    lastForwardError?: string;
  };
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
  forwarding?: {
    forwarded: number;
    skipped: number;
    recipients: string[];
    errors: string[];
    sender?: TempInboxForwardSender;
  };
  account?: TempInboxAccount;
  forwardSender?: TempInboxForwardSender;
};

export type TempInboxForwardSender = {
  email?: string;
  source: "dashboard" | "env" | "account" | "none";
  error?: string;
};
