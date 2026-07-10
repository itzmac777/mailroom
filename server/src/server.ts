import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import tls from "node:tls";
import { fileURLToPath } from "node:url";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

type JsonObject = Record<string, unknown>;

type Invite = {
  code: string;
  note?: string;
  maxUses: number;
  uses: number;
  createdAt: string;
  expiresAt?: string;
  revokedAt?: string;
  claimedBy?: string[];
};

type MailAlias = {
  id: string;
  local: string;
  email: string;
  label?: string;
  status: "active" | "disabled";
  forwardTo: string[];
  createdAt: string;
  disabledAt?: string;
  providerResult?: MailuCreateResult;
};

type ForwardingRecipient = {
  id: string;
  email: string;
  status: "pending" | "verified";
  includeInGlobalForwarding?: boolean;
  createdAt: string;
  verifiedAt?: string;
  disabledAt?: string;
  codeHash?: string;
  codeExpiresAt?: string;
  providerResult?: MailuCreateResult;
};

type PublicMailAlias = Omit<MailAlias, "providerResult">;
type PublicForwardingRecipient = Omit<ForwardingRecipient, "codeHash" | "providerResult">;

type VerificationMatch = {
  uid: string;
  subject: string;
  from: string;
  code?: string;
  serviceHint?: string;
  date: string;
  confidence: number;
};

type Mailbox = {
  id: string;
  local: string;
  domain: string;
  email: string;
  displayName: string;
  kind?: "temporary" | "permanent";
  status: "dry-run" | "active";
  quotaMb: number;
  outboundDailyLimit: number;
  passwordHash: string;
  createdAt: string;
  inviteCode?: string;
  expiresAt?: string;
  disabledAt?: string;
  deletedAt?: string;
  webmailUrl: string;
  aliases?: MailAlias[];
  aliasLimit?: number;
  forwardingEnabled?: boolean;
  forwardTo?: ForwardingRecipient[];
  forwardingProviderResult?: MailuCreateResult;
  providerResult: MailuCreateResult;
};

type PublicMailbox = Omit<Mailbox, "passwordHash" | "providerResult" | "aliases" | "forwardTo" | "forwardingProviderResult"> & {
  aliases?: PublicMailAlias[];
  forwardTo?: PublicForwardingRecipient[];
};

type SessionRecord = {
  email: string;
  createdAt: string;
  expiresAt: string;
  encPassword?: string;
};

type AuditEntry = {
  id: string;
  at: string;
  actor: string;
  event: string;
  details: JsonObject;
};

type TempSessionRecord = {
  email: string;
  createdAt: string;
  expiresAt: string;
  encPassword: string;
};

type TempInboxAccount = {
  id: string;
  email: string;
  encPassword: string;
  label?: string;
  forwarding?: TempInboxForwardingConfig;
  createdAt: string;
  lastFetchedAt?: string;
};

type TempInboxForwardingConfig = {
  enabled: boolean;
  recipients: string[];
  intervalSeconds: 10 | 20 | 30;
  forwardedMessageIds?: string[];
  senderSessionId?: string;
  lastForwardCheckAt?: string;
  lastForwardedAt?: string;
  lastForwardedCount?: number;
  lastForwardError?: string;
};

type PublicTempInboxForwardingConfig = Omit<TempInboxForwardingConfig, "forwardedMessageIds" | "senderSessionId">;

type PublicTempInboxAccount = Omit<TempInboxAccount, "encPassword" | "forwarding"> & {
  forwarding?: PublicTempInboxForwardingConfig;
  forwardSender?: PublicTempInboxForwardSender;
};

type NormalizedTempInboxMessage = {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  body: string;
  html?: string;
  otp: string;
};

type NormalizedTempInboxResult = {
  ok: boolean;
  email: string;
  folder: string;
  total: number;
  count: number;
  messages: NormalizedTempInboxMessage[];
};

type TempInboxForwardSender = {
  email?: string;
  source: "dashboard" | "env" | "account" | "none";
  password?: string;
  error?: string;
};

type PublicTempInboxForwardSender = Omit<TempInboxForwardSender, "password">;

type TempInboxSessionRecord = {
  createdAt: string;
  accounts: TempInboxAccount[];
};

type RotatorAccountStatus = "unknown" | "active" | "needs_relogin";

type RotatorAccount = {
  id: string;
  label: string;
  email: string;
  status: RotatorAccountStatus;
  lastUsed?: string;
  lastVerifiedAt?: string;
  createdAt: string;
};

type RotatorDevice = {
  id: string;
  name: string;
  tokenHash: string;
  createdAt: string;
  lastSeenAt?: string;
};

type RotatorSessionSnapshot = {
  accountId: string;
  encryptedPayload: string;
  uploadedByDeviceId: string;
  createdAt: string;
  updatedAt: string;
};

type RotatorOnboardingJobStatus = "running" | "completed" | "cancelled";
type RotatorOnboardingItemStatus = "queued" | "logging_in" | "awaiting_otp" | "verifying" | "saved" | "failed" | "needs_manual";
type RotatorOnboardingErrorReason =
  | "wrong_password"
  | "otp_timeout"
  | "captcha_encountered"
  | "unexpected_page"
  | "unknown_error"
  | "missing_password"
  | "otp_not_found";

type RotatorOnboardingItem = {
  id: string;
  accountId: string;
  email: string;
  hasPassword: boolean;
  label?: string;
  status: RotatorOnboardingItemStatus;
  errorReason?: RotatorOnboardingErrorReason;
  errorDetail?: string;
  attempts: number;
  claimedByDeviceId?: string;
  claimedAt?: string;
  completedAt?: string;
};

type RotatorOnboardingJob = {
  id: string;
  createdAt: string;
  status: RotatorOnboardingJobStatus;
  createdByDevice?: string;
  items: RotatorOnboardingItem[];
};

type RotatorOnboardingCredential = {
  jobId: string;
  itemId: string;
  encryptedPayload: string;
  createdAt: string;
};

type RotatorMailboxCredential = {
  email: string;
  encPassword: string;
  source: "mailu_reset";
  updatedAt: string;
};

type RotatorAuditEntry = {
  id: string;
  at: string;
  deviceId: string;
  accountId?: string;
  jobId?: string;
  itemId?: string;
  event: "session_fetched" | "onboarding_credential_claimed" | "onboarding_otp_fetch";
};

type PublicRotatorAccount = RotatorAccount & {
  hasSession: boolean;
};

type PublicRotatorDevice = Omit<RotatorDevice, "tokenHash">;

type Db = {
  invites: Record<string, Invite>;
  mailboxes: Record<string, Mailbox>;
  sessions: Record<string, SessionRecord>;
  tempSessions: Record<string, TempSessionRecord>;
  tempInboxSessions: Record<string, TempInboxSessionRecord>;
  rotatorAccounts: Record<string, RotatorAccount>;
  rotatorDevices: Record<string, RotatorDevice>;
  rotatorSessions: Record<string, RotatorSessionSnapshot>;
  rotatorOnboardingJobs: Record<string, RotatorOnboardingJob>;
  rotatorOnboardingCredentials: Record<string, RotatorOnboardingCredential>;
  rotatorMailboxCredentials: Record<string, RotatorMailboxCredential>;
  rotatorAudit: RotatorAuditEntry[];
  audit: AuditEntry[];
};

type RateBucket = {
  count: number;
  resetAt: number;
};

type CaptchaChallenge = {
  id: string;
  question: string;
  token: string;
  answer: number;
};

type CaptchaPayload = {
  id?: unknown;
  token?: unknown;
  answer?: unknown;
};

type AuthSession = {
  sessionId: string;
  mailbox: Mailbox;
  encPassword?: string;
};

type MailuCreateArgs = {
  local: string;
  password: string;
  displayName: string;
  kind?: "temporary" | "permanent";
};

type MailuCreateResult = {
  provider: "dry-run" | "mailu";
  message?: string;
  status?: number;
  body?: unknown;
};

type LayoutOptions = {
  title: string;
  active?: string;
  body: string;
  authed?: boolean;
};

type RequestBody = Record<string, any>;
type MailFolder = "inbox" | "sent" | "spam" | "trash";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadDotEnv(): void {
  const envPath = path.join(__dirname, "..", ".env");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();
const env = process.env;

const PORT = Number(env.PORT || 4000);
const DATA_DIR = path.resolve(env.DATA_DIR || path.join(__dirname, "..", "data"));
const DATABASE_URL = env.DATABASE_URL || "";
const DB_PATH = DATABASE_URL.startsWith("file:")
  ? path.resolve(DATABASE_URL.slice("file:".length))
  : path.join(DATA_DIR, "db.json");
const DB_DIR = path.dirname(DB_PATH);
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const APP_SECRET = env.APP_SECRET || "dev-secret-change-me";
const ROTATOR_SESSION_KEY = String(env.ROTATOR_SESSION_KEY || "");
const MAIL_DOMAIN = (env.MAIL_DOMAIN || "example.com").toLowerCase();
const MAIL_HOSTNAME = (env.MAIL_HOSTNAME || `mail.${MAIL_DOMAIN}`).toLowerCase();
const WEBMAIL_URL = env.WEBMAIL_URL || `https://${MAIL_HOSTNAME}/webmail/`;
const ADMIN_TOKEN = env.ADMIN_TOKEN || "change-me";
const DEFAULT_QUOTA_MB = Number(env.DEFAULT_QUOTA_MB || 1024);
const DEFAULT_OUTBOUND_DAILY_LIMIT = Number(env.DEFAULT_OUTBOUND_DAILY_LIMIT || 50);
const DEFAULT_ALIAS_LIMIT = Number(env.DEFAULT_ALIAS_LIMIT || 5);
const ALIAS_FORWARD_LIMIT = Number(env.ALIAS_FORWARD_LIMIT || 3);
const FORWARDING_RECIPIENT_LIMIT = Number(env.FORWARDING_RECIPIENT_LIMIT || 3);
const FORWARDING_VERIFY_TTL_MINUTES = Number(env.FORWARDING_VERIFY_TTL_MINUTES || 30);
const MAILU_DRY_RUN = String(env.MAILU_DRY_RUN ?? "true").toLowerCase() !== "false";
const MAILU_DELETE_USER_ENDPOINT = env.MAILU_DELETE_USER_ENDPOINT || "/api/v1/user";
const MAILU_ALIAS_ENDPOINT = env.MAILU_ALIAS_ENDPOINT || "/api/v1/alias";
const MAILU_FORWARDING_ENDPOINT = env.MAILU_FORWARDING_ENDPOINT || "/api/v1/user";
const MAILU_UPDATE_USER_ENDPOINT = env.MAILU_UPDATE_USER_ENDPOINT || "/api/v1/user";
const SMTP_HOST = env.SMTP_HOST || MAIL_HOSTNAME;
const SMTP_PORT = Number(env.SMTP_PORT || 465);
const SMTP_SECURE = String(env.SMTP_SECURE ?? "true").toLowerCase() !== "false";
const CLIENT_ORIGIN = env.CLIENT_ORIGIN || "http://localhost:3000";
const TEMP_SESSION_COOKIE = "mail_temp_session";
const TEMP_INBOX_SESSION_COOKIE = "mail_temp_inbox_session";
const TEMP_INBOX_SESSION_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
const TEMP_INBOX_FETCH_ENDPOINT = env.TEMP_INBOX_FETCH_ENDPOINT || "https://chongzhi.art/api/mailbox/fetch";
const TEMP_INBOX_FORWARD_FROM_EMAIL = String(env.TEMP_INBOX_FORWARD_FROM_EMAIL || "").trim().toLowerCase();
const TEMP_INBOX_FORWARD_FROM_PASSWORD = String(env.TEMP_INBOX_FORWARD_FROM_PASSWORD || "");
const TEMP_INBOX_BACKGROUND_POLL_MS = Math.max(1000, Number(env.TEMP_INBOX_BACKGROUND_POLL_MS || 5000));
const ROTATOR_ONBOARDING_MAX_ITEMS = Math.min(10, Math.max(1, Number(env.ROTATOR_ONBOARDING_MAX_ITEMS || 10)));
const ROTATOR_ONBOARDING_CREDENTIAL_TTL_MS = 60 * 60 * 1000;
const ROTATOR_ZENVY_IMAP_MASTER_USER = String(env.ROTATOR_ZENVY_IMAP_MASTER_USER || "").trim();
const ROTATOR_ZENVY_IMAP_MASTER_PASSWORD = String(env.ROTATOR_ZENVY_IMAP_MASTER_PASSWORD || "");
const ROTATOR_ZENVY_IMAP_AUTH_FORMAT = String(env.ROTATOR_ZENVY_IMAP_AUTH_FORMAT || "{email}*{masterUser}");
const TEMP_MAIL_ENABLED = String(env.TEMP_MAIL_ENABLED ?? "false").toLowerCase() === "true";
const TEMP_QUOTA_MB = Number(env.TEMP_QUOTA_MB || 128);
const TEMP_OUTBOUND_DAILY_LIMIT = 0;
const FOLDER_NAMES: Record<MailFolder, string> = {
  inbox: "INBOX",
  sent: "Sent",
  spam: "Junk",
  trash: "Trash"
};

const RESERVED = new Set([
  "abuse",
  "admin",
  "administrator",
  "contact",
  "hostmaster",
  "mail",
  "mailer-daemon",
  "noreply",
  "no-reply",
  "postmaster",
  "root",
  "security",
  "support",
  "webmaster"
]);

const MIME: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

const rateBuckets = new Map<string, RateBucket>();

function nowIso(): string {
  return new Date().toISOString();
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": CLIENT_ORIGIN,
    "access-control-allow-credentials": "true"
  });
  res.end(JSON.stringify(payload));
}

function html(res: ServerResponse, body: string, status = 200): void {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { location });
  res.end();
}

