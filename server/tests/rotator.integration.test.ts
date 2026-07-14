import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

    const seededDb = JSON.parse(await readFile(dbPath, "utf8"));
    seededDb.mailboxes["owner@example.com"] = {
      id: "owner",
      local: "owner",
      domain: "example.com",
      email: "owner@example.com",
      displayName: "Owner",
      kind: "permanent",
      status: "dry-run",
      quotaMb: 1024,
      outboundDailyLimit: 50,
      passwordHash: "unused",
      createdAt: new Date().toISOString(),
      webmailUrl: "https://mail.example.com/webmail/",
      aliases: [],
      aliasLimit: 5,
      forwardingEnabled: false,
      forwardTo: [],
      providerResult: { provider: "dry-run" }
    };
    await writeFile(dbPath, JSON.stringify(seededDb, null, 2));

    const updatedAliasLimit = await request(baseUrl, "/api/admin/mailboxes/owner%40example.com/alias-limit", {
      method: "PATCH",
      headers: { "x-admin-token": adminToken },
      body: JSON.stringify({ aliasLimit: 12 })
    });
    assert.equal(updatedAliasLimit.response.status, 200);
    assert.equal(updatedAliasLimit.payload.mailbox.aliasLimit, 12);

    const adminSummary = await request(baseUrl, "/api/admin/summary", {
      headers: { "x-admin-token": adminToken }
    });
    assert.equal(adminSummary.response.status, 200);
    assert.equal(adminSummary.payload.mailboxes.find((mailbox: any) => mailbox.email === "owner@example.com").aliasLimit, 12);

    const missingAlias = await request(baseUrl, "/api/rotator/aliases/lookup?hostname=www.amazon.co.uk", {
      headers: deviceHeaders
    });
    assert.equal(missingAlias.response.status, 404);
    assert.equal(missingAlias.payload.domain, "amazon.co.uk");
    assert.match(missingAlias.payload.suggestedAlias, /^amazon@/);
    const expectedAmazonAlias = missingAlias.payload.suggestedAlias;

    const createdAlias = await request(baseUrl, "/api/rotator/aliases", {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({ hostname: "smile.amazon.co.uk" })
    });
    assert.equal(createdAlias.response.status, 201);
    assert.equal(createdAlias.payload.domain, "amazon.co.uk");
    assert.equal(createdAlias.payload.alias, expectedAmazonAlias);

    const foundAlias = await request(baseUrl, "/api/rotator/aliases/lookup?hostname=www.amazon.co.uk", {
      headers: deviceHeaders
    });
    assert.equal(foundAlias.response.status, 200);
    assert.equal(foundAlias.payload.alias, expectedAmazonAlias);

    const listedAliases = await request(baseUrl, "/api/rotator/aliases", {
      headers: deviceHeaders
    });
    assert.equal(listedAliases.response.status, 200);
    assert.equal(listedAliases.payload.mappings.length, 1);

    const removedAliasMapping = await request(baseUrl, `/api/rotator/aliases/${listedAliases.payload.mappings[0].id}`, {
      method: "DELETE",
      headers: deviceHeaders
    });
    assert.equal(removedAliasMapping.response.status, 200);

    const lookupAfterRemoval = await request(baseUrl, "/api/rotator/aliases/lookup?domain=amazon.co.uk", {
      headers: deviceHeaders
    });
    assert.equal(lookupAfterRemoval.response.status, 404);

    const dbAfterMappingRemoval = JSON.parse(await readFile(dbPath, "utf8"));
    assert.equal(dbAfterMappingRemoval.mailboxes["owner@example.com"].aliases.length, 1);
    assert.equal(dbAfterMappingRemoval.mailboxes["owner@example.com"].aliases[0].email, expectedAmazonAlias);

    const tooLargeJob = await request(baseUrl, "/api/rotator/onboarding/jobs", {
      method: "POST",
      headers: { "x-admin-token": adminToken },
      body: JSON.stringify(Array.from({ length: 11 }, (_, index) => ({ email: `bulk${index}@example.com` })))
    });
    assert.equal(tooLargeJob.response.status, 400);

    const deniedImapTest = await request(baseUrl, "/api/rotator/onboarding/imap-test?email=bulk-zenvy@example.com");
    assert.equal(deniedImapTest.response.status, 401);

    const invalidImapTest = await request(baseUrl, "/api/rotator/onboarding/imap-test?email=not-an-email", {
      headers: { "x-admin-token": adminToken }
    });
    assert.equal(invalidImapTest.response.status, 400);

    const createdJob = await request(baseUrl, "/api/rotator/onboarding/jobs", {
      method: "POST",
      headers: { "x-admin-token": adminToken },
      body: JSON.stringify([
        { email: "bulk-zenvy@example.com", label: "bulk-1" },
        { email: "bulk-outlook@outlook.com", password: "secret-password", label: "bulk-2" }
      ])
    });
    assert.equal(createdJob.response.status, 201);
    assert.equal(createdJob.payload.job.items.length, 2);
    assert.equal(createdJob.payload.job.items[1].hasPassword, true);
    assert.equal(createdJob.payload.job.items[1].password, undefined);

    const rawDbWithCredentials = await readFile(dbPath, "utf8");
    assert.equal(rawDbWithCredentials.includes("secret-password"), false);

    const claimedItem = await request(baseUrl, `/api/rotator/onboarding/jobs/${createdJob.payload.job.id}/next`, {
      headers: deviceHeaders
    });
    assert.equal(claimedItem.response.status, 200);
    assert.equal(claimedItem.payload.item.email, "bulk-zenvy@example.com");
    assert.equal(claimedItem.payload.item.password, "");
    assert.equal(claimedItem.payload.job.items[0].status, "logging_in");

    const completedItem = await request(baseUrl, `/api/rotator/onboarding/jobs/${createdJob.payload.job.id}/items/${claimedItem.payload.item.id}/result`, {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({ status: "saved" })
    });
    assert.equal(completedItem.response.status, 200);
    assert.equal(completedItem.payload.item.status, "saved");
    const rawDbAfterResult = JSON.parse(await readFile(dbPath, "utf8"));
    assert.equal(rawDbAfterResult.rotatorOnboardingCredentials[`${createdJob.payload.job.id}:${claimedItem.payload.item.id}`], undefined);

    const secondClaimedItem = await request(baseUrl, `/api/rotator/onboarding/jobs/${createdJob.payload.job.id}/next`, {
      headers: deviceHeaders
    });
    assert.equal(secondClaimedItem.response.status, 200);
    const manualItem = await request(baseUrl, `/api/rotator/onboarding/jobs/${createdJob.payload.job.id}/items/${secondClaimedItem.payload.item.id}/result`, {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({
        status: "needs_manual",
        errorReason: "unknown_error",
        errorDetail: "Zenvy onboarding IMAP master credentials are not configured."
      })
    });
    assert.equal(manualItem.response.status, 200);
    assert.equal(manualItem.payload.item.errorDetail, "Zenvy onboarding IMAP master credentials are not configured.");

    const listedAccounts = await request(baseUrl, "/api/rotator/accounts", {
      headers: deviceHeaders
    });
    assert.equal(listedAccounts.response.status, 200);
    assert.equal(listedAccounts.payload.accounts.length, 3);

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
    const sessionFetchAudit = audit.payload.audit.find((entry: any) => entry.event === "session_fetched");
    const credentialClaimAudit = audit.payload.audit.find((entry: any) => entry.event === "onboarding_credential_claimed");
    assert.equal(sessionFetchAudit.accountId, accountId);
    assert.equal(credentialClaimAudit.jobId, createdJob.payload.job.id);

    const removedJob = await request(baseUrl, `/api/rotator/onboarding/jobs/${createdJob.payload.job.id}`, {
      method: "DELETE",
      headers: { "x-admin-token": adminToken }
    });
    assert.equal(removedJob.response.status, 200);
    assert.equal(removedJob.payload.deleted, true);

    const jobsAfterRemove = await request(baseUrl, "/api/rotator/onboarding/jobs", {
      headers: { "x-admin-token": adminToken }
    });
    assert.equal(jobsAfterRemove.response.status, 200);
    assert.equal(jobsAfterRemove.payload.jobs.some((job: any) => job.id === createdJob.payload.job.id), false);

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
