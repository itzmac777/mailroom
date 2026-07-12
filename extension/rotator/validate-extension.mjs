import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
const styles = await readFile(path.join(root, "styles.css"), "utf8");

assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.action.default_popup, "popup.html");
assert.equal(manifest.options_page, "options.html");
assert.equal(manifest.background.service_worker, "background-entry.js");
assert.ok(manifest.permissions.includes("cookies"));
assert.ok(manifest.permissions.includes("storage"));
assert.ok(manifest.permissions.includes("tabs"));
assert.ok(manifest.host_permissions.includes("https://chatgpt.com/*"));
assert.ok(manifest.host_permissions.includes("https://*.openai.com/*"));
assert.ok(manifest.optional_host_permissions.includes("https://*/*"));
assert.ok(manifest.content_scripts.some((script) => script.matches.includes("https://*/*")));
assert.ok(manifest.content_scripts.some((script) => script.js.includes("shared.js") && script.js.includes("content-script.js")));
assert.ok(manifest.web_accessible_resources.some((resource) => resource.resources.includes("fonts/dm-sans-latin-700-normal.woff2")));
assert.match(styles, /font-family: "DM Sans"/);
assert.match(styles, /fonts\/dm-sans-latin-400-normal\.woff2/);
assert.match(styles, /html,\s*body,\s*button,\s*input,\s*select/);
await Promise.all(
  [400, 500, 600, 700, 800].map((weight) =>
    access(path.join(root, "fonts", `dm-sans-latin-${weight}-normal.woff2`))
  )
);

const shared = await readFile(path.join(root, "shared.js"), "utf8");
assert.match(shared, /chrome\.storage\.local/);
assert.match(shared, /chrome\.cookies\.getAll/);
assert.match(shared, /chrome\.cookies\.set/);
assert.match(shared, /Mailroom \${response\.status}/);
assert.match(shared, /Mailroom network error/);
assert.match(shared, /hostOnly: Boolean\(cookie\.hostOnly\)/);
assert.match(shared, /cookie\.domain && !cookie\.hostOnly/);
assert.match(shared, /backend-api\/me/);

const popup = await readFile(path.join(root, "popup.js"), "utf8");
assert.match(popup, /\/api\/rotator\/accounts/);
assert.match(popup, /\/api\/rotator\/onboarding\/jobs/);
assert.match(popup, /\/api\/rotator\/aliases/);
assert.match(popup, /\/session/);
assert.match(popup, /mark-status/);

const background = await readFile(path.join(root, "background.js"), "utf8");
assert.match(background, /\/api\/rotator\/onboarding\/jobs/);
assert.match(background, /\/next/);
assert.match(background, /\/otp/);
assert.match(background, /captcha_encountered/);
assert.match(background, /reachedOtpPage/);
assert.match(background, /needs manual finish/);
assert.match(background, /errorDetail/);
assert.match(background, /mailroomFetch/);
assert.match(background, /openVerificationLink/);

const contentScript = await readFile(path.join(root, "content-script.js"), "utf8");
assert.match(contentScript, /rotatorSubmitEmail/);
assert.match(contentScript, /rotatorSubmitOtp/);
assert.match(contentScript, /providerButton/);
assert.match(contentScript, /continue with/);
assert.match(contentScript, /safe_submit_not_found/);
assert.match(contentScript, /inboxVerificationPage/);
assert.match(contentScript, /check your inbox/);
assert.match(contentScript, /aliases\/lookup/);
assert.match(contentScript, /aliases\/action/);
assert.match(contentScript, /assistantFetch/);
assert.match(contentScript, /likelyEmailInput/);
assert.match(contentScript, /placeholder/);
assert.match(contentScript, /Waiting for code/);
assert.match(contentScript, /activation link/);
assert.match(contentScript, /openVerificationLink/);
assert.match(contentScript, /window\.top === window\.self/);
assert.match(contentScript, /Mailroom DM Sans/);
assert.match(contentScript, /chrome\.runtime\.getURL\("fonts\/dm-sans-latin-700-normal\.woff2"\)/);

console.log("Extension manifest and rotator flows look valid.");