function clientIp(req: IncomingMessage): string {
  return (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown")
    .toString()
    .split(",")[0]
    .trim();
}

function hmac(value: string): string {
  return crypto.createHmac("sha256", APP_SECRET).update(value).digest("hex");
}

function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = Buffer.from(APP_SECRET.slice(0, 32).padEnd(32, "0"));
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(text: string): string {
  const parts = text.split(":");
  const iv = Buffer.from(parts.shift() || "", "hex");
  const encryptedText = Buffer.from(parts.join(":"), "hex");
  const key = Buffer.from(APP_SECRET.slice(0, 32).padEnd(32, "0"));
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString("utf8");
}

function decryptOrNull(text?: string): string | null {
  if (!text) return null;
  try {
    return decrypt(text);
  } catch {
    return null;
  }
}

const MOCK_EMAILS = [
  {
    uid: "1",
    subject: "Welcome to your new portal mailbox!",
    from: "Zenvy Support <support@zenvy.com.bd>",
    date: new Date(Date.now() - 3600000).toISOString()
  },
  {
    uid: "2",
    subject: "Domain records configured successfully",
    from: "Zenvy Registrar <billing@zenvy.com.bd>",
    date: new Date(Date.now() - 86400000).toISOString()
  }
];

const MOCK_SENT_EMAILS = [
  {
    uid: "sent-1",
    subject: "Re: Welcome to your new portal mailbox!",
    from: `Me <me@${MAIL_DOMAIN}>`,
    date: new Date(Date.now() - 1800000).toISOString()
  }
];

function mockEmailsForFolder(folder: MailFolder) {
  if (folder === "sent") return MOCK_SENT_EMAILS;
  if (folder === "spam" || folder === "trash") return [];
  return MOCK_EMAILS;
}

function formatAddressList(list?: Array<{ name?: string; address?: string }>): string {
  return (list || [])
    .map((item) => item.address ? `${item.name || ""} <${item.address}>`.trim() : "")
    .filter(Boolean)
    .join(", ");
}

async function fetchEmails(email: string, pass: string, folder: MailFolder = "inbox", aliases: MailAlias[] = []) {
  if (MAILU_DRY_RUN) {
    return mockEmailsForFolder(folder).map((message, index) => {
      const to = index === 0 && aliases[0] ? aliases[0].email : email;
      return { ...message, to, deliveredToAlias: detectDeliveredAlias(to, aliases) };
    });
  }
  
  const client = new ImapFlow({
    host: MAIL_HOSTNAME,
    port: 993,
    secure: true,
    auth: {
      user: email,
      pass
    },
    logger: false,
    // Add TLS options to ignore self-signed certificates or temporary SNI mismatch during setup
    tls: {
      rejectUnauthorized: false
    }
  });
  
  await client.connect();
  const lock = await client.getMailboxLock(FOLDER_NAMES[folder]);
  const emails = [];
  try {
    const status = await client.status(FOLDER_NAMES[folder], { messages: true });
    const count = status.messages || 0;
    if (count > 0) {
      const range = `${Math.max(1, count - 19)}:${count}`;
      for await (const msg of client.fetch({ seq: range }, { envelope: true })) {
        const to = formatAddressList(msg.envelope.to as Array<{ name?: string; address?: string }> | undefined) || email;
        emails.push({
          uid: msg.uid.toString(),
          seq: msg.seq,
          subject: msg.envelope.subject || "(No Subject)",
          from: msg.envelope.from?.[0] 
            ? `${msg.envelope.from[0].name || ""} <${msg.envelope.from[0].address || ""}>`.trim() 
            : "Unknown Sender",
          to,
          deliveredToAlias: detectDeliveredAlias(to, aliases),
          date: msg.envelope.date ? msg.envelope.date.toISOString() : new Date().toISOString()
        });
      }
      emails.sort((a, b) => b.seq - a.seq);
    }
  } finally {
    lock.release();
  }
  await client.logout();
  return emails;
}

async function fetchEmailBody(email: string, pass: string, uid: string, folder: MailFolder = "inbox", aliases: MailAlias[] = []) {
  if (MAILU_DRY_RUN) {
    const mock = mockEmailsForFolder(folder).find((m) => m.uid === uid);
    const to = aliases[0]?.email || email;
    const body = uid === "1"
      ? "Your verification code is 482913. Use it to finish signing in."
      : `Hi there,

This is a mock message body for testing. We are running in dry-run mode, so the server is simulating a live IMAP connection.

Best regards,
The Mailroom Team`;
    const html = uid === "1"
      ? "<p>Your verification code is <strong>482913</strong>. Use it to finish signing in.</p>"
      : `<p>Hi there,</p><p><br></p><p>This is a mock message body for testing. We are running in dry-run mode, so the server is simulating a live IMAP connection.</p><p><br></p><p>Best regards,<br>The Mailroom Team</p>`;
    return {
      uid,
      body,
      html,
      replyTo: mock?.from || "",
      to,
      deliveredToAlias: detectDeliveredAlias(to, aliases),
      verification: extractVerification({ uid, subject: mock?.subject || "", from: mock?.from || "", date: mock?.date || nowIso(), body, html })
    };
  }

  const client = new ImapFlow({
    host: MAIL_HOSTNAME,
    port: 993,
    secure: true,
    auth: {
      user: email,
      pass
    },
    logger: false,
    tls: {
      rejectUnauthorized: false
    }
  });

  await client.connect();
  const lock = await client.getMailboxLock(FOLDER_NAMES[folder]);
  try {
    const msg = await client.fetchOne(uid, { source: true }, { uid: true });
    if (!msg || !msg.source) {
      throw new Error("Message source not found");
    }
    const parsed = await simpleParser(msg.source);
    const body = parsed.text || "";
    const html = parsed.html || parsed.textAsHtml || "";
    const to = parsed.to?.text || email;
    return {
      uid,
      body,
      html,
      replyTo: parsed.replyTo?.text || parsed.from?.text || "",
      to,
      deliveredToAlias: detectDeliveredAlias(to, aliases),
      verification: extractVerification({ uid, subject: parsed.subject || "", from: parsed.from?.text || "", date: parsed.date?.toISOString() || nowIso(), body, html })
    };
  } finally {
    lock.release();
    await client.logout();
  }
}

async function moveEmail(email: string, pass: string, uid: string, fromFolder: MailFolder, toFolder: MailFolder) {
  if (MAILU_DRY_RUN) return { moved: true, dryRun: true };
  const client = new ImapFlow({
    host: MAIL_HOSTNAME,
    port: 993,
    secure: true,
    auth: { user: email, pass },
    logger: false,
    tls: { rejectUnauthorized: false }
  });
  await client.connect();
  const lock = await client.getMailboxLock(FOLDER_NAMES[fromFolder]);
  try {
    await client.messageMove(uid, FOLDER_NAMES[toFolder], { uid: true });
    return { moved: true };
  } finally {
    lock.release();
    await client.logout();
  }
}

function cleanHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function encodeSubject(value: string): string {
  const clean = cleanHeader(value || "(No subject)");
  return /^[\x00-\x7F]*$/.test(clean) ? clean : `=?UTF-8?B?${Buffer.from(clean).toString("base64")}?=`;
}

function normalizeRecipients(value: unknown): string[] {
  return String(value || "")
    .split(/[;,\n]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .filter((item) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(item))
    .slice(0, 10);
}

function normalizeTempInboxForwardInterval(value: unknown): 10 | 20 | 30 {
  const seconds = Number(value);
  if (seconds === 10 || seconds === 20 || seconds === 30) return seconds;
  return 20;
}

async function smtpCommand(socket: tls.TLSSocket, command: string, expected: number[]): Promise<string> {
  if (command) socket.write(`${command}\r\n`);
  let buffer = "";
  return await new Promise((resolve, reject) => {
    const timeout = windowlessTimeout(() => {
      cleanup();
      reject(new Error(`SMTP timed out after ${command || "greeting"}.`));
    }, 15_000);
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines.at(-1) || "";
      if (/^\d{3} /.test(last)) {
        const code = Number(last.slice(0, 3));
        cleanup();
        if (expected.includes(code)) resolve(buffer);
        else reject(new Error(`SMTP command failed (${code}): ${buffer.slice(0, 300)}`));
      }
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off("data", onData);
      socket.off("error", onError);
    };
    socket.on("data", onData);
    socket.on("error", onError);
  });
}

function windowlessTimeout(callback: () => void, ms: number) {
  return setTimeout(callback, ms);
}

async function sendPlainEmail(authEmail: string, pass: string, recipients: string[], subject: string, body: string, fromAddress = authEmail) {
  if (MAILU_DRY_RUN) return { sent: true, dryRun: true, from: fromAddress };
  const socket = tls.connect({ host: SMTP_HOST, port: SMTP_PORT, servername: SMTP_HOST, rejectUnauthorized: SMTP_SECURE });
  try {
    await smtpCommand(socket, "", [220]);
    await smtpCommand(socket, `EHLO ${MAIL_DOMAIN}`, [250]);
    await smtpCommand(socket, "AUTH LOGIN", [334]);
    await smtpCommand(socket, Buffer.from(authEmail).toString("base64"), [334]);
    await smtpCommand(socket, Buffer.from(pass).toString("base64"), [235]);
    await smtpCommand(socket, `MAIL FROM:<${fromAddress}>`, [250]);
    for (const recipient of recipients) {
      await smtpCommand(socket, `RCPT TO:<${recipient}>`, [250, 251]);
    }
    await smtpCommand(socket, "DATA", [354]);
    const raw = [
      `From: ${cleanHeader(fromAddress)}`,
      `To: ${recipients.map(cleanHeader).join(", ")}`,
      `Subject: ${encodeSubject(subject)}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${randomToken(12)}@${MAIL_DOMAIN}>`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      String(body || "").replace(/^\./gm, ".."),
      "."
    ].join("\r\n");
    await smtpCommand(socket, raw, [250]);
    await smtpCommand(socket, "QUIT", [221]);
    return { sent: true };
  } finally {
    socket.destroy();
  }
}

function parseCookies(req: IncomingMessage): Record<string, string> {
  const header = req.headers.cookie || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function getCookieFlags(req?: IncomingMessage): string {
  const proto = req?.headers["x-forwarded-proto"];
  if (proto === "https") return "; Secure; SameSite=Lax";
  return "; SameSite=Lax";
}

function setSessionCookie(res: ServerResponse, sessionId: string, req?: IncomingMessage): void {
  res.setHeader(
    "set-cookie",
    `mail_portal_session=${encodeURIComponent(sessionId)}; HttpOnly; Path=/; Max-Age=604800${getCookieFlags(req)}`
  );
}

function clearSessionCookie(res: ServerResponse, req?: IncomingMessage): void {
  res.setHeader("set-cookie", `mail_portal_session=; HttpOnly; Path=/; Max-Age=0${getCookieFlags(req)}`);
}

function appendSetCookie(res: ServerResponse, cookie: string): void {
  const current = res.getHeader("set-cookie");
  if (!current) {
    res.setHeader("set-cookie", cookie);
  } else if (Array.isArray(current)) {
    res.setHeader("set-cookie", [...current, cookie]);
  } else {
    res.setHeader("set-cookie", [String(current), cookie]);
  }
}

function setTempSessionCookie(res: ServerResponse, token: string, maxAgeSeconds: number, req?: IncomingMessage): void {
  appendSetCookie(
    res,
    `${TEMP_SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}${getCookieFlags(req)}`
  );
}

function clearTempSessionCookie(res: ServerResponse, req?: IncomingMessage): void {
  appendSetCookie(res, `${TEMP_SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0${getCookieFlags(req)}`);
}

function setTempInboxSessionCookie(res: ServerResponse, token: string, req?: IncomingMessage): void {
  appendSetCookie(
    res,
    `${TEMP_INBOX_SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${TEMP_INBOX_SESSION_MAX_AGE_SECONDS}${getCookieFlags(req)}`
  );
}

function mailboxIsExpired(mailbox: Mailbox): boolean {
  return Boolean(mailbox.expiresAt && new Date(mailbox.expiresAt).getTime() <= Date.now());
}

function mailboxIsUsable(mailbox?: Mailbox): mailbox is Mailbox {
  return Boolean(mailbox && !mailbox.deletedAt && !mailbox.disabledAt && !mailboxIsExpired(mailbox));
}

function normalizeFolder(value: unknown): MailFolder {
  const folder = String(value || "inbox").toLowerCase();
  if (["inbox", "sent", "spam", "trash"].includes(folder)) return folder as MailFolder;
  return "inbox";
}

async function getTempSession(req: IncomingMessage, db: Db): Promise<AuthSession | null> {
  const token = parseCookies(req)[TEMP_SESSION_COOKIE];
  if (!token) return null;
  const session = db.tempSessions[token];
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) return null;
  const mailbox = db.mailboxes[session.email];
  if (!mailbox || mailbox.kind !== "temporary" || !mailboxIsUsable(mailbox)) return null;
  return { sessionId: token, mailbox, encPassword: session.encPassword };
}

function getOrCreateTempInboxSession(req: IncomingMessage, res: ServerResponse, db: Db): { token: string; session: TempInboxSessionRecord } {
  const cookies = parseCookies(req);
  let token = cookies[TEMP_INBOX_SESSION_COOKIE];
  if (!token || !db.tempInboxSessions[token]) {
    token = randomToken(32);
    db.tempInboxSessions[token] = { createdAt: nowIso(), accounts: [] };
  }
  db.tempInboxSessions[token].accounts ||= [];
  setTempInboxSessionCookie(res, token, req);
  return { token, session: db.tempInboxSessions[token] };
}

function rateLimit(req: IncomingMessage, key: string, limit: number, windowMs: number): boolean {
  const bucketKey = `${key}:${clientIp(req)}`;
  return rateLimitKey(bucketKey, limit, windowMs);
}

function rateLimitKey(bucketKey: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(bucketKey) || { count: 0, resetAt: now + windowMs };
  if (bucket.resetAt < now) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }
  bucket.count += 1;
  rateBuckets.set(bucketKey, bucket);
  return bucket.count <= limit;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function bearerToken(req: IncomingMessage): string {
  const value = String(req.headers.authorization || "");
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function hashRotatorDeviceToken(token: string): string {
  return crypto.createHmac("sha256", APP_SECRET).update(`rotator-device:${token}`).digest("hex");
}

function getRotatorDevice(req: IncomingMessage, db: Db): RotatorDevice | null {
  const token = bearerToken(req);
  if (!token) return null;
  const tokenHash = hashRotatorDeviceToken(token);
  const device = Object.values(db.rotatorDevices).find((item) => safeEqual(item.tokenHash, tokenHash));
  if (!device) return null;
  device.lastSeenAt = nowIso();
  return device;
}

function requireRotatorAdmin(req: IncomingMessage): boolean {
  const token = req.headers["x-admin-token"];
  return Boolean(ADMIN_TOKEN && token === ADMIN_TOKEN);
}

function publicRotatorAccount(db: Db, account: RotatorAccount): PublicRotatorAccount {
  return {
    ...account,
    hasSession: Boolean(db.rotatorSessions[account.id])
  };
}

function publicRotatorDevice(device: RotatorDevice): PublicRotatorDevice {
  const { tokenHash, ...publicFields } = device;
  return publicFields;
}

function rotatorAccountList(db: Db): PublicRotatorAccount[] {
  return Object.values(db.rotatorAccounts)
    .map((account) => publicRotatorAccount(db, account))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function rotatorDeviceList(db: Db): PublicRotatorDevice[] {
  return Object.values(db.rotatorDevices)
    .map(publicRotatorDevice)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function normalizeRotatorLabel(value: unknown): string {
  return String(value || "").trim().slice(0, 60);
}

function publicRotatorOnboardingJob(job: RotatorOnboardingJob): RotatorOnboardingJob {
  return {
    ...job,
    items: job.items.map((item) => ({ ...item }))
  };
}

function rotatorOnboardingJobList(db: Db): RotatorOnboardingJob[] {
  return Object.values(db.rotatorOnboardingJobs)
    .map(publicRotatorOnboardingJob)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function rotatorAccountByEmail(db: Db, email: string): RotatorAccount | undefined {
  return Object.values(db.rotatorAccounts).find((account) => account.email.toLowerCase() === email.toLowerCase());
}

function ensureRotatorAccount(db: Db, email: string, label?: string): RotatorAccount {
  const existing = rotatorAccountByEmail(db, email);
  if (existing) {
    if (label && !existing.label) existing.label = label;
    return existing;
  }
  const account: RotatorAccount = {
    id: randomToken(12),
    label: normalizeRotatorLabel(label) || email.split("@")[0],
    email,
    status: "unknown",
    createdAt: nowIso()
  };
  db.rotatorAccounts[account.id] = account;
  return account;
}

function rotatorSessionKey(): Buffer {
  if (ROTATOR_SESSION_KEY.length < 32) throw new Error("Rotator session encryption is not configured.");
  return crypto.createHash("sha256").update(ROTATOR_SESSION_KEY).digest();
}

function encryptRotatorSession(payload: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", rotatorSessionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url")
  ].join(":");
}

function decryptRotatorSession(value: string): unknown {
  const [version, iv, tag, encrypted] = String(value || "").split(":");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Rotator session snapshot is invalid.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", rotatorSessionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final()
  ]);
  return JSON.parse(decrypted.toString("utf8"));
}

function encryptRotatorCredential(payload: unknown): string {
  return encryptRotatorSession(payload);
}

function decryptRotatorCredential<T = any>(value: string): T {
  return decryptRotatorSession(value) as T;
}

function credentialKey(jobId: string, itemId: string): string {
  return `${jobId}:${itemId}`;
}

function purgeOnboardingCredential(db: Db, jobId: string, itemId: string): void {
  delete db.rotatorOnboardingCredentials[credentialKey(jobId, itemId)];
}

function cleanupRotatorOnboardingCredentials(db: Db): boolean {
  const cutoff = Date.now() - ROTATOR_ONBOARDING_CREDENTIAL_TTL_MS;
  let changed = false;
  for (const [key, credential] of Object.entries(db.rotatorOnboardingCredentials)) {
    if (new Date(credential.createdAt).getTime() <= cutoff) {
      delete db.rotatorOnboardingCredentials[key];
      changed = true;
    }
  }
  return changed;
}

function updateOnboardingJobStatus(job: RotatorOnboardingJob): void {
  if (job.status === "cancelled") return;
  const terminal = job.items.every((item) => ["saved", "failed", "needs_manual"].includes(item.status));
  job.status = terminal ? "completed" : "running";
}

function sanitizeOnboardingErrorDetail(value: unknown): string | undefined {
  const text = String(value || "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.slice(0, 240);
}

function parseOnboardingItems(value: unknown): Array<{ email: string; password?: string; label?: string }> {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({
    email: validateEmail((item as any)?.email),
    password: String((item as any)?.password || ""),
    label: normalizeRotatorLabel((item as any)?.label)
  }));
}

function zenvyImapAuthUser(email: string): string {
  return zenvyImapAuthUserForFormat(email, ROTATOR_ZENVY_IMAP_AUTH_FORMAT);
}

function zenvyImapAuthUserForFormat(email: string, format: string): string {
  const local = email.split("@")[0];
  return format
    .replaceAll("{email}", email)
    .replaceAll("{local}", local)
    .replaceAll("{masterUser}", ROTATOR_ZENVY_IMAP_MASTER_USER);
}

function isZenvyOnboardingEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return lower.endsWith("@zenvy.com.bd") || lower.endsWith(`@${MAIL_DOMAIN.toLowerCase()}`);
}

function rotatorMailboxCredentialKey(email: string): string {
  return email.toLowerCase();
}

function getRotatorMailboxPassword(db: Db, email: string): string | undefined {
  const credential = db.rotatorMailboxCredentials[rotatorMailboxCredentialKey(email)];
  if (!credential?.encPassword) return undefined;
  const payload = decryptRotatorCredential<{ password?: string }>(credential.encPassword);
  return payload.password || undefined;
}

function storeRotatorMailboxPassword(db: Db, email: string, password: string): void {
  db.rotatorMailboxCredentials[rotatorMailboxCredentialKey(email)] = {
    email: email.toLowerCase(),
    encPassword: encryptRotatorCredential({ password }),
    source: "mailu_reset",
    updatedAt: nowIso()
  };
}

function generatedRotatorMailboxPassword(): string {
  return `${randomToken(24)}Aa1!`;
}

function mailuUserUpdateEndpoint(identifier: string): string {
  return MAILU_UPDATE_USER_ENDPOINT.endsWith("/")
    ? `${MAILU_UPDATE_USER_ENDPOINT}${encodeURIComponent(identifier)}`
    : `${MAILU_UPDATE_USER_ENDPOINT}/${encodeURIComponent(identifier)}`;
}

async function fetchVerificationViaImap(authUser: string, pass: string, targetEmail: string, keyword = "openai"): Promise<VerificationMatch | undefined> {
  const client = new ImapFlow({
    host: MAIL_HOSTNAME,
    port: 993,
    secure: true,
    auth: { user: authUser, pass },
    logger: false,
    tls: { rejectUnauthorized: false }
  });
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const status = await client.status("INBOX", { messages: true });
    const count = status.messages || 0;
    if (!count) return undefined;
    const range = `${Math.max(1, count - 24)}:${count}`;
    const matches: VerificationMatch[] = [];
    for await (const msg of client.fetch({ seq: range }, { source: true, envelope: true })) {
      if (!msg.source) continue;
      const parsed = await simpleParser(msg.source);
      const to = parsed.to?.text || "";
      const subject = parsed.subject || msg.envelope.subject || "";
      const from = parsed.from?.text || formatAddressList(msg.envelope.from as Array<{ name?: string; address?: string }> | undefined);
      const body = parsed.text || "";
      const html = parsed.html || parsed.textAsHtml || "";
      const haystack = `${to}\n${subject}\n${from}\n${body}\n${stripHtml(String(html || ""))}`.toLowerCase();
      if (targetEmail && !haystack.includes(targetEmail.toLowerCase())) continue;
      if (keyword && !haystack.includes(keyword.toLowerCase()) && !/(openai|chatgpt|code|verification|login|sign in|signin)/i.test(haystack)) continue;
      const match = extractVerification({
        uid: String(msg.uid),
        subject,
        from,
        date: parsed.date?.toISOString() || msg.envelope.date?.toISOString() || nowIso(),
        body,
        html: String(html || "")
      });
      if (match) matches.push(match);
    }
    matches.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return matches[0];
  } finally {
    lock.release();
    await client.logout();
  }
}

function cleanImapError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "IMAP request failed.");
  return message.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
}

async function testVerificationViaImap(authUser: string, pass: string, targetEmail: string, keyword = "openai"): Promise<{
  ok: boolean;
  authUser: string;
  messages?: number;
  codeFound?: boolean;
  match?: { subject: string; from: string; date: string; confidence: number };
  error?: string;
}> {
  const client = new ImapFlow({
    host: MAIL_HOSTNAME,
    port: 993,
    secure: true,
    auth: { user: authUser, pass },
    logger: false,
    tls: { rejectUnauthorized: false }
  });
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const status = await client.status("INBOX", { messages: true });
      const match = await fetchVerificationViaConnectedImap(client, targetEmail, keyword, status.messages || 0);
      return {
        ok: true,
        authUser,
        messages: status.messages || 0,
        codeFound: Boolean(match?.code),
        match: match
          ? { subject: match.subject, from: match.from, date: match.date, confidence: match.confidence }
          : undefined
      };
    } finally {
      lock.release();
    }
  } catch (error) {
    return { ok: false, authUser, error: cleanImapError(error) };
  } finally {
    await client.logout().catch(() => undefined);
  }
}

async function fetchVerificationViaConnectedImap(client: ImapFlow, targetEmail: string, keyword: string, count: number): Promise<VerificationMatch | undefined> {
  if (!count) return undefined;
  const range = `${Math.max(1, count - 24)}:${count}`;
  const matches: VerificationMatch[] = [];
  for await (const msg of client.fetch({ seq: range }, { source: true, envelope: true })) {
    if (!msg.source) continue;
    const parsed = await simpleParser(msg.source);
    const to = parsed.to?.text || "";
    const subject = parsed.subject || msg.envelope.subject || "";
    const from = parsed.from?.text || formatAddressList(msg.envelope.from as Array<{ name?: string; address?: string }> | undefined);
    const body = parsed.text || "";
    const html = parsed.html || parsed.textAsHtml || "";
    const haystack = `${to}\n${subject}\n${from}\n${body}\n${stripHtml(String(html || ""))}`.toLowerCase();
    if (targetEmail && !haystack.includes(targetEmail.toLowerCase())) continue;
    if (keyword && !haystack.includes(keyword.toLowerCase()) && !/(openai|chatgpt|code|verification|login|sign in|signin)/i.test(haystack)) continue;
    const match = extractVerification({
      uid: String(msg.uid),
      subject,
      from,
      date: parsed.date?.toISOString() || msg.envelope.date?.toISOString() || nowIso(),
      body,
      html: String(html || "")
    });
    if (match) matches.push(match);
  }
  matches.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return matches[0];
}

async function resetMailuMailboxPassword(email: string, password: string): Promise<MailuCreateResult> {
  if (MAILU_DRY_RUN) {
    return {
      provider: "dry-run",
      message: "MAILU_DRY_RUN is enabled; no Mailu password reset call was made."
    };
  }
  const base = env.MAILU_API_BASE;
  const token = env.MAILU_API_TOKEN;
  if (!base || !token) throw new Error("MAILU_API_BASE and MAILU_API_TOKEN are required when MAILU_DRY_RUN=false.");
  const local = email.split("@")[0];
  const identifiers = Array.from(new Set([email, local]));
  const notFoundDetails: string[] = [];
  for (const identifier of identifiers) {
    const response = await fetch(new URL(mailuUserUpdateEndpoint(identifier), base).toString(), {
      method: "PATCH",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "x-api-key": token
      },
      body: JSON.stringify({
        email,
        raw_password: password,
        enabled: true
      })
    });
    const text = await response.text();
    if (response.ok) {
      return {
        provider: "mailu",
        status: response.status,
        body: { updated: true, identifier, response: text ? safeJson(text) : null }
      };
    }
    if (response.status === 404) {
      notFoundDetails.push(`${identifier}: ${text.slice(0, 180)}`);
      continue;
    }
    if (identifier === local && response.status === 400 && /not a valid email address/i.test(text)) {
      notFoundDetails.push(`${identifier}: localpart lookup is not supported by this Mailu API`);
      continue;
    }
    throw new Error(`Mailu password reset failed with ${response.status}: ${text.slice(0, 300)}`);
  }

  try {
    const created = await createMailuUser(local, password, local, DEFAULT_QUOTA_MB, "Created by Mailroom rotator onboarding");
    return { provider: "mailu", status: created.status, body: { created: true, response: created.body } };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error || "unknown error");
    const notFound = notFoundDetails.length ? ` Reset attempts returned 404 (${notFoundDetails.join("; ")}).` : "";
    throw new Error(`Mailu user was not found and automatic mailbox creation failed: ${reason}.${notFound}`);
  }
}

