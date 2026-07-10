# ChatGPT Rotator Extension

The extension is the only Mailroom component that reads or writes ChatGPT/OpenAI
browser cookies. The dashboard creates metadata and device tokens; the extension
saves and activates sessions.

## Install

1. Open Chrome or a Chromium browser.
2. Visit `chrome://extensions`.
3. Enable Developer mode.
4. Choose "Load unpacked".
5. Select `extension/rotator`.

## Setup

1. Open Mailroom `/admin/rotator`.
2. Issue a device token for the current computer.
3. Open the extension options page.
4. Enter the Mailroom backend URL, for example `https://portal.example.com`.
5. Paste the device token and save.

The extension asks Chrome for permission to call that backend origin. The token
is stored in `chrome.storage.local` and is never exposed to normal web pages.

## Save A Session

1. Log in to ChatGPT normally in the browser.
2. Open the Mailroom Rotator extension popup.
3. Select the account identity.
4. Click "Save this session".

The extension reads relevant `chatgpt.com` and `openai.com` cookies and uploads
them to Mailroom. Mailroom encrypts the snapshot at rest with
`ROTATOR_SESSION_KEY`.

## Activate On Another Device

1. Install the extension on the second device.
2. Paste a valid device token from `/admin/rotator`.
3. Click "Activate" for the desired identity.

The extension fetches the saved session, clears existing ChatGPT/OpenAI cookies,
writes the saved cookies, opens ChatGPT, and reports `active` or
`needs_relogin` back to Mailroom.

Saved sessions can expire or be invalidated by ChatGPT. If activation reports
`needs_relogin`, log in again manually on one device and save a fresh session.

If activation says a saved cookie is missing its domain, reload the updated
extension, log in manually once, and save that account's session again.
