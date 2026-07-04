import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { ImapFlow } from "imapflow";

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

type Mailbox = {
  id: string;
  local: string;
  domain: string;
  email: string;
  displayName: string;
  status: "dry-run" | "active";
  quotaMb: number;
  outboundDailyLimit: number;
  passwordHash: string;
  createdAt: string;
  inviteCode: string;
  webmailUrl: string;
  providerResult: MailuCreateResult;
};

type PublicMailbox = Omit<Mailbox, "passwordHash" | "providerResult">;

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

type Db = {
  invites: Record<string, Invite>;
  mailboxes: Record<string, Mailbox>;
  sessions: Record<string, SessionRecord>;
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
const MAIL_DOMAIN = (env.MAIL_DOMAIN || "example.com").toLowerCase();
const MAIL_HOSTNAME = (env.MAIL_HOSTNAME || `mail.${MAIL_DOMAIN}`).toLowerCase();
const WEBMAIL_URL = env.WEBMAIL_URL || `https://${MAIL_HOSTNAME}/webmail/`;
const ADMIN_TOKEN = env.ADMIN_TOKEN || "change-me";
const DEFAULT_QUOTA_MB = Number(env.DEFAULT_QUOTA_MB || 1024);
const DEFAULT_OUTBOUND_DAILY_LIMIT = Number(env.DEFAULT_OUTBOUND_DAILY_LIMIT || 50);
const MAILU_DRY_RUN = String(env.MAILU_DRY_RUN ?? "true").toLowerCase() !== "false";
const CLIENT_ORIGIN = env.CLIENT_ORIGIN || "http://localhost:3000";

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

async function fetchEmails(email: string, pass: string) {
  if (MAILU_DRY_RUN) {
    return MOCK_EMAILS;
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
  const lock = await client.getMailboxLock("INBOX");
  const emails = [];
  try {
    const status = await client.status("INBOX", { messages: true });
    const count = status.messages || 0;
    if (count > 0) {
      const range = `${Math.max(1, count - 19)}:${count}`;
      for await (const msg of client.fetch({ seq: range }, { envelope: true })) {
        emails.push({
          uid: msg.uid.toString(),
          seq: msg.seq,
          subject: msg.envelope.subject || "(No Subject)",
          from: msg.envelope.from?.[0] 
            ? `${msg.envelope.from[0].name || ""} <${msg.envelope.from[0].address || ""}>`.trim() 
            : "Unknown Sender",
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

function rateLimit(req: IncomingMessage, key: string, limit: number, windowMs: number): boolean {
  const bucketKey = `${key}:${clientIp(req)}`;
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

async function ensureDb(): Promise<void> {
  await fs.mkdir(DB_DIR, { recursive: true });
  try {
    await fs.access(DB_PATH);
  } catch {
    const initial = {
      invites: {},
      mailboxes: {},
      sessions: {},
      audit: []
    };
    await fs.writeFile(DB_PATH, JSON.stringify(initial, null, 2));
  }
}

async function readDb(): Promise<Db> {
  await ensureDb();
  const raw = await fs.readFile(DB_PATH, "utf8");
  return JSON.parse(raw);
}

async function writeDb(db: Db): Promise<void> {
  await fs.mkdir(DB_DIR, { recursive: true });
  const tmp = `${DB_PATH}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2));
  await fs.rename(tmp, DB_PATH);
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

async function parseBody(req: IncomingMessage): Promise<RequestBody> {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 32_000) throw new Error("Request body too large");
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
  if (!mailbox) return null;
  return { sessionId, mailbox, encPassword: session.encPassword };
}

async function createMailuMailbox({ local, password, displayName }: MailuCreateArgs): Promise<MailuCreateResult> {
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
      quota_bytes: DEFAULT_QUOTA_MB * 1024 * 1024,
      enabled: true,
      comment: "Created by invite-mail-portal"
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

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const db = await readDb();

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
      available: !error && !db.mailboxes[email],
      reason: error || (db.mailboxes[email] ? "That mailbox already exists." : null)
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
    if (db.mailboxes[email]) return json(res, 409, { error: "That mailbox already exists." });

    const invite = db.invites[code];
    if (!inviteIsUsable(invite)) return json(res, 400, { error: "Invite is invalid, expired, revoked, or fully used." });

    let providerResult;
    try {
      providerResult = await createMailuMailbox({ local, password: body.password, displayName });
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
    if (!mailbox || !verifyPassword(body.password, mailbox.passwordHash)) {
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

  if (req.method === "GET" && url.pathname === "/api/me/emails") {
    const session = await getSession(req, db);
    if (!session) return json(res, 401, { error: "Not signed in." });
    if (!session.encPassword) {
      return json(res, 400, { error: "Please log in again to sync your emails." });
    }
    try {
      const password = decrypt(session.encPassword);
      const emails = await fetchEmails(session.mailbox.email, password);
      return json(res, 200, { emails });
    } catch (error) {
      console.error("[ERROR] Failed to fetch emails via IMAP:", error);
      return json(res, 500, { error: error.message });
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
      return json(res, 200, {
        mailboxes: Object.values(db.mailboxes).map(publicMailbox),
        invites: Object.values(db.invites).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 50),
        audit: db.audit.slice(0, 50),
        dryRun: MAILU_DRY_RUN
      });
    }
  }

  return json(res, 404, { error: "Not found." });
}

function publicMailbox(mailbox: Mailbox): PublicMailbox {
  const { passwordHash, providerResult, ...publicFields } = mailbox;
  return publicFields;
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url, `http://${req.headers.host}`);
  console.log(`[DEBUG] Request: ${req.method} ${url.pathname} | Cookies: ${req.headers.cookie || "none"} | Proto: ${req.headers["x-forwarded-proto"] || "none"}`);
  
  // Wrap res.setHeader to intercept and log set-cookie headers
  const originalSetHeader = res.setHeader.bind(res);
  res.setHeader = (name, value) => {
    if (name.toLowerCase() === "set-cookie") {
      console.log(`[DEBUG] Response Set-Cookie: ${value}`);
    }
    return originalSetHeader(name, value);
  };

  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": CLIENT_ORIGIN,
        "access-control-allow-credentials": "true",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type,x-admin-token"
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
        defaultOutboundDailyLimit: DEFAULT_OUTBOUND_DAILY_LIMIT
      });
    }
    if (url.pathname.startsWith("/api/")) return handleApi(req, res, url);

    const db = await readDb();
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("request_failed", { path: url.pathname, message, error });
    return json(res, 500, { error: env.NODE_ENV === "production" ? "Internal server error." : message });
  }
}

await ensureDb();
http.createServer(handle).listen(PORT, () => {
  console.log(`Invite mail portal running at http://localhost:${PORT}`);
  console.log(`Domain: ${MAIL_DOMAIN}; Mailu dry-run: ${MAILU_DRY_RUN}`);
});