async function rotateZenvyMailboxPassword(db: Db, email: string): Promise<string> {
  const password = generatedRotatorMailboxPassword();
  await resetMailuMailboxPassword(email, password);
  storeRotatorMailboxPassword(db, email, password);
  const mailbox = db.mailboxes[email.toLowerCase()];
  if (mailbox) mailbox.passwordHash = hashPassword(password);
  return password;
}

async function fetchZenvyOnboardingOtp(db: Db, email: string): Promise<VerificationMatch | undefined> {
  const storedPassword = getRotatorMailboxPassword(db, email);
  if (storedPassword) {
    try {
      return await fetchVerificationViaImap(email, storedPassword, email, "openai");
    } catch {
      delete db.rotatorMailboxCredentials[rotatorMailboxCredentialKey(email)];
    }
  }

  if (!ROTATOR_ZENVY_IMAP_MASTER_USER || !ROTATOR_ZENVY_IMAP_MASTER_PASSWORD) {
    const password = await rotateZenvyMailboxPassword(db, email);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return fetchVerificationViaImap(email, password, email, "openai");
  }
  if (ROTATOR_ZENVY_IMAP_MASTER_PASSWORD !== "your-master-imap-password") {
    try {
      return await fetchVerificationViaImap(zenvyImapAuthUser(email), ROTATOR_ZENVY_IMAP_MASTER_PASSWORD, email, "openai");
    } catch {
      // Fall through to a Mailu password rotation when Dovecot master-user auth is not enabled.
    }
  }

  const password = await rotateZenvyMailboxPassword(db, email);
  try {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return await fetchVerificationViaImap(email, password, email, "openai");
  } catch (error) {
    throw new Error(`Mailu password reset succeeded, but IMAP login still failed: ${cleanImapError(error)}`);
  }
}

async function fetchExternalOnboardingOtp(email: string, password: string): Promise<VerificationMatch | undefined> {
  const tempAccount: TempInboxAccount = {
    id: "onboarding",
    email,
    encPassword: encrypt(password),
    createdAt: nowIso()
  };
  const result = await fetchExternalTempInbox(tempAccount, "ALL", "openai", 10);
  const message = result.messages.find((item) => item.otp) || result.messages[0];
  if (!message?.otp) return undefined;
  return {
    uid: message.id,
    subject: message.subject,
    from: message.from,
    code: message.otp,
    serviceHint: serviceHintFrom(message.from, message.subject),
    date: message.date,
    confidence: 0.94
  };
}

async function ensureDb(): Promise<void> {
  await fs.mkdir(DB_DIR, { recursive: true });
  try {
    await fs.access(DB_PATH);
  } catch {
    const initial = {
      invites: {},
      mailboxes: {},
      sessions: {},
      tempSessions: {},
      tempInboxSessions: {},
      rotatorAccounts: {},
      rotatorDevices: {},
      rotatorSessions: {},
      rotatorOnboardingJobs: {},
      rotatorOnboardingCredentials: {},
      rotatorMailboxCredentials: {},
      rotatorAudit: [],
      audit: []
    };
    await fs.writeFile(DB_PATH, JSON.stringify(initial, null, 2));
  }
}

async function readDb(): Promise<Db> {
  await ensureDb();
  const raw = await fs.readFile(DB_PATH, "utf8");
  const db = JSON.parse(raw) as Db;
  db.invites ||= {};
  db.mailboxes ||= {};
  db.sessions ||= {};
  db.tempSessions ||= {};
  db.tempInboxSessions ||= {};
  db.rotatorAccounts ||= {};
  db.rotatorDevices ||= {};
  db.rotatorSessions ||= {};
  db.rotatorOnboardingJobs ||= {};
  db.rotatorOnboardingCredentials ||= {};
  db.rotatorMailboxCredentials ||= {};
  db.rotatorAudit ||= [];
  db.audit ||= [];
  db.rotatorAudit = db.rotatorAudit.slice(0, 1000);
  for (const session of Object.values(db.tempInboxSessions)) {
    session.accounts ||= [];
    for (const account of session.accounts) {
      account.forwarding ||= { enabled: false, recipients: [], intervalSeconds: 20, forwardedMessageIds: [] };
      account.forwarding.recipients ||= [];
      account.forwarding.intervalSeconds = normalizeTempInboxForwardInterval(account.forwarding.intervalSeconds);
      account.forwarding.forwardedMessageIds ||= [];
      account.forwarding.enabled = Boolean(account.forwarding.enabled && account.forwarding.recipients.length);
    }
  }
  for (const mailbox of Object.values(db.mailboxes)) {
    mailbox.kind ||= mailbox.expiresAt ? "temporary" : "permanent";
    mailbox.quotaMb ||= mailbox.kind === "temporary" ? TEMP_QUOTA_MB : DEFAULT_QUOTA_MB;
    mailbox.outboundDailyLimit ??= mailbox.kind === "temporary" ? TEMP_OUTBOUND_DAILY_LIMIT : DEFAULT_OUTBOUND_DAILY_LIMIT;
    mailbox.webmailUrl ||= WEBMAIL_URL;
    mailbox.aliasLimit ||= DEFAULT_ALIAS_LIMIT;
    mailbox.aliases ||= [];
    mailbox.forwardingEnabled ||= false;
    mailbox.forwardTo ||= [];
    for (const alias of mailbox.aliases) {
      alias.forwardTo ||= [];
      alias.status ||= alias.disabledAt ? "disabled" : "active";
    }
    for (const recipient of mailbox.forwardTo) {
      recipient.status ||= recipient.verifiedAt ? "verified" : "pending";
      recipient.includeInGlobalForwarding ??= true;
    }
  }
  return db;
}

async function writeDb(db: Db): Promise<void> {
  await fs.mkdir(DB_DIR, { recursive: true });
  const tmp = `${DB_PATH}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2));
  await fs.rename(tmp, DB_PATH);
}

let dbMutationQueue: Promise<unknown> = Promise.resolve();
async function withDbMutation<T>(work: () => Promise<T>): Promise<T> {
  const run = dbMutationQueue.catch(() => undefined).then(work);
  dbMutationQueue = run.catch(() => undefined);
  return run;
}

async function audit(db: Db, actor: string, event: string, details: JsonObject = {}): Promise<void> {
  db.audit.unshift({
    id: randomToken(10),
    at: nowIso(),
    actor,
    event,
    details
  });
  db.audit = db.audit.slice(0, 1000);
}

async function cleanupExpiredTempMailboxes(db: Db): Promise<void> {
  let changed = false;
  for (const mailbox of Object.values(db.mailboxes)) {
    if (mailbox.kind !== "temporary" || mailbox.deletedAt || !mailboxIsExpired(mailbox)) continue;
    mailbox.disabledAt ||= nowIso();
    for (const [token, session] of Object.entries(db.tempSessions)) {
      if (session.email === mailbox.email) delete db.tempSessions[token];
    }
    try {
      await deleteMailuMailbox(mailbox.email);
      mailbox.deletedAt ||= nowIso();
      await audit(db, mailbox.email, "temp_mailbox_deleted", { expiresAt: mailbox.expiresAt });
    } catch (error) {
      await audit(db, mailbox.email, "temp_mailbox_delete_failed", {
        message: error instanceof Error ? error.message : String(error)
      });
    }
    changed = true;
  }
  if (changed) await writeDb(db);
}

function normalizeLocal(local: unknown): string {
  return String(local || "").trim().toLowerCase();
}

function validateLocal(local: string): string | null {
  const value = normalizeLocal(local);
  if (value.length < 3 || value.length > 32) return "Choose 3 to 32 characters.";
  if (!/^[a-z0-9._-]+$/.test(value)) return "Use lowercase letters, numbers, dots, underscores, or hyphens.";
  if (/^[._-]|[._-]$/.test(value)) return "Do not start or end with punctuation.";
  if (value.includes("..")) return "Repeated dots are not allowed.";
  if (RESERVED.has(value)) return "That address is reserved.";
  return null;
}
function activeAliases(mailbox: Mailbox): MailAlias[] {
  return (mailbox.aliases || []).filter((alias) => alias.status === "active" && !alias.disabledAt);
}

function publicAlias(alias: MailAlias): PublicMailAlias {
  const { providerResult, ...publicFields } = alias;
  return publicFields;
}

function publicForwardingRecipient(recipient: ForwardingRecipient): PublicForwardingRecipient {
  const { codeHash, providerResult, ...publicFields } = recipient;
  return publicFields;
}

function verifiedForwardingDestinations(mailbox: Mailbox): string[] {
  return Array.from(new Set((mailbox.forwardTo || [])
    .filter((recipient) => recipient.status === "verified" && !recipient.disabledAt)
    .map((recipient) => recipient.email.toLowerCase())));
}

function primaryForwardingDestinations(mailbox: Mailbox): string[] {
  return Array.from(new Set((mailbox.forwardTo || [])
    .filter((recipient) => recipient.status === "verified" && !recipient.disabledAt && recipient.includeInGlobalForwarding !== false)
    .map((recipient) => recipient.email.toLowerCase())));
}

function forwardingRecipientLimitReached(mailbox: Mailbox): boolean {
  return (mailbox.forwardTo || []).filter((recipient) => !recipient.disabledAt).length >= FORWARDING_RECIPIENT_LIMIT;
}

function getForwardingRecipient(mailbox: Mailbox, id: string): ForwardingRecipient | undefined {
  return (mailbox.forwardTo || []).find((recipient) => recipient.id === id);
}

function validateForwardingEmail(mailbox: Mailbox, value: unknown): { email: string; error?: string } {
  const email = String(value || "").trim().toLowerCase();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return { email: "", error: "Enter a valid forwarding address." };
  if (email === mailbox.email.toLowerCase()) return { email: "", error: "Forwarding to this mailbox is already included." };
  const exists = (mailbox.forwardTo || []).some((recipient) => !recipient.disabledAt && recipient.email.toLowerCase() === email);
  if (exists) return { email: "", error: "That forwarding recipient already exists." };
  return { email };
}

function validateEmail(value: unknown): string {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ? email : "";
}

function publicTempInboxAccount(account: TempInboxAccount, dashboardSession?: AuthSession | null): PublicTempInboxAccount {
  const { encPassword, forwarding, ...publicFields } = account;
  const forwardSender = publicTempInboxForwardSender(tempInboxForwardSender(account, dashboardSession, false));
  if (!forwarding) return { ...publicFields, forwardSender };
  const { forwardedMessageIds, ...publicForwarding } = forwarding;
  return { ...publicFields, forwarding: publicForwarding, forwardSender };
}

function normalizeTempInboxMessage(value: any): NormalizedTempInboxMessage {
  const body = String(value?.body || value?.text || "");
  const explicitHtml = String(value?.html || value?.bodyHtml || value?.body_html || value?.htmlBody || value?.textAsHtml || "");
  const html = explicitHtml || (/<(?:html|body|table|div|p|br|span|img|a)\b/i.test(body) ? body : "");

  return {
    id: String(value?.id ?? value?.uid ?? value?.messageId ?? randomToken(8)),
    from: String(value?.from || "Unknown Sender"),
    to: String(value?.to || ""),
    subject: String(value?.subject || "(No subject)"),
    date: String(value?.date || nowIso()),
    body,
    html,
    otp: String(value?.otp || "")
  };
}

function normalizeTempInboxResponse(value: any, fallbackEmail: string, fallbackFolder: string): NormalizedTempInboxResult {
  const messages = Array.isArray(value?.messages) ? value.messages.map(normalizeTempInboxMessage) : [];
  return {
    ok: Boolean(value?.ok ?? true),
    email: String(value?.email || fallbackEmail),
    folder: String(value?.folder || fallbackFolder),
    total: Number(value?.total ?? messages.length),
    count: Number(value?.count ?? messages.length),
    messages
  };
}

function parseForwardTo(value: unknown, mailbox: Mailbox): { forwardTo: string[]; error?: string } {
  const raw = Array.isArray(value) ? value.join(",") : String(value || "");
  const items = raw.split(/[;,\n]/).map((item) => item.trim().toLowerCase()).filter(Boolean);
  const forwardTo = Array.from(new Set(items));
  const invalid = forwardTo.find((item) => !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(item));
  if (invalid) return { forwardTo: [], error: `Invalid forwarding address: ${invalid}` };
  if (forwardTo.includes(mailbox.email.toLowerCase())) return { forwardTo: [], error: "Forwarding to the primary mailbox is already included." };
  if (forwardTo.length > ALIAS_FORWARD_LIMIT) return { forwardTo: [], error: `Use ${ALIAS_FORWARD_LIMIT} forwarding recipients or fewer.` };
  const verified = new Set(verifiedForwardingDestinations(mailbox));
  const unverified = forwardTo.find((item) => !verified.has(item));
  if (unverified) return { forwardTo: [], error: `Verify ${unverified} as a global forwarding recipient before using it on an alias.` };
  return { forwardTo };
}

function aliasEmailExists(db: Db, email: string, currentMailbox?: Mailbox, currentAliasId?: string): boolean {
  const target = email.toLowerCase();
  if (db.mailboxes[target]) return true;
  return Object.values(db.mailboxes).some((mailbox) => (mailbox.aliases || []).some((alias) => {
    if (currentMailbox?.email === mailbox.email && currentAliasId && alias.id === currentAliasId) return false;
    return alias.email.toLowerCase() === target;
  }));
}

function getAlias(mailbox: Mailbox, id: string): MailAlias | undefined {
  return (mailbox.aliases || []).find((alias) => alias.id === id);
}

function aliasForwardRelayLocal(mailbox: Mailbox, recipientEmail: string): string {
  return `af-${hmac(`alias-forward-relay:${mailbox.email.toLowerCase()}:${recipientEmail.toLowerCase()}`).slice(0, 24)}`;
}

function aliasForwardRelayEmail(mailbox: Mailbox, recipientEmail: string): string {
  return `${aliasForwardRelayLocal(mailbox, recipientEmail)}@${MAIL_DOMAIN}`;
}

async function createMailuUser(local: string, password: string, displayName: string, quotaMb: number, comment: string): Promise<MailuCreateResult> {
  if (MAILU_DRY_RUN) {
    return {
      provider: "dry-run",
      message: "MAILU_DRY_RUN is enabled; no Mailu user call was made."
    };
  }

  const base = env.MAILU_API_BASE;
  const token = env.MAILU_API_TOKEN;
  const endpoint = env.MAILU_CREATE_USER_ENDPOINT || "/api/v1/user";

  if (!base || !token) {
    throw new Error("MAILU_API_BASE and MAILU_API_TOKEN are required when MAILU_DRY_RUN=false.");
  }

  const response = await fetch(new URL(endpoint, base).toString(), {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "x-api-key": token
    },
    body: JSON.stringify({
      localpart: local,
      domain: MAIL_DOMAIN,
      email: `${local}@${MAIL_DOMAIN}`,
      raw_password: password,
      display_name: displayName,
      quota_bytes: quotaMb * 1024 * 1024,
      enabled: true,
      comment
    })
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Mailu API failed with ${response.status}: ${text.slice(0, 300)}`);
  }

  return {
    provider: "mailu",
    status: response.status,
    body: text ? safeJson(text) : null
  };
}

