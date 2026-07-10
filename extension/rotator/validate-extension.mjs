import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));

assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.action.default_popup, "popup.html");
assert.equal(manifest.options_page, "options.html");
assert.ok(manifest.permissions.includes("cookies"));
assert.ok(manifest.permissions.includes("storage"));
assert.ok(manifest.permissions.includes("tabs"));
assert.ok(manifest.host_permissions.includes("https://chatgpt.com/*"));
assert.ok(manifest.host_permissions.includes("https://*.openai.com/*"));
assert.ok(manifest.optional_host_permissions.includes("https://*/*"));

const shared = await readFile(path.join(root, "shared.js"), "utf8");
assert.match(shared, /chrome\.storage\.local/);
assert.match(shared, /chrome\.cookies\.getAll/);
assert.match(shared, /chrome\.cookies\.set/);
assert.match(shared, /hostOnly: Boolean\(cookie\.hostOnly\)/);
assert.match(shared, /cookie\.domain && !cookie\.hostOnly/);
assert.match(shared, /backend-api\/me/);

const popup = await readFile(path.join(root, "popup.js"), "utf8");
assert.match(popup, /\/api\/rotator\/accounts/);
assert.match(popup, /\/session/);
assert.match(popup, /mark-status/);

console.log("Extension manifest and rotator flows look valid.");
