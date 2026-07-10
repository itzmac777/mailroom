# Portal API

All API responses are JSON.

## `POST /api/invites/claim`

Checks whether an invite is usable.

Request:

```json
{ "inviteCode": "ABC123" }
```

## `GET /api/mailboxes/check?local=example`

Checks local-part validation and local portal availability.

## `POST /api/mailboxes`

Creates a mailbox after invite, captcha, username, and password validation.

Request:

```json
{
  "inviteCode": "ABC123",
  "displayName": "Example User",
  "local": "example",
  "password": "StrongPassword123",
  "captcha": {
    "id": "captcha-id",
    "token": "captcha-token",
    "answer": "14"
  }
}
```

The Mailu API token is used only by the server.

## `GET /api/me/mailbox`

Returns the signed-in user's mailbox metadata.

## `POST /api/admin/invites`

Requires `x-admin-token`.

Request:

```json
{
  "note": "first beta",
  "maxUses": 1,
  "expiresInDays": 30
}
```

## Rotator API

Rotator admin endpoints require `x-admin-token`. Device endpoints require
`Authorization: Bearer <device-token>`.

Session snapshots are encrypted at rest with `ROTATOR_SESSION_KEY` and are
never returned from metadata endpoints.

### `POST /api/rotator/devices`

Admin-only. Registers a device and returns its bearer token once.

```json
{ "name": "work laptop" }
```

### `GET /api/rotator/devices`

Admin-only. Lists registered devices without token values.

### `DELETE /api/rotator/devices/:id`

Admin-only. Revokes a device immediately.

### `GET /api/rotator/accounts`

Admin or device token. Lists account metadata only.

### `POST /api/rotator/accounts`

Admin-only.

```json
{ "label": "acct-1", "email": "person@example.com" }
```

### `PATCH /api/rotator/accounts/:id`

Admin-only. Updates `label` and/or `email`.

### `DELETE /api/rotator/accounts/:id`

Admin-only. Deletes the account metadata and any saved session snapshot.

### `POST /api/rotator/accounts/:id/session`

Device-token only. Uploads/replaces the encrypted session snapshot. Body must
be the captured cookie array.

### `GET /api/rotator/accounts/:id/session`

Device-token only. Fetches the decrypted session snapshot and records a
rotator audit entry. Rate-limited per device.

### `POST /api/rotator/accounts/:id/mark-status`

Device-token only.

```json
{ "status": "active" }
```

### `GET /api/rotator/audit`

Admin-only. Returns recent session-fetch audit entries.

### `POST /api/rotator/onboarding/jobs`

Admin-only. Creates a bulk onboarding job with up to 10 items. Passwords are
encrypted immediately and never returned.

```json
{
  "items": [
    { "email": "acct@zenvy.com.bd", "label": "acct-1" },
    { "email": "acct@outlook.com", "password": "inbox-password", "label": "acct-2" }
  ]
}
```

### `GET /api/rotator/onboarding/jobs`

Admin or device token. Lists onboarding jobs and item progress without
credential payloads.

### `GET /api/rotator/onboarding/jobs/:id`

Admin or device token. Returns one onboarding job without credential payloads.

### `GET /api/rotator/onboarding/jobs/:id/next`

Device-token only. Atomically claims the next queued item, audits the credential
read, and returns the decrypted item to the extension runner. Rate-limited per
device.

### `GET /api/rotator/onboarding/jobs/:id/items/:itemId/otp`

Device-token only. Fetches the latest OpenAI verification code for the claimed
item. Local domain mailboxes use the rotator IMAP master credentials; external
mailboxes use the existing temp-inbox fetch path.

### `GET /api/rotator/onboarding/imap-test?email=:email`

Admin-only. Tests local-domain IMAP access for one onboarding mailbox without
returning passwords, message bodies, or raw OTPs. The response includes the
configured auth format, common Dovecot master-user format attempts, the computed
IMAP usernames, auth/status success or sanitized failures, and whether an OpenAI
verification message was found.

### `POST /api/rotator/onboarding/jobs/:id/items/:itemId/result`

Device-token only. Marks a claimed item `saved`, `failed`, or `needs_manual`.
The stored credential for that item is purged regardless of result.

### `DELETE /api/rotator/onboarding/jobs/:id`

Admin-only. Cancels a job and immediately purges remaining credentials.