async function ensureMailuAliasForwardRelay(mailbox: Mailbox, recipientEmail: string): Promise<MailuCreateResult & { email: string }> {
  const local = aliasForwardRelayLocal(mailbox, recipientEmail);
  const email = `${local}@${MAIL_DOMAIN}`;
  if (MAILU_DRY_RUN) {
    return {
      provider: "dry-run",
      message: "MAILU_DRY_RUN is enabled; no Mailu alias-forward relay calls were made.",
      body: { email, forwardsTo: recipientEmail },
      email
    };
  }

  try {
    await createMailuUser(
      local,
      `${randomToken(18)}Aa1`,
      `Alias forward relay for ${mailbox.email}`,
      1,
      `Created by Mailroom alias forwarding for ${mailbox.email}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/\b(409|already exists|duplicate)\b/i.test(message)) throw error;
  }

  const forwardingResult = await syncMailuUserForwarding(email, [recipientEmail.toLowerCase()], true, false);
  return {
    ...forwardingResult,
    body: { relay: email, forwardsTo: recipientEmail, provider: forwardingResult.body },
    email
  };
}

async function aliasDestinations(mailbox: Mailbox, alias: MailAlias): Promise<{ destinations: string[]; relayResults: MailuCreateResult[] }> {
  const relayResults: MailuCreateResult[] = [];
  const relayEmails: string[] = [];
  for (const recipient of alias.forwardTo || []) {
    const result = await ensureMailuAliasForwardRelay(mailbox, recipient);
    relayResults.push(result);
    relayEmails.push(result.email);
  }
  return {
    destinations: Array.from(new Set([mailbox.email.toLowerCase(), ...relayEmails.map((item) => item.toLowerCase())])),
    relayResults
  };
}

function detectDeliveredAlias(to: string | undefined, aliases: MailAlias[] = []): PublicMailAlias | undefined {
  const value = String(to || "").toLowerCase();
  const alias = aliases.find((item) => item.status === "active" && value.includes(item.email.toLowerCase()));
  return alias ? publicAlias(alias) : undefined;
}

function stripHtml(html: string): string {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function serviceHintFrom(from: string, subject: string): string | undefined {
  const raw = String(from || "");
  const email = raw.match(/<([^>]+)>/)?.[1] || raw;
  const domain = String(email || "").split("@").pop()?.toLowerCase() || "";
  const labels = domain.split(".").filter(Boolean);
  const generic = new Set(["mail", "email", "smtp", "mx", "tm", "notification", "notifications", "notify", "no-reply", "noreply"]);
  const brandLabel = labels.length > 1
    ? [...labels].reverse().slice(1).find((label) => !generic.has(label))
    : labels[0];
  if (brandLabel) return brandLabel.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  const display = raw.replace(/<.*?>/g, "").replace(/"/g, "").trim();
  if (display && !/^(no-?reply|notifications?)$/i.test(display)) return display;
  return String(subject || "").split(/\s+/).slice(0, 3).join(" ") || undefined;
}

function extractVerification(input: { uid: string; subject: string; from: string; date: string; body?: string; html?: string }): VerificationMatch | undefined {
  const text = `${input.subject}\n${input.body || ""}\n${stripHtml(input.html || "")}`.replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  const codePatterns = [
    /(?:code|otp|verification|verify|login|security)[^0-9]{0,24}([0-9]{4,8})(?![0-9])/i,
    /\b([0-9]{6})\b/
  ];
  const code = codePatterns.map((pattern) => text.match(pattern)?.[1]).find(Boolean);
  const subjectLooksRelevant = /(code|otp|verification|verify|login|security|sign in|signin)/i.test(input.subject || text);
  if (!code) return undefined;
  if (code && !subjectLooksRelevant && !/(code|otp|verification|login)/i.test(text.slice(0, 500))) return undefined;
  return {
    uid: input.uid,
    subject: input.subject || "(No subject)",
    from: input.from || "Unknown Sender",
    code,
    serviceHint: serviceHintFrom(input.from, input.subject),
    date: input.date,
    confidence: subjectLooksRelevant ? 0.94 : 0.82
  };
}

function forwardingCodeHash(mailbox: Mailbox, recipient: ForwardingRecipient, code: string): string {
  return hmac(`forwarding:${mailbox.email}:${recipient.email}:${code}`);
}

function newForwardingCode(mailbox: Mailbox, recipient: ForwardingRecipient): string {
  const code = String(crypto.randomInt(100000, 999999));
  recipient.codeHash = forwardingCodeHash(mailbox, recipient, code);
  recipient.codeExpiresAt = new Date(Date.now() + FORWARDING_VERIFY_TTL_MINUTES * 60 * 1000).toISOString();
  return code;
}

function verifyForwardingCode(mailbox: Mailbox, recipient: ForwardingRecipient, code: unknown): boolean {
  if (!recipient.codeHash || !recipient.codeExpiresAt) return false;
  if (new Date(recipient.codeExpiresAt).getTime() < Date.now()) return false;
  const actual = forwardingCodeHash(mailbox, recipient, String(code || "").trim());
  try {
    return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(recipient.codeHash));
  } catch {
    return false;
  }
}

async function sendForwardingVerificationEmail(mailbox: Mailbox, pass: string, recipient: ForwardingRecipient, code: string) {
  return sendPlainEmail(
    mailbox.email,
    pass,
    [recipient.email],
    "Confirm Mailroom forwarding",
    [
      `Use this code to confirm forwarding from ${mailbox.email}:`,
      "",
      code,
      "",
      `This code expires in ${FORWARDING_VERIFY_TTL_MINUTES} minutes.`,
      "If you did not request this, ignore this email."
    ].join("\n")
  );
}

function mailuAliasEndpoint(aliasEmail?: string): string {
  if (!aliasEmail) return MAILU_ALIAS_ENDPOINT;
  return MAILU_ALIAS_ENDPOINT.endsWith("/")
    ? `${MAILU_ALIAS_ENDPOINT}${encodeURIComponent(aliasEmail)}`
    : `${MAILU_ALIAS_ENDPOINT}/${encodeURIComponent(aliasEmail)}`;
}

function mailuAliasPayload(alias: MailAlias, destinations: string[], enabled: boolean): JsonObject {
  return {
    localpart: alias.local,
    domain: MAIL_DOMAIN,
    email: alias.email,
    destination: destinations,
    enabled,
    comment: "Created by Mailroom alias controls"
  };
}

async function upsertMailuAlias(mailbox: Mailbox, alias: MailAlias, enabled = true): Promise<MailuCreateResult> {
  if (MAILU_DRY_RUN) return { provider: "dry-run", message: "MAILU_DRY_RUN is enabled; no Mailu alias call was made." };
  const base = env.MAILU_API_BASE;
  const token = env.MAILU_API_TOKEN;
  if (!base || !token) throw new Error("MAILU_API_BASE and MAILU_API_TOKEN are required when MAILU_DRY_RUN=false.");
  const { destinations, relayResults } = await aliasDestinations(mailbox, alias);
  const payload = mailuAliasPayload(alias, destinations, enabled);
  let response = await fetch(new URL(mailuAliasEndpoint(), base).toString(), {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "x-api-key": token
    },
    body: JSON.stringify(payload)
  });
  let text = await response.text();
  if (response.status === 409) {
    const createConflictText = text;
    response = await fetch(new URL(mailuAliasEndpoint(alias.email), base).toString(), {
      method: "PATCH",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "x-api-key": token
      },
      body: JSON.stringify(payload)
    });
    text = await response.text();
    if (response.status === 404 || response.status === 405) {
      await deleteMailuAlias(alias);
      response = await fetch(new URL(mailuAliasEndpoint(), base).toString(), {
        method: "POST",
        signal: AbortSignal.timeout(15_000),
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          "x-api-key": token
        },
        body: JSON.stringify(payload)
      });
      text = await response.text();
    }
    if (!response.ok && !text) text = createConflictText;
  }
  if (!response.ok) throw new Error(`Mailu alias API failed with ${response.status}: ${text.slice(0, 300)}`);
  return { provider: "mailu", status: response.status, body: { alias: text ? safeJson(text) : null, destinations, relays: relayResults } };
}

async function syncMailuUserForwarding(email: string, destinations: string[], enabled: boolean, keepCopy: boolean): Promise<MailuCreateResult> {
  if (MAILU_DRY_RUN) return { provider: "dry-run", message: "MAILU_DRY_RUN is enabled; no Mailu forwarding call was made.", body: { enabled, destinations, keepCopy } };
  const base = env.MAILU_API_BASE;
  const token = env.MAILU_API_TOKEN;
  if (!base || !token) throw new Error("MAILU_API_BASE and MAILU_API_TOKEN are required when MAILU_DRY_RUN=false.");
  const endpoint = MAILU_FORWARDING_ENDPOINT.endsWith("/")
    ? `${MAILU_FORWARDING_ENDPOINT}${encodeURIComponent(email)}`
    : `${MAILU_FORWARDING_ENDPOINT}/${encodeURIComponent(email)}`;
  const response = await fetch(new URL(endpoint, base).toString(), {
    method: "PATCH",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "x-api-key": token
    },
    body: JSON.stringify({
      email,
      forward_enabled: enabled,
      forward_destination: destinations,
      forward_keep: keepCopy,
      keep: keepCopy
    })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Mailu forwarding API failed with ${response.status}: ${text.slice(0, 300)}`);
  return { provider: "mailu", status: response.status, body: text ? safeJson(text) : null };
}

async function syncMailuForwarding(mailbox: Mailbox): Promise<MailuCreateResult> {
  const destinations = primaryForwardingDestinations(mailbox);
  const enabled = Boolean(mailbox.forwardingEnabled && destinations.length);
  return syncMailuUserForwarding(mailbox.email, destinations, enabled, true);
}

async function fetchExternalTempInbox(account: TempInboxAccount, folder: string, keyword: string, maxCount: number) {
  const password = decrypt(account.encPassword);
  const response = await fetch(TEMP_INBOX_FETCH_ENDPOINT, {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: {
      "content-type": "application/json",
      accept: "application/json"
    },
    body: JSON.stringify({
      line: `${account.email}----${password}`,
      folder,
      keyword,
      max_count: maxCount
    })
  });
  const text = await response.text();
  const payload = text ? safeJson(text) : {};
  if (!response.ok) throw new Error(`Mailbox fetch failed with ${response.status}.`);
  if (payload && typeof payload === "object" && "ok" in payload && !(payload as any).ok) {
    throw new Error(String((payload as any).error || (payload as any).message || "Mailbox fetch failed."));
  }
  return normalizeTempInboxResponse(payload, account.email, folder);
}

function tempInboxMessageForwardKey(message: NormalizedTempInboxMessage): string {
  return String(message.id || `${message.date}:${message.from}:${message.subject}`).slice(0, 300);
}

function tempInboxForwardBody(account: TempInboxAccount, message: NormalizedTempInboxMessage): string {
  const lines = [
    `Forwarded from temp inbox ${account.email}`,
    "",
    `Original from: ${message.from || "Unknown Sender"}`,
    `Original to: ${message.to || account.email}`,
    `Original date: ${message.date || nowIso()}`,
    `Original subject: ${message.subject || "(No subject)"}`,
    "",
    "----- Original message -----",
    "",
    message.body || "(No text body)",
    message.html && !message.body ? `\n\nHTML body:\n${message.html}` : undefined
  ];
  return lines.filter((line) => line !== undefined).join("\n");
}

function tempInboxForwardSenderCandidates(account: TempInboxAccount, dashboardSession?: AuthSession | null, includePassword = true): TempInboxForwardSender[] {
  const senders: TempInboxForwardSender[] = [];
  if (dashboardSession?.mailbox?.email && dashboardSession.encPassword) {
    const password = includePassword ? decryptOrNull(dashboardSession.encPassword) : undefined;
    senders.push({
      email: dashboardSession.mailbox.email,
      password,
      source: password || !includePassword ? "dashboard" : "none",
      error: password || !includePassword ? undefined : "Please log in again so this mailbox can send forwarded mail."
    });
  } else if (dashboardSession?.mailbox?.email) {
    senders.push({ email: dashboardSession.mailbox.email, source: "none", error: "Please log in again so this mailbox can send forwarded mail." });
  }
  if (TEMP_INBOX_FORWARD_FROM_EMAIL || TEMP_INBOX_FORWARD_FROM_PASSWORD) {
    if (!TEMP_INBOX_FORWARD_FROM_EMAIL || !TEMP_INBOX_FORWARD_FROM_PASSWORD) {
      senders.push({ source: "none", error: "Temp inbox forwarding sender is incomplete. Set both TEMP_INBOX_FORWARD_FROM_EMAIL and TEMP_INBOX_FORWARD_FROM_PASSWORD." });
    } else {
      senders.push({ email: TEMP_INBOX_FORWARD_FROM_EMAIL, password: includePassword ? TEMP_INBOX_FORWARD_FROM_PASSWORD : undefined, source: "env" });
    }
  }
  if (account.email.toLowerCase().endsWith(`@${MAIL_DOMAIN}`)) {
    const password = includePassword ? decryptOrNull(account.encPassword) : undefined;
    senders.push({
      email: account.email,
      password,
      source: password || !includePassword ? "account" : "none",
      error: password || !includePassword ? undefined : "Saved mailbox credentials are no longer available. Save this temp inbox account again."
    });
  }
  return senders.length ? senders : [{ source: "none", error: `Log in to your ${MAIL_DOMAIN} mailbox or set TEMP_INBOX_FORWARD_FROM_EMAIL and TEMP_INBOX_FORWARD_FROM_PASSWORD to a Mailu sender.` }];
}

function tempInboxForwardSender(account: TempInboxAccount, dashboardSession?: AuthSession | null, includePassword = true): TempInboxForwardSender {
  const senders = tempInboxForwardSenderCandidates(account, dashboardSession, includePassword);
  return senders.find((sender) => sender.email && (sender.password || !includePassword)) || senders[0];
}

function publicTempInboxForwardSender(sender: TempInboxForwardSender): PublicTempInboxForwardSender {
  const { password, ...publicSender } = sender;
  return publicSender;
}

function smtpAuthFailed(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /SMTP command failed \(535\)|\b535\b/.test(message);
}

function tempInboxForwardSendError(sender: TempInboxForwardSender, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (!smtpAuthFailed(error)) return message;
  const label = sender.source === "dashboard"
    ? "dashboard mailbox"
    : sender.source === "env"
      ? "configured forwarding sender"
      : "saved temp inbox sender";
  const email = sender.email ? ` ${sender.email}` : "";
  return `SMTP rejected the ${label}${email}. Log in again with the current mailbox password or configure a valid Mailu forwarding sender.`;
}

function latestTempInboxMessage(messages: NormalizedTempInboxMessage[]): NormalizedTempInboxMessage | undefined {
  if (!messages.length) return undefined;
  const dated = messages
    .map((message, index) => ({ message, index, time: new Date(message.date).getTime() }))
    .filter((item) => Number.isFinite(item.time));
  if (!dated.length) return messages[0];
  dated.sort((a, b) => b.time - a.time || a.index - b.index);
  return dated[0]?.message;
}

async function forwardTempInboxMessages(account: TempInboxAccount, messages: NormalizedTempInboxMessage[], dashboardSession?: AuthSession | null): Promise<{ forwarded: number; skipped: number; recipients: string[]; errors: string[]; sender: PublicTempInboxForwardSender }> {
  const forwarding = account.forwarding;
  const recipients = normalizeRecipients(forwarding?.recipients || []);
  const senders = tempInboxForwardSenderCandidates(account, dashboardSession);
  const publicSender = publicTempInboxForwardSender(tempInboxForwardSender(account, dashboardSession, false));
  if (!forwarding?.enabled || !recipients.length) return { forwarded: 0, skipped: messages.length, recipients: [], errors: [], sender: publicSender };
  if (!senders.some((sender) => sender.email && sender.password)) {
    const error = senders.find((sender) => sender.error)?.error || "Temp inbox forwarding sender is not available.";
    forwarding.lastForwardedAt = nowIso();
    forwarding.lastForwardedCount = 0;
    forwarding.lastForwardError = error;
    return { forwarded: 0, skipped: messages.length, recipients, errors: [error], sender: publicSender };
  }

  forwarding.forwardedMessageIds ||= [];
  const seen = new Set(forwarding.forwardedMessageIds);
  const errors: string[] = [];
  const message = latestTempInboxMessage(messages);
  let forwarded = 0;

  if (message) {
    const key = tempInboxMessageForwardKey(message);
    if (!seen.has(key)) {
      const attemptErrors: string[] = [];
      for (const sender of senders) {
        if (!sender.email || !sender.password) {
          if (sender.error) attemptErrors.push(sender.error);
          continue;
        }
        try {
          await sendPlainEmail(
            sender.email,
            sender.password,
            recipients,
            `Fwd: ${message.subject || "(No subject)"}`.slice(0, 180),
            tempInboxForwardBody(account, message),
            sender.email
          );
          seen.add(key);
          forwarded = 1;
          break;
        } catch (error) {
          attemptErrors.push(tempInboxForwardSendError(sender, error));
          if (!smtpAuthFailed(error)) break;
        }
      }
      if (!forwarded) errors.push(...attemptErrors);
    }
  }

  forwarding.forwardedMessageIds = Array.from(seen).slice(-1000);
  forwarding.lastForwardedAt = nowIso();
  forwarding.lastForwardedCount = forwarded;
  if (errors.length) forwarding.lastForwardError = errors[0];
  else delete forwarding.lastForwardError;
  return { forwarded, skipped: message && forwarded === 0 ? 1 : 0, recipients, errors, sender: publicSender };
}

function tempInboxForwardingDue(account: TempInboxAccount, now = Date.now()): boolean {
  const forwarding = account.forwarding;
  if (!forwarding?.enabled || !normalizeRecipients(forwarding.recipients).length) return false;
  const intervalMs = normalizeTempInboxForwardInterval(forwarding.intervalSeconds) * 1000;
  const lastCheck = forwarding.lastForwardCheckAt ? new Date(forwarding.lastForwardCheckAt).getTime() : 0;
  return !Number.isFinite(lastCheck) || now - lastCheck >= intervalMs;
}

async function runTempInboxForwardingOnce(): Promise<void> {
  const db = await readDb();
  let changed = false;
  const now = Date.now();

  for (const session of Object.values(db.tempInboxSessions)) {
    for (const account of session.accounts || []) {
      if (!tempInboxForwardingDue(account, now)) continue;
      account.forwarding ||= { enabled: false, recipients: [], intervalSeconds: 20, forwardedMessageIds: [] };
      account.forwarding.lastForwardCheckAt = nowIso();
      changed = true;

      try {
        const dashboardSession = authSessionFromId(db, account.forwarding.senderSessionId);
        const result = await fetchExternalTempInbox(account, "ALL", "", 10);
        account.lastFetchedAt = nowIso();
        await forwardTempInboxMessages(account, result.messages, dashboardSession);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        account.forwarding.lastForwardedAt = nowIso();
        account.forwarding.lastForwardedCount = 0;
        account.forwarding.lastForwardError = message;
        console.error("temp_inbox_background_forward_failed", { email: account.email, message });
      }
    }
  }

  if (changed) await writeDb(db);
}

let tempInboxForwardingWorkerRunning = false;
function startTempInboxForwardingWorker(): void {
  setInterval(() => {
    if (tempInboxForwardingWorkerRunning) return;
    tempInboxForwardingWorkerRunning = true;
    withDbMutation(runTempInboxForwardingOnce)
      .catch((error) => {
        console.error("temp_inbox_background_worker_failed", error);
      })
      .finally(() => {
        tempInboxForwardingWorkerRunning = false;
      });
  }, TEMP_INBOX_BACKGROUND_POLL_MS).unref();
}

function startRotatorOnboardingCredentialPurgeWorker(): void {
  setInterval(() => {
    withDbMutation(async () => {
      const db = await readDb();
      if (cleanupRotatorOnboardingCredentials(db)) await writeDb(db);
    }).catch((error) => {
      console.error("rotator_onboarding_credential_purge_failed", error);
    });
  }, 60_000).unref();
}

async function deleteMailuAlias(alias: MailAlias): Promise<MailuCreateResult> {
  if (MAILU_DRY_RUN) return { provider: "dry-run", message: "MAILU_DRY_RUN is enabled; no Mailu alias delete call was made." };
  const base = env.MAILU_API_BASE;
  const token = env.MAILU_API_TOKEN;
  if (!base || !token) throw new Error("MAILU_API_BASE and MAILU_API_TOKEN are required when MAILU_DRY_RUN=false.");
  const endpoint = MAILU_ALIAS_ENDPOINT.endsWith("/") ? `${MAILU_ALIAS_ENDPOINT}${encodeURIComponent(alias.email)}` : `${MAILU_ALIAS_ENDPOINT}/${encodeURIComponent(alias.email)}`;
  const response = await fetch(new URL(endpoint, base).toString(), {
    method: "DELETE",
    signal: AbortSignal.timeout(15_000),
    headers: { authorization: `Bearer ${token}`, "x-api-key": token }
  });
  const text = await response.text();
  if (!response.ok && response.status !== 404) throw new Error(`Mailu alias delete failed with ${response.status}: ${text.slice(0, 300)}`);
  return { provider: "mailu", status: response.status, body: text ? safeJson(text) : null };
}

function strongPassword(password: unknown): string | null {
  const value = String(password || "");
  if (value.length < 12) return "Use at least 12 characters.";
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/[0-9]/.test(value)) {
    return "Use uppercase, lowercase, and a number.";
  }
  return null;
}

function hashPassword(password: string, salt = randomToken(16)): string {
  const hash = crypto.pbkdf2Sync(password, salt, 210000, 32, "sha256").toString("base64url");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, expected] = String(stored || "").split(":");
  if (!salt || !expected) return false;
  const actual = hashPassword(password, salt).split(":")[1];
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function createCaptcha(): CaptchaChallenge {
  const a = crypto.randomInt(3, 13);
  const b = crypto.randomInt(3, 13);
  const id = randomToken(10);
  const exp = Date.now() + 10 * 60 * 1000;
  const token = `${id}.${exp}.${hmac(`${id}:${a + b}:${exp}`)}`;
  return { id, question: `${a} + ${b}`, token, answer: a + b };
}

function verifyCaptcha({ id, token, answer }: CaptchaPayload): boolean {
  const [tokenId, exp, sig] = String(token || "").split(".");
  if (!id || !tokenId || id !== tokenId || Number(exp) < Date.now()) return false;
  const expected = hmac(`${id}:${Number(answer)}:${exp}`);
  try {
    return crypto.timingSafeEqual(Buffer.from(sig || ""), Buffer.from(expected));
  } catch {
    return false;
  }
}

async function parseBody(req: IncomingMessage): Promise<any> {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error("Request body too large");
  }
  return body ? JSON.parse(body) : {};
}

function inviteIsUsable(invite?: Invite): boolean {
  if (!invite) return false;
  if (invite.revokedAt) return false;
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) return false;
  return Number(invite.uses || 0) < Number(invite.maxUses || 1);
}

async function getSession(req: IncomingMessage, db: Db): Promise<AuthSession | null> {
  const sessionId = parseCookies(req).mail_portal_session;
  if (!sessionId) return null;
  const session = db.sessions[sessionId];
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) return null;
  const mailbox = db.mailboxes[session.email];
  if (!mailbox || mailbox.kind === "temporary" || !mailboxIsUsable(mailbox)) return null;
  return { sessionId, mailbox, encPassword: session.encPassword };
}

function authSessionFromId(db: Db, sessionId?: string): AuthSession | null {
  if (!sessionId) return null;
  const session = db.sessions[sessionId];
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) return null;
  const mailbox = db.mailboxes[session.email];
  if (!mailbox || mailbox.kind === "temporary" || !mailboxIsUsable(mailbox)) return null;
  return { sessionId, mailbox, encPassword: session.encPassword };
}

