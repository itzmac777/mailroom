import { existsSync, readFileSync } from "node:fs";
import dns from "node:dns/promises";
import net from "node:net";
import tls from "node:tls";

type CheckResult = {
  name: string;
  ok: boolean;
  result: unknown;
};

type CheckFn = () => Promise<unknown>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
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
const domain: string | undefined = process.env.MAIL_DOMAIN;
const hostname: string = process.env.MAIL_HOSTNAME || (domain ? `mail.${domain}` : "");
const ports: number[] = [25, 465, 587, 993, 80, 443];

if (!domain || !hostname) {
  console.error("Set MAIL_DOMAIN and MAIL_HOSTNAME before running dns:preflight.");
  process.exit(1);
}

const checks: CheckResult[] = [];

async function check(name: string, fn: CheckFn): Promise<void> {
  try {
    const result = await fn();
    checks.push({ name, ok: true, result });
  } catch (error) {
    checks.push({ name, ok: false, result: errorMessage(error) });
  }
}

async function portOpen(host: string, port: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const socket = net.createConnection({ host, port, timeout: 5000 });
    socket.once("connect", () => {
      socket.destroy();
      resolve("open");
    });
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error("timeout"));
    });
    socket.once("error", reject);
  });
}

await check("A record", async () => (await dns.resolve4(hostname)).join(", "));
await check("AAAA record", async () => {
  const records = await dns.resolve6(hostname);
  return records.length ? records.join(", ") : "not set";
});
await check("MX record", async () => JSON.stringify(await dns.resolveMx(domain)));
await check("SPF TXT", async () => (await dns.resolveTxt(domain)).flat().find((value) => value.startsWith("v=spf1")) || "missing");
await check("DMARC TXT", async () => (await dns.resolveTxt(`_dmarc.${domain}`)).flat().find((value) => value.startsWith("v=DMARC1")) || "missing");
await check("Reverse DNS/PTR", async () => {
  const [ip] = await dns.resolve4(hostname);
  return `${ip} -> ${(await dns.reverse(ip)).join(", ")}`;
});
await check("TLS certificate", async () => {
  const socket = tls.connect({ host: hostname, port: 443, servername: hostname, timeout: 7000 });
  return await new Promise<string>((resolve, reject) => {
    socket.once("secureConnect", () => {
      const cert = socket.getPeerCertificate();
      socket.destroy();
      resolve(`${cert.subject?.CN || "unknown"} expires ${cert.valid_to}`);
    });
    socket.once("error", reject);
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error("timeout"));
    });
  });
});

for (const port of ports) {
  await check(`Port ${port}`, () => portOpen(hostname, port));
}

for (const item of checks) {
  console.log(`${item.ok ? "PASS" : "FAIL"} ${item.name}: ${item.result}`);
}

if (checks.some((item) => !item.ok)) {
  process.exitCode = 1;
}


