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