function tempInboxDashboardSession(db: Db, account: TempInboxAccount, currentSession?: AuthSession | null): AuthSession | null {
  return currentSession || authSessionFromId(db, account.forwarding?.senderSessionId);
}

function randomLocalPart(): string {
  return `tmp-${crypto.randomBytes(5).toString("hex")}`;
}

function secondsUntil(iso: string): number {
  return Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1000));
}

async function createMailuMailbox({ local, password, displayName, kind = "permanent" }: MailuCreateArgs): Promise<MailuCreateResult> {
  if (MAILU_DRY_RUN) {
    return {
      provider: "dry-run",
      message: "MAILU_DRY_RUN is enabled; no Mailu API call was made."
    };
  }

  const base = env.MAILU_API_BASE;
  const token = env.MAILU_API_TOKEN;
  const endpoint = env.MAILU_CREATE_USER_ENDPOINT || "/api/v1/user";

  if (!base || !token) {
    throw new Error("MAILU_API_BASE and MAILU_API_TOKEN are required when MAILU_DRY_RUN=false.");
  }

  const url = new URL(endpoint, base).toString();
  const response = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "x-api-key": token
    },
    body: JSON.stringify({
      localpart: local,
      domain: MAIL_DOMAIN,
      email: `${local}@${MAIL_DOMAIN}`,
      raw_password: password,
      display_name: displayName || local,
      quota_bytes: (kind === "temporary" ? TEMP_QUOTA_MB : DEFAULT_QUOTA_MB) * 1024 * 1024,
      enabled: true,
      comment: kind === "temporary" ? "Created by Mailroom tempmail" : "Created by invite-mail-portal"
    })
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Mailu API failed with ${response.status}: ${text.slice(0, 300)}`);
  }

  return {
    provider: "mailu",
    status: response.status,
    body: text ? safeJson(text) : null
  };
}

async function deleteMailuMailbox(email: string): Promise<MailuCreateResult> {
  if (MAILU_DRY_RUN) {
    return {
      provider: "dry-run",
      message: "MAILU_DRY_RUN is enabled; no Mailu delete call was made."
    };
  }

  const base = env.MAILU_API_BASE;
  const token = env.MAILU_API_TOKEN;
  if (!base || !token) {
    throw new Error("MAILU_API_BASE and MAILU_API_TOKEN are required when MAILU_DRY_RUN=false.");
  }

  const endpoint = MAILU_DELETE_USER_ENDPOINT.endsWith("/")
    ? `${MAILU_DELETE_USER_ENDPOINT}${encodeURIComponent(email)}`
    : `${MAILU_DELETE_USER_ENDPOINT}/${encodeURIComponent(email)}`;
  const response = await fetch(new URL(endpoint, base).toString(), {
    method: "DELETE",
    signal: AbortSignal.timeout(15_000),
    headers: {
      authorization: `Bearer ${token}`,
      "x-api-key": token
    }
  });
  const text = await response.text();
  if (!response.ok && response.status !== 404) {
    throw new Error(`Mailu delete failed with ${response.status}: ${text.slice(0, 300)}`);
  }
  return { provider: "mailu", status: response.status, body: text ? safeJson(text) : null };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function layout({ title, active = "", body, authed = false }: LayoutOptions): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <link rel="stylesheet" href="/assets/styles.css">
    <script defer src="/assets/app.js"></script>
  </head>
  <body data-active="${active}">
    <header class="site-header">
      <a class="brand" href="/" aria-label="${MAIL_DOMAIN} home">
        <span class="brand-mark"><span></span></span>
        <span class="brand-copy"><strong>${MAIL_DOMAIN}</strong><small>private mail</small></span>
      </a>
      <nav class="nav" aria-label="Primary navigation">
        <a data-nav="claim" href="/claim">Claim</a>
        <a data-nav="dashboard" href="/dashboard">Dashboard</a>
        <a data-nav="admin" href="/admin">Admin</a>
        ${authed ? '<a href="/logout">Logout</a>' : '<a data-nav="login" href="/login">Login</a>'}
      </nav>
    </header>
    <main>${body}</main>
  </body>
</html>`;
}

function homePage(): string {
  return layout({
    title: `${MAIL_DOMAIN} Mail`,
    active: "home",
    body: `<section class="hero-shell">
      <div class="hero-copy">
        <p class="eyebrow">Invite-only mail infrastructure</p>
        <h1>Email on your domain, without opening the gates.</h1>
        <p class="lede">Create controlled mailboxes, hand users into webmail, and protect deliverability with a product flow built around invites, limits, and auditability.</p>
        <div class="actions">
          <a class="button primary" href="/claim">Claim an address</a>
          <a class="button secondary" href="/login">Open dashboard</a>
        </div>
        <div class="signal-row" aria-label="Launch controls">
          <span>Invite-only</span>
          <span>SPF / DKIM / DMARC</span>
          <span>Mailu-backed</span>
        </div>
      </div>
      <div class="mail-preview" aria-label="Mailbox product preview">
        <div class="preview-topbar">
          <span class="window-mark"></span>
          <strong>${MAIL_DOMAIN}</strong>
          <span>Reputation protected</span>
        </div>
        <div class="preview-body">
          <aside class="preview-rail">
            <span class="rail-active">Inbox</span>
            <span>Sent</span>
            <span>Quarantine</span>
            <span>Audit</span>
          </aside>
          <div class="preview-list">
            <div class="message-row active"><strong>Welcome packet</strong><span>Mailbox ready</span></div>
            <div class="message-row"><strong>DNS monitor</strong><span>DMARC passing</span></div>
            <div class="message-row"><strong>Outbound guard</strong><span>25 sent today</span></div>
          </div>
          <div class="preview-detail">
            <p class="eyebrow">example@${MAIL_DOMAIN}</p>
            <h2>Inbox enabled</h2>
            <p>Webmail access, quota controls, and warmup limits stay visible before users start sending.</p>
            <div class="mini-metrics"><span>Quota <b>${DEFAULT_QUOTA_MB} MB</b></span><span>Daily send <b>${DEFAULT_OUTBOUND_DAILY_LIMIT}</b></span></div>
          </div>
        </div>
      </div>
    </section>
    <section class="ops-band">
      <article><span>01</span><h2>Claim</h2><p>Invite code, address check, password policy, and captcha happen before any mailbox is created.</p></article>
      <article><span>02</span><h2>Create</h2><p>The portal records the account and calls Mailu server-side, keeping API tokens away from the browser.</p></article>
      <article><span>03</span><h2>Operate</h2><p>Users land in a dashboard with webmail access, account limits, status, and audit-friendly metadata.</p></article>
    </section>`
  });
}
function claimPage(): string {
  return layout({
    title: `Claim ${MAIL_DOMAIN} Mail`,
    active: "claim",
    body: `<section class="page-shell two-column">
      <div class="page-copy">
        <p class="eyebrow">Claim mailbox</p>
        <h1>Reserve an address that is actually allowed to send.</h1>
        <p class="lede compact">Every new mailbox starts with an invite, a uniqueness check, and a conservative sending profile.</p>
        <div class="step-list">
          <div><span>1</span><strong>Verify invite</strong><p>Only approved users can create addresses.</p></div>
          <div><span>2</span><strong>Choose local part</strong><p>Reserved names and risky patterns are blocked.</p></div>
          <div><span>3</span><strong>Open webmail</strong><p>After creation, users land in their dashboard.</p></div>
        </div>
      </div>
      <form class="panel form claim-card" data-claim-form>
        <div class="form-head"><p class="eyebrow">New mailbox</p><strong>@${MAIL_DOMAIN}</strong></div>
        <label>Invite code<input name="inviteCode" autocomplete="one-time-code" placeholder="PASTE-CODE" required></label>
        <label>Display name<input name="displayName" autocomplete="name" placeholder="Alex Morgan" required></label>
        <label>Email address
          <div class="address-row">
            <input name="local" data-local-input autocomplete="username" placeholder="alex" required>
            <span>@${MAIL_DOMAIN}</span>
          </div>
        </label>
        <p class="availability" data-availability>Type an address to check availability.</p>
        <label>Password<input name="password" type="password" autocomplete="new-password" placeholder="12+ chars, mixed case, number" required></label>
        <label class="captcha-label">Captcha <span data-captcha-question></span><input name="captchaAnswer" inputmode="numeric" required></label>
        <input type="hidden" name="captchaId">
        <input type="hidden" name="captchaToken">
        <button class="button primary full" type="submit">Create mailbox</button>
        <p class="form-message" data-form-message></p>
      </form>
    </section>`
  });
}

function loginPage(): string {
  return layout({
    title: `Login ${MAIL_DOMAIN} Mail`,
    active: "login",
    body: `<section class="auth-shell">
      <form class="panel form auth-card" data-login-form>
        <div class="mail-lock"><span></span></div>
        <p class="eyebrow">Mailbox login</p>
        <h1>Open your control panel.</h1>
        <label>Email<input name="email" type="email" autocomplete="email" placeholder="you@${MAIL_DOMAIN}" required></label>
        <label>Portal password<input name="password" type="password" autocomplete="current-password" required></label>
        <button class="button primary full" type="submit">Open dashboard</button>
        <p class="form-message" data-form-message></p>
      </form>
    </section>`
  });
}

function dashboardPage(mailbox: Mailbox): string {
  return layout({
    title: `Dashboard ${MAIL_DOMAIN} Mail`,
    active: "dashboard",
    authed: true,
    body: `<section class="dashboard-shell">
      <div class="dashboard-hero">
        <p class="eyebrow">Mailbox dashboard</p>
        <h1>${mailbox.email}</h1>
        <div class="actions">
          <a class="button primary" href="/webmail">Open webmail</a>
          <a class="button secondary" href="/logout">Logout</a>
        </div>
      </div>
      <div class="metric-grid">
        <div><span>Status</span><strong>${mailbox.status}</strong></div>
        <div><span>Quota</span><strong>${mailbox.quotaMb} MB</strong></div>
        <div><span>Daily outbound</span><strong>${mailbox.outboundDailyLimit}</strong></div>
        <div><span>Created</span><strong>${new Date(mailbox.createdAt).toLocaleString()}</strong></div>
      </div>
      <div class="panel dashboard-note">
        <p class="eyebrow">Next action</p>
        <h2>Use webmail for inbox, compose, folders, and password changes.</h2>
        <p>The custom portal keeps account status and controls visible while Mailu handles the heavy mail client work.</p>
      </div>
    </section>`
  });
}

