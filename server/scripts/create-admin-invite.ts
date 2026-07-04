import { existsSync, readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

type Invite = {
  code: string;
  note: string;
  maxUses: number;
  uses: number;
  createdAt: string;
  expiresAt: string;
  claimedBy: string[];
};

type Db = {
  invites: Record<string, Invite>;
  mailboxes: Record<string, unknown>;
  sessions: Record<string, unknown>;
  audit: Array<Record<string, unknown>>;
};
function loadDotEnv(): void {
  if (!existsSync(".env")) return;
  const lines = readFileSync(".env", "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();
const DATA_DIR = path.resolve(process.env.DATA_DIR || "./data");
const DATABASE_URL = process.env.DATABASE_URL || "";
const DB_PATH = DATABASE_URL.startsWith("file:")
  ? path.resolve(DATABASE_URL.slice("file:".length))
  : path.join(DATA_DIR, "db.json");
const DB_DIR = path.dirname(DB_PATH);

function token(bytes = 9): string {
  return crypto.randomBytes(bytes).toString("base64url").toUpperCase();
}

async function readDb(): Promise<Db> {
  await fs.mkdir(DB_DIR, { recursive: true });
  try {
    return JSON.parse(await fs.readFile(DB_PATH, "utf8"));
  } catch {
    return { invites: {}, mailboxes: {}, sessions: {}, audit: [] };
  }
}

const db = await readDb();
const code = token();
db.invites[code] = {
  code,
  note: process.argv.slice(2).join(" ") || "Seed invite",
  maxUses: 1,
  uses: 0,
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  claimedBy: []
};
db.audit.unshift({
  id: token(8),
  at: new Date().toISOString(),
  actor: "script",
  event: "invite_created",
  details: { code }
});
await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2));
console.log(code);



