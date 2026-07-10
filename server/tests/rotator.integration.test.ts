import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

async function request(baseUrl: string, pathname: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...(init.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

test("rotator device, account, session, audit, and revocation flow", async () => {
  const port = 46100 + Math.floor(Math.random() * 1000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "mailroom-rotator-"));
  const dbPath = path.join(dataDir, "db.json");
  const adminToken = "admin-token-that-is-long-enough";

  process.env.PORT = String(port);
  process.env.CLIENT_ORIGIN = "http://localhost:3000";
  process.env.DATA_DIR = dataDir;
  process.env.DATABASE_URL = `file:${dbPath}`;
  process.env.APP_SECRET = "app-secret-that-is-long-enough-for-tests";
  process.env.ADMIN_TOKEN = adminToken;
  process.env.ROTATOR_SESSION_KEY = "rotator-session-key-that-is-long-enough";
  process.env.MAILU_DRY_RUN = "true";
  process.env.TEMP_MAIL_ENABLED = "false";
  process.env.MAILROOM_NO_LISTEN = "true";

  const { handle } = await import("../src/server.ts");
  const server = createServer(handle) as Server;
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));

  try {
    const createdDevice = await request(baseUrl, "/api/rotator/devices", {
      method: "POST",
      headers: { "x-admin-token": adminToken },
      body: JSON.stringify({ name: "work laptop" })
    });
    assert.equal(createdDevice.response.status, 201);
    assert.equal(createdDevice.payload.device.name, "work laptop");
    assert.ok(createdDevice.payload.token);

    const listedDevices = await request(baseUrl, "/api/rotator/devices", {
      headers: { "x-admin-token": adminToken }
    });
    assert.equal(listedDevices.response.status, 200);
    assert.equal(listedDevices.payload.devices.length, 1);
    assert.equal(listedDevices.payload.devices[0].tokenHash, undefined);

    const createdAccount = await request(baseUrl, "/api/rotator/accounts", {
      method: "POST",
      headers: { "x-admin-token": adminToken },
      body: JSON.stringify({ label: "acct-1", email: "acct1@example.com" })
    });
    assert.equal(createdAccount.response.status, 201);
    assert.equal(createdAccount.payload.account.hasSession, false);

    const accountId = createdAccount.payload.account.id;
    const deviceToken = createdDevice.payload.token;
    const deviceHeaders = { authorization: `Bearer ${deviceToken}` };

    const listedAccounts = await request(baseUrl, "/api/rotator/accounts", {
      headers: deviceHeaders
    });
    assert.equal(listedAccounts.response.status, 200);
    assert.equal(listedAccounts.payload.accounts.length, 1);

    const cookieSnapshot = [
      {
        name: "session",
        value: "sensitive-cookie-value",
        domain: ".openai.com",
        path: "/",
        secure: true,
        httpOnly: true
      }
    ];
    const uploadedSession = await request(baseUrl, `/api/rotator/accounts/${accountId}/session`, {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify(cookieSnapshot)
    });
    assert.equal(uploadedSession.response.status, 200);
    assert.equal(uploadedSession.payload.account.hasSession, true);

    const rawDb = await readFile(dbPath, "utf8");
    assert.equal(rawDb.includes("sensitive-cookie-value"), false);

    const fetchedSession = await request(baseUrl, `/api/rotator/accounts/${accountId}/session`, {
      headers: deviceHeaders
    });
    assert.equal(fetchedSession.response.status, 200);
    assert.deepEqual(fetchedSession.payload.session, cookieSnapshot);

    const markedStatus = await request(baseUrl, `/api/rotator/accounts/${accountId}/mark-status`, {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({ status: "active" })
    });
    assert.equal(markedStatus.response.status, 200);
    assert.equal(markedStatus.payload.account.status, "active");
    assert.ok(markedStatus.payload.account.lastVerifiedAt);

    const audit = await request(baseUrl, "/api/rotator/audit", {
      headers: { "x-admin-token": adminToken }
    });
    assert.equal(audit.response.status, 200);
    assert.equal(audit.payload.audit.length, 1);
    assert.equal(audit.payload.audit[0].event, "session_fetched");
    assert.equal(audit.payload.audit[0].accountId, accountId);

    const updatedAccount = await request(baseUrl, `/api/rotator/accounts/${accountId}`, {
      method: "PATCH",
      headers: { "x-admin-token": adminToken },
      body: JSON.stringify({ label: "acct-renamed" })
    });
    assert.equal(updatedAccount.response.status, 200);
    assert.equal(updatedAccount.payload.account.label, "acct-renamed");

    const revokedDevice = await request(baseUrl, `/api/rotator/devices/${createdDevice.payload.device.id}`, {
      method: "DELETE",
      headers: { "x-admin-token": adminToken }
    });
    assert.equal(revokedDevice.response.status, 200);

    const rejectedAfterRevoke = await request(baseUrl, "/api/rotator/accounts", {
      headers: deviceHeaders
    });
    assert.equal(rejectedAfterRevoke.response.status, 401);

    const deletedAccount = await request(baseUrl, `/api/rotator/accounts/${accountId}`, {
      method: "DELETE",
      headers: { "x-admin-token": adminToken }
    });
    assert.equal(deletedAccount.response.status, 200);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dataDir, { recursive: true, force: true });
  }
});