function adminPage(): string {
  return layout({
    title: `Admin ${MAIL_DOMAIN} Mail`,
    active: "admin",
    body: `<section class="page-shell two-column admin-shell">
      <form class="panel form" data-admin-form>
        <div class="form-head"><p class="eyebrow">Admin</p><strong>Invite control</strong></div>
        <h1>Create invites.</h1>
        <label>Admin token<input name="adminToken" type="password" autocomplete="off" required></label>
        <label>Invite note<input name="note" placeholder="Friend, team, beta batch"></label>
        <div class="split-fields">
          <label>Max uses<input name="maxUses" type="number" min="1" max="10" value="1"></label>
          <label>Expires in days<input name="expiresInDays" type="number" min="1" max="365" value="30"></label>
        </div>
        <button class="button primary full" type="submit">Generate invite</button>
        <p class="form-message" data-form-message></p>
      </form>
      <div class="panel admin-list">
        <div class="section-title">
          <div><p class="eyebrow">Recent activity</p><h2>Invites and accounts</h2></div>
          <button class="button secondary" data-admin-refresh type="button">Refresh</button>
        </div>
        <div data-admin-output class="output">Enter the admin token and refresh.</div>
      </div>
    </section>`
  });
}
async function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
  const relative = pathname.replace(/^\/assets\//, "");
  const filePath = path.resolve(PUBLIC_DIR, relative);
  if (!filePath.startsWith(PUBLIC_DIR)) return html(res, "Not found", 404);
  try {
    const file = await fs.readFile(filePath);
    res.writeHead(200, { "content-type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(file);
  } catch {
    html(res, "Not found", 404);
  }
}

async function handleRotatorApi(req: IncomingMessage, res: ServerResponse, url: URL, db: Db): Promise<void> {
  const isAdmin = requireRotatorAdmin(req);
  const device = getRotatorDevice(req, db);

  if (url.pathname === "/api/rotator/onboarding/imap-test") {
    if (!isAdmin) return json(res, 401, { error: "Admin token required." });
    if (req.method !== "GET") return json(res, 404, { error: "Not found." });
    const email = validateEmail(url.searchParams.get("email"));
    const keyword = String(url.searchParams.get("keyword") || "openai").trim().slice(0, 80) || "openai";
    const reset = url.searchParams.get("reset") === "true";
    if (!email) return json(res, 400, { error: "A valid email query parameter is required." });
    if (!isZenvyOnboardingEmail(email)) return json(res, 400, { error: `Email must belong to ${MAIL_DOMAIN} or zenvy.com.bd.` });

    const formats = Array.from(new Set([
      ROTATOR_ZENVY_IMAP_AUTH_FORMAT,
      "{email}*{masterUser}",
      "{local}*{masterUser}",
      "{masterUser}*{email}",
      "{masterUser}*{local}"
    ]));
    const attempts: Array<Record<string, unknown>> = [];
    const storedPassword = getRotatorMailboxPassword(db, email);
    if (storedPassword) {
      const result = await testVerificationViaImap(email, storedPassword, email, keyword);
      attempts.push({ format: "stored_mailbox_password", ...result });
    }
    if (reset) {
      try {
        const password = await rotateZenvyMailboxPassword(db, email);
        await writeDb(db);
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const result = await testVerificationViaImap(email, password, email, keyword);
        attempts.push({ format: "mailu_password_reset", ...result });
      } catch (error) {
        attempts.push({ format: "mailu_password_reset", ok: false, authUser: email, error: cleanImapError(error) });
      }
    }
    let masterAuthError: string | undefined;
    if (!ROTATOR_ZENVY_IMAP_MASTER_USER || !ROTATOR_ZENVY_IMAP_MASTER_PASSWORD) {
      masterAuthError = "Zenvy onboarding IMAP master credentials are not configured.";
    } else if (ROTATOR_ZENVY_IMAP_MASTER_PASSWORD === "your-master-imap-password") {
      masterAuthError = "ROTATOR_ZENVY_IMAP_MASTER_PASSWORD is still set to the example placeholder.";
    } else {
      for (const format of formats) {
        const authUser = zenvyImapAuthUserForFormat(email, format);
        const result = await testVerificationViaImap(authUser, ROTATOR_ZENVY_IMAP_MASTER_PASSWORD, email, keyword);
        attempts.push({ format, ...result });
      }
    }
    const working = attempts.find((attempt) => attempt.ok);
    return json(res, 200, {
      ok: Boolean(working),
      host: MAIL_HOSTNAME,
      port: 993,
      targetEmail: email,
      masterUser: ROTATOR_ZENVY_IMAP_MASTER_USER || null,
      configuredFormat: ROTATOR_ZENVY_IMAP_AUTH_FORMAT,
      storedMailboxPassword: Boolean(db.rotatorMailboxCredentials[rotatorMailboxCredentialKey(email)]),
      resetTried: reset,
      masterAuthError,
      workingFormat: working?.format || null,
      attempts
    });
  }

  if (url.pathname === "/api/rotator/onboarding/jobs") {
    if (!isAdmin && !device) return json(res, 401, { error: "Rotator authorization required." });

    if (req.method === "GET") {
      if (device) await writeDb(db);
      return json(res, 200, { jobs: rotatorOnboardingJobList(db) });
    }

    if (!isAdmin) return json(res, 401, { error: "Admin token required." });
    if (req.method === "POST") {
      const body = await parseBody(req);
      const requestedItems = parseOnboardingItems(Array.isArray(body) ? body : body.items);
      if (!requestedItems.length) return json(res, 400, { error: "At least one onboarding item is required." });
      if (requestedItems.length > ROTATOR_ONBOARDING_MAX_ITEMS) return json(res, 400, { error: `Onboarding jobs are limited to ${ROTATOR_ONBOARDING_MAX_ITEMS} accounts.` });
      if (requestedItems.some((item) => !item.email)) return json(res, 400, { error: "Every onboarding item needs a valid email." });

      const job: RotatorOnboardingJob = {
        id: randomToken(12),
        createdAt: nowIso(),
        status: "running",
        items: []
      };

      requestedItems.forEach((item, index) => {
        const account = ensureRotatorAccount(db, item.email, item.label || `acct-${index + 1}`);
        const onboardingItem: RotatorOnboardingItem = {
          id: randomToken(10),
          accountId: account.id,
          email: item.email,
          hasPassword: Boolean(item.password),
          label: item.label || account.label,
          status: "queued",
          attempts: 0
        };
        job.items.push(onboardingItem);
        db.rotatorOnboardingCredentials[credentialKey(job.id, onboardingItem.id)] = {
          jobId: job.id,
          itemId: onboardingItem.id,
          encryptedPayload: encryptRotatorCredential({ email: item.email, password: item.password || "", label: item.label || account.label }),
          createdAt: nowIso()
        };
      });

      db.rotatorOnboardingJobs[job.id] = job;
      await audit(db, "admin", "rotator_onboarding_job_created", { jobId: job.id, count: job.items.length });
      await writeDb(db);
      return json(res, 201, { job: publicRotatorOnboardingJob(job) });
    }
  }

  const onboardingJobRoute = url.pathname.match(/^\/api\/rotator\/onboarding\/jobs\/([^/]+)$/);
  if (onboardingJobRoute) {
    if (!isAdmin && !device) return json(res, 401, { error: "Rotator authorization required." });
    const jobId = decodeURIComponent(onboardingJobRoute[1]);
    const job = db.rotatorOnboardingJobs[jobId];
    if (!job) return json(res, 404, { error: "Onboarding job not found." });

    if (req.method === "GET") {
      if (device) await writeDb(db);
      return json(res, 200, { job: publicRotatorOnboardingJob(job) });
    }

    if (req.method === "DELETE") {
      if (!isAdmin) return json(res, 401, { error: "Admin token required." });
      job.status = "cancelled";
      for (const item of job.items) {
        if (item.status === "queued" || item.status === "logging_in" || item.status === "awaiting_otp" || item.status === "verifying") {
          item.status = "needs_manual";
          item.errorReason = "unknown_error";
          item.completedAt = nowIso();
        }
        purgeOnboardingCredential(db, job.id, item.id);
      }
      await audit(db, "admin", "rotator_onboarding_job_cancelled", { jobId });
      await writeDb(db);
      return json(res, 200, { job: publicRotatorOnboardingJob(job) });
    }
  }

  const onboardingNextRoute = url.pathname.match(/^\/api\/rotator\/onboarding\/jobs\/([^/]+)\/next$/);
  if (onboardingNextRoute) {
    if (!device) return json(res, 401, { error: "Device token required." });
    if (req.method !== "GET") return json(res, 404, { error: "Not found." });
    if (!rateLimitKey(`rotator-onboarding-next:${device.id}`, 60, 15 * 60 * 1000)) {
      await writeDb(db);
      return json(res, 429, { error: "Too many onboarding claims. Try again later." });
    }
    const jobId = decodeURIComponent(onboardingNextRoute[1]);
    const job = db.rotatorOnboardingJobs[jobId];
    if (!job) return json(res, 404, { error: "Onboarding job not found." });
    if (job.status !== "running") {
      await writeDb(db);
      return json(res, 200, { item: null, job: publicRotatorOnboardingJob(job) });
    }

    const item = job.items.find((candidate) => candidate.status === "queued");
    if (!item) {
      updateOnboardingJobStatus(job);
      await writeDb(db);
      return json(res, 200, { item: null, job: publicRotatorOnboardingJob(job) });
    }

    const credential = db.rotatorOnboardingCredentials[credentialKey(job.id, item.id)];
    if (!credential) {
      item.status = "needs_manual";
      item.errorReason = "unknown_error";
      item.completedAt = nowIso();
      updateOnboardingJobStatus(job);
      await writeDb(db);
      return json(res, 409, { error: "Onboarding credentials expired. Create a retry job.", item, job: publicRotatorOnboardingJob(job) });
    }

    const payload = decryptRotatorCredential<{ email: string; password?: string; label?: string }>(credential.encryptedPayload);
    item.status = "logging_in";
    item.attempts += 1;
    item.claimedByDeviceId = device.id;
    item.claimedAt = nowIso();
    db.rotatorAudit.unshift({
      id: randomToken(10),
      at: nowIso(),
      deviceId: device.id,
      accountId: item.accountId,
      jobId: job.id,
      itemId: item.id,
      event: "onboarding_credential_claimed"
    });
    db.rotatorAudit = db.rotatorAudit.slice(0, 1000);
    await writeDb(db);
    return json(res, 200, {
      item: {
        id: item.id,
        accountId: item.accountId,
        email: payload.email,
        password: payload.password || "",
        label: payload.label || item.label || "",
        hasPassword: Boolean(payload.password)
      },
      job: publicRotatorOnboardingJob(job)
    });
  }

  const onboardingOtpRoute = url.pathname.match(/^\/api\/rotator\/onboarding\/jobs\/([^/]+)\/items\/([^/]+)\/otp$/);
  if (onboardingOtpRoute) {
    if (!device) return json(res, 401, { error: "Device token required." });
    if (req.method !== "GET") return json(res, 404, { error: "Not found." });
    const jobId = decodeURIComponent(onboardingOtpRoute[1]);
    const itemId = decodeURIComponent(onboardingOtpRoute[2]);
    const job = db.rotatorOnboardingJobs[jobId];
    const item = job?.items.find((candidate) => candidate.id === itemId);
    if (!job || !item) return json(res, 404, { error: "Onboarding item not found." });
    if (item.claimedByDeviceId !== device.id) return json(res, 403, { error: "This item is claimed by another device." });
    const credential = db.rotatorOnboardingCredentials[credentialKey(jobId, itemId)];
    if (!credential) return json(res, 409, { error: "Onboarding credentials expired. Create a retry job." });
    const payload = decryptRotatorCredential<{ email: string; password?: string }>(credential.encryptedPayload);
    item.status = "awaiting_otp";
    await writeDb(db);

    try {
      if (!isZenvyOnboardingEmail(payload.email) && !payload.password) {
        return json(res, 400, { error: "This onboarding item needs a password to fetch OTP." });
      }
      const match = isZenvyOnboardingEmail(payload.email)
        ? await fetchZenvyOnboardingOtp(db, payload.email)
        : await fetchExternalOnboardingOtp(payload.email, payload.password || "");
      db.rotatorAudit.unshift({
        id: randomToken(10),
        at: nowIso(),
        deviceId: device.id,
        accountId: item.accountId,
        jobId,
        itemId,
        event: "onboarding_otp_fetch"
      });
      db.rotatorAudit = db.rotatorAudit.slice(0, 1000);
      await writeDb(db);
      if (!match?.code) return json(res, 404, { error: "No OTP found yet." });
      return json(res, 200, {
        code: match.code,
        match: { subject: match.subject, from: match.from, date: match.date, confidence: match.confidence }
      });
    } catch (error) {
      await writeDb(db);
      return json(res, 502, { error: error instanceof Error ? error.message : "OTP fetch failed." });
    }
  }

  const onboardingResultRoute = url.pathname.match(/^\/api\/rotator\/onboarding\/jobs\/([^/]+)\/items\/([^/]+)\/result$/);
  if (onboardingResultRoute) {
    if (!device) return json(res, 401, { error: "Device token required." });
    if (req.method !== "POST") return json(res, 404, { error: "Not found." });
    const jobId = decodeURIComponent(onboardingResultRoute[1]);
    const itemId = decodeURIComponent(onboardingResultRoute[2]);
    const job = db.rotatorOnboardingJobs[jobId];
    const item = job?.items.find((candidate) => candidate.id === itemId);
    if (!job || !item) return json(res, 404, { error: "Onboarding item not found." });
    if (item.claimedByDeviceId !== device.id) return json(res, 403, { error: "This item is claimed by another device." });
    const body = await parseBody(req);
    const status = String(body.status || "");
    if (!["saved", "failed", "needs_manual"].includes(status)) return json(res, 400, { error: "Result status must be saved, failed, or needs_manual." });
    const errorReason = String(body.errorReason || "") as RotatorOnboardingErrorReason;
    const errorDetail = sanitizeOnboardingErrorDetail(body.errorDetail);
    item.status = status as RotatorOnboardingItemStatus;
    if (status !== "saved" && errorReason) item.errorReason = errorReason;
    if (status !== "saved" && errorDetail) item.errorDetail = errorDetail;
    if (status === "saved") {
      delete item.errorReason;
      delete item.errorDetail;
    }
    item.completedAt = nowIso();
    purgeOnboardingCredential(db, jobId, itemId);
    updateOnboardingJobStatus(job);
    await audit(db, device.id, "rotator_onboarding_item_result", { jobId, itemId, status, errorReason: status === "saved" ? undefined : errorReason });
    await writeDb(db);
    return json(res, 200, { item, job: publicRotatorOnboardingJob(job) });
  }

  if (url.pathname === "/api/rotator/devices") {
    if (!isAdmin) return json(res, 401, { error: "Admin token required." });

    if (req.method === "GET") {
      return json(res, 200, { devices: rotatorDeviceList(db) });
    }

    if (req.method === "POST") {
      const body = await parseBody(req);
      const name = String(body.name || "").trim().slice(0, 80);
      if (!name) return json(res, 400, { error: "Device name is required." });

      const token = randomToken(32);
      const deviceRecord: RotatorDevice = {
        id: randomToken(12),
        name,
        tokenHash: hashRotatorDeviceToken(token),
        createdAt: nowIso()
      };
      db.rotatorDevices[deviceRecord.id] = deviceRecord;
      await audit(db, "admin", "rotator_device_created", { deviceId: deviceRecord.id, name });
      await writeDb(db);
      return json(res, 201, { device: publicRotatorDevice(deviceRecord), token });
    }
  }

  const deviceRoute = url.pathname.match(/^\/api\/rotator\/devices\/([^/]+)$/);
  if (deviceRoute) {
    if (!isAdmin) return json(res, 401, { error: "Admin token required." });
    if (req.method !== "DELETE") return json(res, 404, { error: "Not found." });
    const id = decodeURIComponent(deviceRoute[1]);
    if (!db.rotatorDevices[id]) return json(res, 404, { error: "Device not found." });
    delete db.rotatorDevices[id];
    await audit(db, "admin", "rotator_device_revoked", { deviceId: id });
    await writeDb(db);
    return json(res, 200, { deleted: true });
  }

  if (url.pathname === "/api/rotator/accounts") {
    if (!isAdmin && !device) return json(res, 401, { error: "Rotator authorization required." });

    if (req.method === "GET") {
      if (device) await writeDb(db);
      return json(res, 200, { accounts: rotatorAccountList(db) });
    }

    if (!isAdmin) return json(res, 401, { error: "Admin token required." });

    if (req.method === "POST") {
      const body = await parseBody(req);
      const label = normalizeRotatorLabel(body.label);
      const email = validateEmail(body.email);
      if (!label) return json(res, 400, { error: "Account label is required." });
      if (!email) return json(res, 400, { error: "Enter a valid account email." });
      const duplicate = Object.values(db.rotatorAccounts).some((account) => account.email.toLowerCase() === email);
      if (duplicate) return json(res, 409, { error: "That rotator account already exists." });

      const account: RotatorAccount = {
        id: randomToken(12),
        label,
        email,
        status: "unknown",
        createdAt: nowIso()
      };
      db.rotatorAccounts[account.id] = account;
      await audit(db, "admin", "rotator_account_created", { accountId: account.id, email });
      await writeDb(db);
      return json(res, 201, { account: publicRotatorAccount(db, account) });
    }
  }

  const accountRoute = url.pathname.match(/^\/api\/rotator\/accounts\/([^/]+)$/);
  if (accountRoute) {
    if (!isAdmin) return json(res, 401, { error: "Admin token required." });
    const id = decodeURIComponent(accountRoute[1]);
    const account = db.rotatorAccounts[id];
    if (!account) return json(res, 404, { error: "Rotator account not found." });

    if (req.method === "PATCH") {
      const body = await parseBody(req);
      const label = body.label === undefined ? account.label : normalizeRotatorLabel(body.label);
      const email = body.email === undefined ? account.email : validateEmail(body.email);
      if (!label) return json(res, 400, { error: "Account label is required." });
      if (!email) return json(res, 400, { error: "Enter a valid account email." });
      const duplicate = Object.values(db.rotatorAccounts).some((item) => item.id !== id && item.email.toLowerCase() === email);
      if (duplicate) return json(res, 409, { error: "That rotator account already exists." });

      account.label = label;
      account.email = email;
      await audit(db, "admin", "rotator_account_updated", { accountId: id });
      await writeDb(db);
      return json(res, 200, { account: publicRotatorAccount(db, account) });
    }

    if (req.method === "DELETE") {
      delete db.rotatorAccounts[id];
      delete db.rotatorSessions[id];
      await audit(db, "admin", "rotator_account_deleted", { accountId: id });
      await writeDb(db);
      return json(res, 200, { deleted: true });
    }
  }

  const sessionRoute = url.pathname.match(/^\/api\/rotator\/accounts\/([^/]+)\/session$/);
  if (sessionRoute) {
    if (!device) return json(res, 401, { error: "Device token required." });
    const accountId = decodeURIComponent(sessionRoute[1]);
    const account = db.rotatorAccounts[accountId];
    if (!account) return json(res, 404, { error: "Rotator account not found." });

    if (req.method === "POST") {
      const body = await parseBody(req);
      if (!Array.isArray(body)) return json(res, 400, { error: "Session snapshot must be a cookie array." });
      let encryptedPayload = "";
      try {
        encryptedPayload = encryptRotatorSession(body);
      } catch (error) {
        return json(res, 500, { error: error instanceof Error ? error.message : "Rotator session encryption failed." });
      }
      const existing = db.rotatorSessions[accountId];
      db.rotatorSessions[accountId] = {
        accountId,
        encryptedPayload,
        uploadedByDeviceId: device.id,
        createdAt: existing?.createdAt || nowIso(),
        updatedAt: nowIso()
      };
      account.status = "unknown";
      await audit(db, device.id, "rotator_session_uploaded", { accountId });
      await writeDb(db);
      return json(res, 200, { account: publicRotatorAccount(db, account) });
    }

    if (req.method === "GET") {
      if (!rateLimitKey(`rotator-session-fetch:${device.id}`, 30, 15 * 60 * 1000)) {
        await writeDb(db);
        return json(res, 429, { error: "Too many session fetches. Try again later." });
      }
      const snapshot = db.rotatorSessions[accountId];
      if (!snapshot) {
        await writeDb(db);
        return json(res, 404, { error: "No session snapshot is saved for this account." });
      }
      let session;
      try {
        session = decryptRotatorSession(snapshot.encryptedPayload);
      } catch (error) {
        await writeDb(db);
        return json(res, 500, { error: error instanceof Error ? error.message : "Rotator session decrypt failed." });
      }
      account.lastUsed = nowIso();
      db.rotatorAudit.unshift({
        id: randomToken(10),
        at: nowIso(),
        deviceId: device.id,
        accountId,
        event: "session_fetched"
      });
      db.rotatorAudit = db.rotatorAudit.slice(0, 1000);
      await writeDb(db);
      return json(res, 200, { session });
    }
  }

  const markStatusRoute = url.pathname.match(/^\/api\/rotator\/accounts\/([^/]+)\/mark-status$/);
  if (markStatusRoute) {
    if (!device) return json(res, 401, { error: "Device token required." });
    if (req.method !== "POST") return json(res, 404, { error: "Not found." });
    const accountId = decodeURIComponent(markStatusRoute[1]);
    const account = db.rotatorAccounts[accountId];
    if (!account) return json(res, 404, { error: "Rotator account not found." });
    const body = await parseBody(req);
    const status = String(body.status || "");
    if (status !== "active" && status !== "needs_relogin") return json(res, 400, { error: "Status must be active or needs_relogin." });
    account.status = status;
    account.lastVerifiedAt = nowIso();
    await audit(db, device.id, "rotator_account_status_marked", { accountId, status });
    await writeDb(db);
    return json(res, 200, { account: publicRotatorAccount(db, account) });
  }

  if (url.pathname === "/api/rotator/audit") {
    if (!isAdmin) return json(res, 401, { error: "Admin token required." });
    if (req.method !== "GET") return json(res, 404, { error: "Not found." });
    return json(res, 200, { audit: db.rotatorAudit.slice(0, 100) });
  }

  return json(res, 404, { error: "Not found." });
}

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const db = await readDb();
  await cleanupExpiredTempMailboxes(db);
  if (cleanupRotatorOnboardingCredentials(db)) await writeDb(db);

  if (url.pathname.startsWith("/api/rotator")) {
    return handleRotatorApi(req, res, url, db);
  }

  if (req.method === "GET" && url.pathname === "/api/captcha") {
    const challenge = createCaptcha();
    return json(res, 200, {
      id: challenge.id,
      question: challenge.question,
      token: challenge.token
    });
  }

  if (req.method === "GET" && url.pathname === "/api/mailboxes/check") {
    const local = normalizeLocal(url.searchParams.get("local"));
    const error = validateLocal(local);
    const email = `${local}@${MAIL_DOMAIN}`;
    return json(res, 200, {
      local,
      email,
      available: !error && !aliasEmailExists(db, email),
      reason: error || (aliasEmailExists(db, email) ? "That address already exists." : null)
    });
  }

  if (req.method === "POST" && url.pathname === "/api/invites/claim") {
    if (!rateLimit(req, "claim", 20, 15 * 60 * 1000)) return json(res, 429, { error: "Too many attempts. Try again later." });
    const body = await parseBody(req);
    const code = String(body.inviteCode || "").trim().toUpperCase();
    const invite = db.invites[code];
    return json(res, inviteIsUsable(invite) ? 200 : 400, {
      valid: inviteIsUsable(invite),
      invite: inviteIsUsable(invite)
        ? { code, note: invite.note || "", remaining: Number(invite.maxUses || 1) - Number(invite.uses || 0) }
        : null,
      error: inviteIsUsable(invite) ? null : "Invite is invalid, expired, revoked, or fully used."
    });
  }

  if (req.method === "POST" && url.pathname === "/api/mailboxes") {
    if (!rateLimit(req, "create", 8, 15 * 60 * 1000)) return json(res, 429, { error: "Too many attempts. Try again later." });
    const body = await parseBody(req);
    const code = String(body.inviteCode || "").trim().toUpperCase();
    const local = normalizeLocal(body.local);
    const displayName = String(body.displayName || "").trim().slice(0, 80);
    const email = `${local}@${MAIL_DOMAIN}`;
    const localError = validateLocal(local);
    const passwordError = strongPassword(body.password);

    if (!verifyCaptcha(body.captcha || {})) return json(res, 400, { error: "Captcha did not match." });
    if (localError) return json(res, 400, { error: localError });
    if (passwordError) return json(res, 400, { error: passwordError });
    if (!displayName) return json(res, 400, { error: "Display name is required." });
    if (aliasEmailExists(db, email)) return json(res, 409, { error: "That address already exists." });

    const invite = db.invites[code];
    if (!inviteIsUsable(invite)) return json(res, 400, { error: "Invite is invalid, expired, revoked, or fully used." });

    let providerResult;
    try {
      providerResult = await createMailuMailbox({ local, password: body.password, displayName, kind: "permanent" });
    } catch (error) {
      console.error("[ERROR] Mailu mailbox creation failed:", error);
      await audit(db, email, "mailu_create_failed", { message: error.message });
      await writeDb(db);
      return json(res, 502, { error: error.message });
    }

    const mailbox = {
      id: randomToken(12),
      local,
      domain: MAIL_DOMAIN,
      email,
      displayName,
      kind: "permanent",
      status: MAILU_DRY_RUN ? "dry-run" : "active",
      quotaMb: DEFAULT_QUOTA_MB,
      outboundDailyLimit: DEFAULT_OUTBOUND_DAILY_LIMIT,
      passwordHash: hashPassword(body.password),
      createdAt: nowIso(),
      inviteCode: code,
      webmailUrl: WEBMAIL_URL,
      providerResult
    };

    db.mailboxes[email] = mailbox;
    invite.uses = Number(invite.uses || 0) + 1;
    invite.claimedBy = [...(invite.claimedBy || []), email];
    await audit(db, email, "mailbox_created", { inviteCode: code, dryRun: MAILU_DRY_RUN });

    const sessionId = randomToken(32);
    db.sessions[sessionId] = {
      email,
      createdAt: nowIso(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      encPassword: encrypt(body.password)
    };
    await writeDb(db);
    setSessionCookie(res, sessionId, req);
    return json(res, 201, { mailbox: publicMailbox(mailbox), redirectTo: "/dashboard" });
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    if (!rateLimit(req, "login", 10, 15 * 60 * 1000)) return json(res, 429, { error: "Too many attempts. Try again later." });
    const body = await parseBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const mailbox = db.mailboxes[email];
    if (!mailbox || mailbox.kind === "temporary" || !mailboxIsUsable(mailbox) || !verifyPassword(body.password, mailbox.passwordHash)) {
      await audit(db, email || "unknown", "login_failed", { ip: clientIp(req) });
      await writeDb(db);
      return json(res, 401, { error: "Email or password is incorrect." });
    }
    const sessionId = randomToken(32);
    db.sessions[sessionId] = {
      email,
      createdAt: nowIso(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      encPassword: encrypt(body.password)
    };
    await audit(db, email, "login_succeeded", { ip: clientIp(req) });
    await writeDb(db);
    setSessionCookie(res, sessionId, req);
    return json(res, 200, { redirectTo: "/dashboard" });
  }

  if (req.method === "GET" && url.pathname === "/api/me/mailbox") {
    const session = await getSession(req, db);
    if (!session) return json(res, 401, { error: "Not signed in." });
    return json(res, 200, { mailbox: publicMailbox(session.mailbox) });
  }
  if (req.method === "GET" && url.pathname === "/api/me/forwarding") {
    const session = await getSession(req, db);
    if (!session) return json(res, 401, { error: "Not signed in." });
    return json(res, 200, {
      enabled: Boolean(session.mailbox.forwardingEnabled),
      recipients: (session.mailbox.forwardTo || []).map(publicForwardingRecipient),
      limit: FORWARDING_RECIPIENT_LIMIT,
      verifyTtlMinutes: FORWARDING_VERIFY_TTL_MINUTES,
      providerResult: session.mailbox.forwardingProviderResult || null
    });
  }
  if (req.method === "POST" && url.pathname === "/api/me/forwarding/recipients") {
    const session = await getSession(req, db);
    if (!session) return json(res, 401, { error: "Not signed in." });
    if (!session.encPassword) return json(res, 400, { error: "Please log in again to verify forwarding recipients." });
    if (session.mailbox.kind === "temporary") return json(res, 403, { error: "Temporary mailboxes cannot use forwarding." });
    if (!rateLimit(req, "forwarding-add", 10, 15 * 60 * 1000)) return json(res, 429, { error: "Too many forwarding changes. Try again later." });
    if (forwardingRecipientLimitReached(session.mailbox)) return json(res, 400, { error: "Forwarding recipient limit reached." });
    const body = await parseBody(req);
    const parsed = validateForwardingEmail(session.mailbox, body.email);
    if (parsed.error) return json(res, 400, { error: parsed.error });
    const recipient: ForwardingRecipient = {
      id: randomToken(10),
      email: parsed.email,
      status: "pending",
      includeInGlobalForwarding: true,
      createdAt: nowIso()
    };
    const code = newForwardingCode(session.mailbox, recipient);
    try {
      const password = decrypt(session.encPassword);
      await sendForwardingVerificationEmail(session.mailbox, password, recipient, code);
      session.mailbox.forwardTo ||= [];
      session.mailbox.forwardTo.push(recipient);
      await audit(db, session.mailbox.email, "forwarding_recipient_added", { recipient: recipient.email, dryRun: MAILU_DRY_RUN });
      await writeDb(db);
      return json(res, 201, {
        recipient: publicForwardingRecipient(recipient),
        recipients: session.mailbox.forwardTo.map(publicForwardingRecipient),
        expiresAt: recipient.codeExpiresAt
      });
    } catch (error) {
      await audit(db, session.mailbox.email, "forwarding_verification_send_failed", { recipient: recipient.email, message: error instanceof Error ? error.message : String(error) });
      await writeDb(db);
      return json(res, 502, { error: error instanceof Error ? error.message : "Could not send verification email." });
    }
  }
  const forwardingRecipientRoute = url.pathname.match(/^\/api\/me\/forwarding\/recipients\/([^/]+)(?:\/(verify|resend))?$/);
  if (forwardingRecipientRoute && req.method === "POST" && forwardingRecipientRoute[2] === "verify") {
    const session = await getSession(req, db);
    if (!session) return json(res, 401, { error: "Not signed in." });
    if (session.mailbox.kind === "temporary") return json(res, 403, { error: "Temporary mailboxes cannot use forwarding." });
    const recipient = getForwardingRecipient(session.mailbox, decodeURIComponent(forwardingRecipientRoute[1]));
    if (!recipient || recipient.disabledAt) return json(res, 404, { error: "Forwarding recipient not found." });
    const body = await parseBody(req);
    if (!verifyForwardingCode(session.mailbox, recipient, body.code)) return json(res, 400, { error: "Verification code is invalid or expired." });
    recipient.status = "verified";
    recipient.verifiedAt = nowIso();
    delete recipient.codeHash;
    delete recipient.codeExpiresAt;
    try {
      session.mailbox.forwardingProviderResult = await syncMailuForwarding(session.mailbox);
      recipient.providerResult = session.mailbox.forwardingProviderResult;
      await audit(db, session.mailbox.email, "forwarding_recipient_verified", { recipient: recipient.email, dryRun: MAILU_DRY_RUN });
      await writeDb(db);
      return json(res, 200, {
        recipient: publicForwardingRecipient(recipient),
        recipients: (session.mailbox.forwardTo || []).map(publicForwardingRecipient),
        providerResult: session.mailbox.forwardingProviderResult
      });
    } catch (error) {
      await audit(db, session.mailbox.email, "forwarding_provider_sync_failed", { recipient: recipient.email, message: error instanceof Error ? error.message : String(error) });
      await writeDb(db);
      return json(res, 424, { error: error instanceof Error ? error.message : "Forwarding provider sync failed." });
    }
  }
  if (forwardingRecipientRoute && req.method === "POST" && forwardingRecipientRoute[2] === "resend") {
    const session = await getSession(req, db);
    if (!session) return json(res, 401, { error: "Not signed in." });
    if (!session.encPassword) return json(res, 400, { error: "Please log in again to resend verification." });
    if (!rateLimit(req, "forwarding-resend", 10, 15 * 60 * 1000)) return json(res, 429, { error: "Too many verification emails. Try again later." });
    const recipient = getForwardingRecipient(session.mailbox, decodeURIComponent(forwardingRecipientRoute[1]));
    if (!recipient || recipient.disabledAt) return json(res, 404, { error: "Forwarding recipient not found." });
    if (recipient.status === "verified") return json(res, 400, { error: "Recipient is already verified." });
    const code = newForwardingCode(session.mailbox, recipient);
    try {
      const password = decrypt(session.encPassword);
      await sendForwardingVerificationEmail(session.mailbox, password, recipient, code);
      await audit(db, session.mailbox.email, "forwarding_verification_resent", { recipient: recipient.email, dryRun: MAILU_DRY_RUN });
      await writeDb(db);
      return json(res, 200, { recipient: publicForwardingRecipient(recipient), recipients: (session.mailbox.forwardTo || []).map(publicForwardingRecipient), expiresAt: recipient.codeExpiresAt });
    } catch (error) {
      await audit(db, session.mailbox.email, "forwarding_verification_resend_failed", { recipient: recipient.email, message: error instanceof Error ? error.message : String(error) });
      await writeDb(db);
      return json(res, 502, { error: error instanceof Error ? error.message : "Could not resend verification email." });
    }
  }
  if (forwardingRecipientRoute && req.method === "PATCH" && !forwardingRecipientRoute[2]) {
    const session = await getSession(req, db);
    if (!session) return json(res, 401, { error: "Not signed in." });
    if (session.mailbox.kind === "temporary") return json(res, 403, { error: "Temporary mailboxes cannot use forwarding." });
    const recipient = getForwardingRecipient(session.mailbox, decodeURIComponent(forwardingRecipientRoute[1]));
    if (!recipient || recipient.disabledAt) return json(res, 404, { error: "Forwarding recipient not found." });
    if (recipient.status !== "verified") return json(res, 400, { error: "Verify this recipient before changing primary mail forwarding." });
    const body = await parseBody(req);
    if (typeof body.includeInGlobalForwarding !== "boolean") return json(res, 400, { error: "includeInGlobalForwarding must be true or false." });
    const previousInclude = recipient.includeInGlobalForwarding;
    const previousForwardingEnabled = session.mailbox.forwardingEnabled;
    recipient.includeInGlobalForwarding = body.includeInGlobalForwarding;
    if (!primaryForwardingDestinations(session.mailbox).length) session.mailbox.forwardingEnabled = false;
    try {
      session.mailbox.forwardingProviderResult = await syncMailuForwarding(session.mailbox);
      await audit(db, session.mailbox.email, "forwarding_recipient_updated", {
        recipient: recipient.email,
        includeInGlobalForwarding: recipient.includeInGlobalForwarding,
        forwardingEnabled: Boolean(session.mailbox.forwardingEnabled),
        dryRun: MAILU_DRY_RUN
      });
      await writeDb(db);
      return json(res, 200, {
        recipient: publicForwardingRecipient(recipient),
        recipients: (session.mailbox.forwardTo || []).map(publicForwardingRecipient),
        enabled: Boolean(session.mailbox.forwardingEnabled),
        providerResult: session.mailbox.forwardingProviderResult
      });
    } catch (error) {
      recipient.includeInGlobalForwarding = previousInclude;
      session.mailbox.forwardingEnabled = previousForwardingEnabled;
      await audit(db, session.mailbox.email, "forwarding_provider_sync_failed", { recipient: recipient.email, message: error instanceof Error ? error.message : String(error) });
      await writeDb(db);
      return json(res, 424, { error: error instanceof Error ? error.message : "Forwarding provider sync failed." });
    }
  }
  if (forwardingRecipientRoute && req.method === "DELETE" && !forwardingRecipientRoute[2]) {
    const session = await getSession(req, db);
    if (!session) return json(res, 401, { error: "Not signed in." });
    const recipient = getForwardingRecipient(session.mailbox, decodeURIComponent(forwardingRecipientRoute[1]));
    if (!recipient) return json(res, 404, { error: "Forwarding recipient not found." });
    const removedEmail = recipient.email;
    const affectedAliases = (session.mailbox.aliases || []).filter((alias) => (alias.forwardTo || []).some((item) => item.toLowerCase() === removedEmail.toLowerCase()));
    for (const alias of affectedAliases) {
      alias.forwardTo = (alias.forwardTo || []).filter((item) => item.toLowerCase() !== removedEmail.toLowerCase());
    }
    session.mailbox.forwardTo = (session.mailbox.forwardTo || []).filter((item) => item.id !== recipient.id);
    if (!primaryForwardingDestinations(session.mailbox).length) session.mailbox.forwardingEnabled = false;
    try {
      session.mailbox.forwardingProviderResult = await syncMailuForwarding(session.mailbox);
      for (const alias of affectedAliases) {
        alias.providerResult = await upsertMailuAlias(session.mailbox, alias, alias.status === "active");
      }
      await deleteMailuMailbox(aliasForwardRelayEmail(session.mailbox, removedEmail));
      await audit(db, session.mailbox.email, "forwarding_recipient_deleted", { recipient: removedEmail, aliasesUpdated: affectedAliases.map((alias) => alias.email), dryRun: MAILU_DRY_RUN });
      await writeDb(db);
      return json(res, 200, { deleted: true, recipients: (session.mailbox.forwardTo || []).map(publicForwardingRecipient), enabled: Boolean(session.mailbox.forwardingEnabled), providerResult: session.mailbox.forwardingProviderResult });
    } catch (error) {
      await audit(db, session.mailbox.email, "forwarding_provider_sync_failed", { recipient: removedEmail, message: error instanceof Error ? error.message : String(error) });
      await writeDb(db);
      return json(res, 424, { error: error instanceof Error ? error.message : "Forwarding provider sync failed." });
    }
  }
  if (req.method === "PATCH" && url.pathname === "/api/me/forwarding") {
    const session = await getSession(req, db);
    if (!session) return json(res, 401, { error: "Not signed in." });
    if (session.mailbox.kind === "temporary") return json(res, 403, { error: "Temporary mailboxes cannot use forwarding." });
    const body = await parseBody(req);
    const enabled = Boolean(body.enabled);
    if (enabled && !primaryForwardingDestinations(session.mailbox).length) return json(res, 400, { error: "Enable primary mail on at least one verified recipient before turning global forwarding on." });
    session.mailbox.forwardingEnabled = enabled;
    try {
      session.mailbox.forwardingProviderResult = await syncMailuForwarding(session.mailbox);
      await audit(db, session.mailbox.email, "forwarding_updated", { enabled, destinations: primaryForwardingDestinations(session.mailbox), dryRun: MAILU_DRY_RUN });
      await writeDb(db);
      return json(res, 200, {
        enabled: Boolean(session.mailbox.forwardingEnabled),
        recipients: (session.mailbox.forwardTo || []).map(publicForwardingRecipient),
        providerResult: session.mailbox.forwardingProviderResult
      });
    } catch (error) {
      await audit(db, session.mailbox.email, "forwarding_provider_sync_failed", { enabled, message: error instanceof Error ? error.message : String(error) });
      await writeDb(db);
      return json(res, 424, { error: error instanceof Error ? error.message : "Forwarding provider sync failed." });
    }
  }
  if (req.method === "GET" && url.pathname === "/api/me/aliases") {
    const session = await getSession(req, db);
    if (!session) return json(res, 401, { error: "Not signed in." });
    return json(res, 200, {
      aliases: (session.mailbox.aliases || []).map(publicAlias),
      limit: session.mailbox.aliasLimit || DEFAULT_ALIAS_LIMIT,
      forwardLimit: ALIAS_FORWARD_LIMIT
    });
  }

  if (req.method === "POST" && url.pathname === "/api/me/aliases") {
    const session = await getSession(req, db);
    if (!session) return json(res, 401, { error: "Not signed in." });
    if (!rateLimit(req, "alias-create", 15, 15 * 60 * 1000)) return json(res, 429, { error: "Too many alias changes. Try again later." });
    const body = await parseBody(req);
    const local = normalizeLocal(body.local);
    const email = `${local}@${MAIL_DOMAIN}`;
    const localError = validateLocal(local);
    const parsedForwards = parseForwardTo(body.forwardTo, session.mailbox);
    if (localError) return json(res, 400, { error: localError });
    if (parsedForwards.error) return json(res, 400, { error: parsedForwards.error });
    if (aliasEmailExists(db, email)) return json(res, 409, { error: "That address already exists." });
    if (activeAliases(session.mailbox).length >= (session.mailbox.aliasLimit || DEFAULT_ALIAS_LIMIT)) return json(res, 400, { error: "Alias limit reached." });
    const alias: MailAlias = {
      id: randomToken(10),
      local,
      email,
      label: String(body.label || "").trim().slice(0, 60),
      status: "active",
      forwardTo: parsedForwards.forwardTo,
      createdAt: nowIso()
    };
    try {
      alias.providerResult = await upsertMailuAlias(session.mailbox, alias, true);
      session.mailbox.aliases ||= [];
      session.mailbox.aliases.push(alias);
      await audit(db, session.mailbox.email, "alias_created", { alias: alias.email, forwardTo: alias.forwardTo, dryRun: MAILU_DRY_RUN });
      await writeDb(db);
      return json(res, 201, { alias: publicAlias(alias), aliases: session.mailbox.aliases.map(publicAlias) });
    } catch (error) {
      await audit(db, session.mailbox.email, "alias_provider_create_failed", { alias: alias.email, message: error instanceof Error ? error.message : String(error) });
      await writeDb(db);
      return json(res, 424, { error: error instanceof Error ? error.message : "Alias provider setup failed." });
    }
  }

  const aliasRoute = url.pathname.match(/^\/api\/me\/aliases\/([^/]+)$/);
  if (aliasRoute && req.method === "PATCH") {
    const session = await getSession(req, db);
    if (!session) return json(res, 401, { error: "Not signed in." });
    const alias = getAlias(session.mailbox, decodeURIComponent(aliasRoute[1]));
    if (!alias) return json(res, 404, { error: "Alias not found." });
    const body = await parseBody(req);
    const previousForwardTo = [...(alias.forwardTo || [])];
    const previousAlias = {
      label: alias.label,
      forwardTo: [...(alias.forwardTo || [])],
      status: alias.status,
      disabledAt: alias.disabledAt
    };
    if (body.label !== undefined) alias.label = String(body.label || "").trim().slice(0, 60);
    if (body.forwardTo !== undefined) {
      const parsedForwards = parseForwardTo(body.forwardTo, session.mailbox);
      if (parsedForwards.error) return json(res, 400, { error: parsedForwards.error });
      alias.forwardTo = parsedForwards.forwardTo;
    }
    if (body.disabled !== undefined) {
      const disabled = Boolean(body.disabled);
      alias.status = disabled ? "disabled" : "active";
      if (disabled) alias.disabledAt ||= nowIso();
      else delete alias.disabledAt;
    }
    try {
      alias.providerResult = await upsertMailuAlias(session.mailbox, alias, alias.status === "active");
      await audit(db, session.mailbox.email, "alias_updated", { alias: alias.email, forwardTo: alias.forwardTo, previousForwardTo, status: alias.status, dryRun: MAILU_DRY_RUN });
      await writeDb(db);
      return json(res, 200, { alias: publicAlias(alias), aliases: (session.mailbox.aliases || []).map(publicAlias) });
    } catch (error) {
      alias.label = previousAlias.label;
      alias.forwardTo = previousAlias.forwardTo;
      alias.status = previousAlias.status;
      if (previousAlias.disabledAt) alias.disabledAt = previousAlias.disabledAt;
      else delete alias.disabledAt;
      await audit(db, session.mailbox.email, "alias_provider_update_failed", { alias: alias.email, message: error instanceof Error ? error.message : String(error) });
      await writeDb(db);
      return json(res, 424, { error: error instanceof Error ? error.message : "Alias provider update failed." });
    }
  }

  if (aliasRoute && req.method === "DELETE") {
    const session = await getSession(req, db);
    if (!session) return json(res, 401, { error: "Not signed in." });
    const alias = getAlias(session.mailbox, decodeURIComponent(aliasRoute[1]));
    if (!alias) return json(res, 404, { error: "Alias not found." });
    const removedForwardTo = [...(alias.forwardTo || [])];
    try {
      await deleteMailuAlias(alias);
      session.mailbox.aliases = (session.mailbox.aliases || []).filter((item) => item.id !== alias.id);
      for (const recipientEmail of removedForwardTo) {
        const stillUsed = (session.mailbox.aliases || []).some((item) => (item.forwardTo || []).some((recipient) => recipient.toLowerCase() === recipientEmail.toLowerCase()));
        if (!stillUsed) await deleteMailuMailbox(aliasForwardRelayEmail(session.mailbox, recipientEmail));
      }
      await audit(db, session.mailbox.email, "alias_deleted", { alias: alias.email, dryRun: MAILU_DRY_RUN });
      await writeDb(db);
      return json(res, 200, { deleted: true, aliases: (session.mailbox.aliases || []).map(publicAlias) });
    } catch (error) {
      await audit(db, session.mailbox.email, "alias_provider_delete_failed", { alias: alias.email, message: error instanceof Error ? error.message : String(error) });
      await writeDb(db);
      return json(res, 424, { error: error instanceof Error ? error.message : "Alias provider delete failed." });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/me/verification-codes") {
    const session = await getSession(req, db);
    if (!session) return json(res, 401, { error: "Not signed in." });
    if (!session.encPassword) return json(res, 400, { error: "Please log in again to scan verification codes." });
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 10), 1), 20);
    try {
      const password = decrypt(session.encPassword);
      const aliases = activeAliases(session.mailbox);
      const emails = await fetchEmails(session.mailbox.email, password, "inbox", aliases);
      const matches: VerificationMatch[] = [];
      for (const item of emails.slice(0, limit)) {
        const detail = await fetchEmailBody(session.mailbox.email, password, item.uid, "inbox", aliases);
        if (detail.verification) matches.push(detail.verification);
      }
      return json(res, 200, { matches: matches.slice(0, limit) });
    } catch (error) {
      return json(res, 500, { error: error instanceof Error ? error.message : "Failed to scan verification codes." });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/me/emails") {
    const session = await getSession(req, db);
    if (!session) return json(res, 401, { error: "Not signed in." });
    if (!session.encPassword) {
      return json(res, 400, { error: "Please log in again to sync your emails." });
    }
    try {
      const password = decrypt(session.encPassword);
      const folder = normalizeFolder(url.searchParams.get("folder"));
      const emails = await fetchEmails(session.mailbox.email, password, folder, activeAliases(session.mailbox));
      return json(res, 200, { emails });
    } catch (error) {
      console.error("[ERROR] Failed to fetch emails via IMAP:", error);
      return json(res, 500, { error: error.message });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/me/email") {
    const session = await getSession(req, db);
    if (!session) return json(res, 401, { error: "Not signed in." });
    if (!session.encPassword) {
      return json(res, 400, { error: "Please log in again to sync your emails." });
    }
    const uid = url.searchParams.get("uid");
    const folder = normalizeFolder(url.searchParams.get("folder"));
    if (!uid) return json(res, 400, { error: "Missing uid parameter." });
    try {
      const password = decrypt(session.encPassword);
      const email = await fetchEmailBody(session.mailbox.email, password, uid, folder, activeAliases(session.mailbox));
      return json(res, 200, { email });
    } catch (error) {
      console.error("[ERROR] Failed to fetch email body via IMAP:", error);
      return json(res, 500, { error: error.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/me/send") {
    const session = await getSession(req, db);
    if (!session) return json(res, 401, { error: "Not signed in." });
    if (!session.encPassword) return json(res, 400, { error: "Please log in again to send mail." });
    if (session.mailbox.kind === "temporary") return json(res, 403, { error: "Temporary mailboxes are receive-only." });
    if (!rateLimit(req, "send", 25, 15 * 60 * 1000)) return json(res, 429, { error: "Too many sends. Try again later." });
    const body = await parseBody(req);
    const recipients = normalizeRecipients(body.to);
    const subject = String(body.subject || "").trim().slice(0, 180) || "(No subject)";
    const messageBody = String(body.body || "").slice(0, 20_000);
    const fromAliasId = String(body.fromAliasId || "").trim();
    const replyToUid = String(body.replyToUid || "").trim();
    const replyFolder = normalizeFolder(body.replyFolder);
    if (!recipients.length) return json(res, 400, { error: "Enter at least one valid recipient." });
    if (!messageBody.trim()) return json(res, 400, { error: "Message body is required." });
    try {
      const password = decrypt(session.encPassword);
      let fromAddress = session.mailbox.email;
      if (fromAliasId) {
        const alias = getAlias(session.mailbox, fromAliasId);
        if (!alias || alias.status !== "active") return json(res, 403, { error: "Alias sender is not available." });
        if (!replyToUid) return json(res, 400, { error: "Alias replies require an original message." });
        const original = await fetchEmailBody(session.mailbox.email, password, replyToUid, replyFolder, activeAliases(session.mailbox));
        if (original.deliveredToAlias?.id !== alias.id) return json(res, 403, { error: "You can only reply from an alias that received the original message." });
        fromAddress = alias.email;
      }
      const result = await sendPlainEmail(session.mailbox.email, password, recipients, subject, messageBody, fromAddress);
      await audit(db, session.mailbox.email, "email_sent", { to: recipients, subject, from: fromAddress, dryRun: MAILU_DRY_RUN });
      await writeDb(db);
      return json(res, 200, { result });
    } catch (error) {
      return json(res, 502, { error: error instanceof Error ? error.message : "Failed to send email." });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/me/email/move") {
    const session = await getSession(req, db);
    if (!session) return json(res, 401, { error: "Not signed in." });
    if (!session.encPassword) return json(res, 400, { error: "Please log in again to move mail." });
    const body = await parseBody(req);
    const uid = String(body.uid || "").trim();
    const fromFolder = normalizeFolder(body.fromFolder);
    const toFolder = normalizeFolder(body.toFolder);
    if (!uid) return json(res, 400, { error: "Missing uid." });
    if (fromFolder === toFolder) return json(res, 400, { error: "Choose a different destination folder." });
    try {
      const password = decrypt(session.encPassword);
      const result = await moveEmail(session.mailbox.email, password, uid, fromFolder, toFolder);
      await audit(db, session.mailbox.email, "email_moved", { uid, fromFolder, toFolder, dryRun: MAILU_DRY_RUN });
      await writeDb(db);
      return json(res, 200, { result });
    } catch (error) {
      return json(res, 502, { error: error instanceof Error ? error.message : "Failed to move email." });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/temp-inbox/accounts") {
    const tempInbox = getOrCreateTempInboxSession(req, res, db);
    const dashboardSession = await getSession(req, db);
    if (dashboardSession?.sessionId) {
      for (const account of tempInbox.session.accounts) {
        if (account.forwarding?.enabled && normalizeRecipients(account.forwarding.recipients).length) {
          account.forwarding.senderSessionId ||= dashboardSession.sessionId;
        }
      }
    }
    const firstAccount = tempInbox.session.accounts[0] || { id: "", email: "", encPassword: "", createdAt: nowIso() };
    const firstAccountSession = tempInboxDashboardSession(db, firstAccount, dashboardSession);
    await writeDb(db);
    return json(res, 200, {
      accounts: tempInbox.session.accounts.map((account) => publicTempInboxAccount(account, tempInboxDashboardSession(db, account, dashboardSession))),
      forwardSender: publicTempInboxForwardSender(tempInboxForwardSender(firstAccount, firstAccountSession, false))
    });
  }

  if (req.method === "POST" && url.pathname === "/api/temp-inbox/accounts") {
    if (!rateLimit(req, "temp-inbox-account", 20, 15 * 60 * 1000)) return json(res, 429, { error: "Too many account changes. Try again later." });
    const body = await parseBody(req);
    const email = validateEmail(body.email);
    const password = String(body.password || "");
    if (!email) return json(res, 400, { error: "Enter a valid email address." });
    if (!password) return json(res, 400, { error: "Password is required." });
    const label = String(body.label || "").trim().slice(0, 60);
    const tempInbox = getOrCreateTempInboxSession(req, res, db);
    const existing = tempInbox.session.accounts.find((account) => account.email.toLowerCase() === email);
    if (existing) {
      existing.encPassword = encrypt(password);
      existing.label = label || existing.label;
    } else {
      tempInbox.session.accounts.unshift({
        id: randomToken(10),
        email,
        encPassword: encrypt(password),
        label: label || undefined,
        forwarding: { enabled: false, recipients: [], intervalSeconds: 20, forwardedMessageIds: [] },
        createdAt: nowIso()
      });
    }
    await writeDb(db);
    const dashboardSession = await getSession(req, db);
    const firstAccount = tempInbox.session.accounts[0] || { id: "", email: "", encPassword: "", createdAt: nowIso() };
    const firstAccountSession = tempInboxDashboardSession(db, firstAccount, dashboardSession);
    return json(res, 201, {
      accounts: tempInbox.session.accounts.map((account) => publicTempInboxAccount(account, tempInboxDashboardSession(db, account, dashboardSession))),
      forwardSender: publicTempInboxForwardSender(tempInboxForwardSender(firstAccount, firstAccountSession, false))
    });
  }

  const tempInboxAccountRoute = url.pathname.match(/^\/api\/temp-inbox\/accounts\/([^/]+)$/);
  if (tempInboxAccountRoute && req.method === "PATCH") {
    const tempInbox = getOrCreateTempInboxSession(req, res, db);
    const id = decodeURIComponent(tempInboxAccountRoute[1]);
    const account = tempInbox.session.accounts.find((item) => item.id === id);
    if (!account) return json(res, 404, { error: "Mailbox account not found." });
    const body = await parseBody(req);
    const dashboardSession = await getSession(req, db);
    const effectiveDashboardSession = tempInboxDashboardSession(db, account, dashboardSession);
    const recipients = normalizeRecipients(body.forwardRecipients);
    const intervalSeconds = normalizeTempInboxForwardInterval(body.forwardIntervalSeconds);
    const enabled = Boolean(body.forwardEnabled);
    if (enabled && !recipients.length) return json(res, 400, { error: "Add at least one forwarding recipient before enabling auto forward." });
    if (enabled) {
      const sender = tempInboxForwardSender(account, effectiveDashboardSession);
      if (!sender.email || !sender.password) return json(res, 400, { error: sender.error || "Temp inbox forwarding sender is not configured.", forwardSender: publicTempInboxForwardSender(sender) });
    }
    account.forwarding ||= { enabled: false, recipients: [], intervalSeconds: 20, forwardedMessageIds: [] };
    account.forwarding.enabled = enabled;
    account.forwarding.recipients = recipients;
    account.forwarding.intervalSeconds = intervalSeconds;
    account.forwarding.forwardedMessageIds ||= [];
    if (enabled && dashboardSession?.sessionId) account.forwarding.senderSessionId = dashboardSession.sessionId;
    if (!enabled) {
      delete account.forwarding.senderSessionId;
      delete account.forwarding.lastForwardError;
    }
    await writeDb(db);
    const responseDashboardSession = tempInboxDashboardSession(db, account, dashboardSession);
    return json(res, 200, {
      account: publicTempInboxAccount(account, responseDashboardSession),
      accounts: tempInbox.session.accounts.map((item) => publicTempInboxAccount(item, tempInboxDashboardSession(db, item, dashboardSession))),
      forwardSender: publicTempInboxForwardSender(tempInboxForwardSender(account, responseDashboardSession, false))
    });
  }

  if (tempInboxAccountRoute && req.method === "DELETE") {
    const tempInbox = getOrCreateTempInboxSession(req, res, db);
    const dashboardSession = await getSession(req, db);
    const id = decodeURIComponent(tempInboxAccountRoute[1]);
    tempInbox.session.accounts = tempInbox.session.accounts.filter((account) => account.id !== id);
    await writeDb(db);
    return json(res, 200, { deleted: true, accounts: tempInbox.session.accounts.map((account) => publicTempInboxAccount(account, tempInboxDashboardSession(db, account, dashboardSession))) });
  }

  if (req.method === "POST" && url.pathname === "/api/temp-inbox/fetch") {
    if (!rateLimit(req, "temp-inbox-fetch", 120, 15 * 60 * 1000)) return json(res, 429, { error: "Too many mailbox fetches. Try again later." });
    const body = await parseBody(req);
    const accountId = String(body.accountId || "").trim();
    const folder = String(body.folder || "ALL").trim().slice(0, 40) || "ALL";
    const keyword = String(body.keyword || "").trim().slice(0, 120);
    const maxCount = Math.max(1, Math.min(50, Number(body.maxCount || 10) || 10));
    const tempInbox = getOrCreateTempInboxSession(req, res, db);
    const account = tempInbox.session.accounts.find((item) => item.id === accountId);
    if (!account) return json(res, 404, { error: "Mailbox account not found." });
    try {
      const result = await fetchExternalTempInbox(account, folder, keyword, maxCount);
      account.lastFetchedAt = nowIso();
      await writeDb(db);
      return json(res, 200, result);
    } catch (error) {
      return json(res, 502, { error: error instanceof Error ? error.message : "Mailbox fetch failed." });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/temp-inbox/fetch-forward") {
    if (!rateLimit(req, "temp-inbox-fetch-forward", 120, 15 * 60 * 1000)) return json(res, 429, { error: "Too many mailbox fetches. Try again later." });
    const body = await parseBody(req);
    const accountId = String(body.accountId || "").trim();
    const folder = String(body.folder || "ALL").trim().slice(0, 40) || "ALL";
    const keyword = String(body.keyword || "").trim().slice(0, 120);
    const maxCount = Math.max(1, Math.min(50, Number(body.maxCount || 10) || 10));
    const tempInbox = getOrCreateTempInboxSession(req, res, db);
    const account = tempInbox.session.accounts.find((item) => item.id === accountId);
    if (!account) return json(res, 404, { error: "Mailbox account not found." });
    try {
      const result = await fetchExternalTempInbox(account, folder, keyword, maxCount);
      account.lastFetchedAt = nowIso();
      const dashboardSession = await getSession(req, db);
      const effectiveDashboardSession = tempInboxDashboardSession(db, account, dashboardSession);
      if (account.forwarding?.enabled && dashboardSession?.sessionId) account.forwarding.senderSessionId = dashboardSession.sessionId;
      const forwarding = await forwardTempInboxMessages(account, result.messages, effectiveDashboardSession);
      await writeDb(db);
      const responseDashboardSession = tempInboxDashboardSession(db, account, dashboardSession);
      return json(res, 200, { ...result, forwarding, account: publicTempInboxAccount(account, responseDashboardSession), forwardSender: forwarding.sender });
    } catch (error) {
      return json(res, 502, { error: error instanceof Error ? error.message : "Mailbox fetch and forward failed." });
    }
  }

  if (url.pathname.startsWith("/api/temp-mailboxes") && !TEMP_MAIL_ENABLED) {
    return json(res, 404, { error: "Temporary mail is not available." });
  }

  if (req.method === "POST" && url.pathname === "/api/temp-mailboxes") {
    if (!rateLimit(req, "temp-create", 12, 15 * 60 * 1000)) return json(res, 429, { error: "Too many temp inboxes. Try again later." });
    const body = await parseBody(req);
    if (!verifyCaptcha(body.captcha || {})) return json(res, 400, { error: "Captcha did not match." });
    const durationHours = Number(body.durationHours) === 24 ? 24 : 1;
    let local = randomLocalPart();
    for (let attempt = 0; attempt < 8 && db.mailboxes[`${local}@${MAIL_DOMAIN}`]; attempt += 1) {
      local = randomLocalPart();
    }
    const email = `${local}@${MAIL_DOMAIN}`;
    if (db.mailboxes[email]) return json(res, 409, { error: "Could not generate a temp address. Try again." });
    const password = `${randomToken(18)}Aa1`;
    const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();
    let providerResult;
    try {
      providerResult = await createMailuMailbox({ local, password, displayName: "Temporary mailbox", kind: "temporary" });
    } catch (error) {
      await audit(db, email, "temp_mailu_create_failed", { message: error instanceof Error ? error.message : String(error) });
      await writeDb(db);
      return json(res, 502, { error: error instanceof Error ? error.message : "Temp mailbox creation failed." });
    }
    const mailbox: Mailbox = {
      id: randomToken(12),
      local,
      domain: MAIL_DOMAIN,
      email,
      displayName: "Temporary mailbox",
      kind: "temporary",
      status: MAILU_DRY_RUN ? "dry-run" : "active",
      quotaMb: TEMP_QUOTA_MB,
      outboundDailyLimit: TEMP_OUTBOUND_DAILY_LIMIT,
      passwordHash: hashPassword(password),
      createdAt: nowIso(),
      expiresAt,
      webmailUrl: WEBMAIL_URL,
      providerResult
    };
    db.mailboxes[email] = mailbox;
    const token = randomToken(32);
    db.tempSessions[token] = { email, createdAt: nowIso(), expiresAt, encPassword: encrypt(password) };
    await audit(db, email, "temp_mailbox_created", { durationHours, dryRun: MAILU_DRY_RUN });
    await writeDb(db);
    setTempSessionCookie(res, token, secondsUntil(expiresAt), req);
    return json(res, 201, { mailbox: publicMailbox(mailbox), redirectTo: "/temp" });
  }

  if (req.method === "GET" && url.pathname === "/api/temp-mailboxes/me") {
    const session = await getTempSession(req, db);
    if (!session) {
      clearTempSessionCookie(res, req);
      return json(res, 401, { error: "No active temp inbox." });
    }
    return json(res, 200, { mailbox: publicMailbox(session.mailbox) });
  }

  if (req.method === "GET" && url.pathname === "/api/temp-mailboxes/emails") {
    const session = await getTempSession(req, db);
    if (!session) {
      clearTempSessionCookie(res, req);
      return json(res, 401, { error: "No active temp inbox." });
    }
    try {
      const password = decrypt(session.encPassword || "");
      const emails = await fetchEmails(session.mailbox.email, password, "inbox", activeAliases(session.mailbox));
      return json(res, 200, { emails });
    } catch (error) {
      return json(res, 500, { error: error instanceof Error ? error.message : "Failed to sync temp inbox." });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/temp-mailboxes/email") {
    const session = await getTempSession(req, db);
    if (!session) {
      clearTempSessionCookie(res, req);
      return json(res, 401, { error: "No active temp inbox." });
    }
    const uid = url.searchParams.get("uid");
    if (!uid) return json(res, 400, { error: "Missing uid parameter." });
    try {
      const password = decrypt(session.encPassword || "");
      const email = await fetchEmailBody(session.mailbox.email, password, uid, "inbox", activeAliases(session.mailbox));
      return json(res, 200, { email });
    } catch (error) {
      return json(res, 500, { error: error instanceof Error ? error.message : "Failed to load temp message." });
    }
  }

  if (url.pathname.startsWith("/api/admin")) {
    const token = req.headers["x-admin-token"];
    if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) return json(res, 401, { error: "Admin token required." });

    if (req.method === "POST" && url.pathname === "/api/admin/invites") {
      const body = await parseBody(req);
      const code = randomToken(9).toUpperCase();
      const maxUses = Math.min(Math.max(Number(body.maxUses || 1), 1), 10);
      const days = Math.min(Math.max(Number(body.expiresInDays || 30), 1), 365);
      db.invites[code] = {
        code,
        note: String(body.note || "").trim().slice(0, 120),
        maxUses,
        uses: 0,
        createdAt: nowIso(),
        expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
        claimedBy: []
      };
      await audit(db, "admin", "invite_created", { code, maxUses });
      await writeDb(db);
      return json(res, 201, { invite: db.invites[code] });
    }

    if (req.method === "GET" && url.pathname === "/api/admin/summary") {
      const publicMailboxes = Object.values(db.mailboxes).map(publicMailbox);
      const permanentCount = publicMailboxes.filter((mailbox) => mailbox.kind !== "temporary").length;
      const visibleMailboxes = TEMP_MAIL_ENABLED ? publicMailboxes : publicMailboxes.filter((mailbox) => mailbox.kind !== "temporary");
      const mailboxCounts = TEMP_MAIL_ENABLED ? {
        permanent: permanentCount,
        temporary: publicMailboxes.filter((mailbox) => mailbox.kind === "temporary" && !mailbox.deletedAt).length,
        expiredTemporary: publicMailboxes.filter((mailbox) => mailbox.kind === "temporary" && Boolean(mailbox.expiresAt) && new Date(mailbox.expiresAt!).getTime() <= Date.now()).length
      } : { permanent: permanentCount };
      return json(res, 200, {
        mailboxes: visibleMailboxes,
        mailboxCounts,
        invites: Object.values(db.invites).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 50),
        audit: db.audit.slice(0, 50),
        dryRun: MAILU_DRY_RUN,
        tempMailEnabled: TEMP_MAIL_ENABLED
      });
    }
  }

  return json(res, 404, { error: "Not found." });
}

function publicMailbox(mailbox: Mailbox): PublicMailbox {
  const { passwordHash, providerResult, aliases, forwardTo, forwardingProviderResult, ...publicFields } = mailbox;
  return {
    ...publicFields,
    aliases: (aliases || []).map(publicAlias),
    forwardTo: (forwardTo || []).map(publicForwardingRecipient)
  };
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": CLIENT_ORIGIN,
        "access-control-allow-credentials": "true",
        "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
        "access-control-allow-headers": "content-type,x-admin-token,authorization"
      });
      return res.end();
    }
    if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true, service: "mail-portal-api" });
    if (req.method === "GET" && url.pathname === "/api/public-config") {
      return json(res, 200, {
        mailDomain: MAIL_DOMAIN,
        mailHostname: MAIL_HOSTNAME,
        webmailUrl: WEBMAIL_URL,
        dryRun: MAILU_DRY_RUN,
        defaultQuotaMb: DEFAULT_QUOTA_MB,
        defaultOutboundDailyLimit: DEFAULT_OUTBOUND_DAILY_LIMIT,
        defaultAliasLimit: DEFAULT_ALIAS_LIMIT,
        aliasForwardLimit: ALIAS_FORWARD_LIMIT,
        forwardingRecipientLimit: FORWARDING_RECIPIENT_LIMIT,
        forwardingVerifyTtlMinutes: FORWARDING_VERIFY_TTL_MINUTES,
        tempMailEnabled: TEMP_MAIL_ENABLED
      });
    }
    if (url.pathname.startsWith("/api/")) return withDbMutation(() => handleApi(req, res, url));

    return withDbMutation(async () => {
      const db = await readDb();
      await cleanupExpiredTempMailboxes(db);
      const session = await getSession(req, db);

      if (req.method === "GET" && url.pathname === "/") return json(res, 200, { ok: true, service: "mail-portal-api", client: CLIENT_ORIGIN });
      if (req.method === "GET" && url.pathname === "/claim") return html(res, claimPage());
      if (req.method === "GET" && url.pathname === "/login") return html(res, loginPage());
      if (req.method === "GET" && url.pathname === "/admin") return html(res, adminPage());
      if (req.method === "GET" && url.pathname === "/dashboard") {
        if (!session) return redirect(res, "/login");
        return html(res, dashboardPage(session.mailbox));
      }
      if (req.method === "GET" && url.pathname === "/webmail") {
        if (!session) return redirect(res, "/login");
        return redirect(res, session.mailbox.webmailUrl || WEBMAIL_URL);
      }
      if (req.method === "GET" && url.pathname === "/logout") {
        if (session) {
          delete db.sessions[session.sessionId];
          await writeDb(db);
        }
        clearSessionCookie(res, req);
        return redirect(res, "/");
      }

      return html(res, layout({ title: "Not found", body: '<section class="workspace narrow"><div class="panel"><h1>Not found</h1><p>This route does not exist.</p></div></section>' }), 404);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("request_failed", { path: url.pathname, message, error });
    return json(res, 500, { error: env.NODE_ENV === "production" ? "Internal server error." : message });
  }
}

export { handle };

await ensureDb();
if (env.MAILROOM_NO_LISTEN !== "true") {
  startTempInboxForwardingWorker();
  startRotatorOnboardingCredentialPurgeWorker();
  http.createServer(handle).listen(PORT, () => {
    console.log(`Invite mail portal running at http://localhost:${PORT}`);
    console.log(`Domain: ${MAIL_DOMAIN}; Mailu dry-run: ${MAILU_DRY_RUN}`);
  });
}



















