function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function visible(element) {
  if (!element) return false;
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0;
}

function findInput(selectors) {
  for (const selector of selectors) {
    const input = Array.from(document.querySelectorAll(selector)).find(visible);
    if (input) return input;
  }
  return null;
}

function setValue(input, value) {
  input.focus();
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function controlText(control) {
  return String(control?.innerText || control?.textContent || control?.value || control?.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function providerButton(control) {
  return /\b(google|apple|microsoft|github|sso|phone)\b|continue with/.test(controlText(control));
}

function submitButtonText(control) {
  return /^(continue|next|log in|login|sign in|submit|verify)$/.test(controlText(control));
}

function enabledButton(control) {
  return visible(control) && !control.disabled && control.getAttribute("aria-disabled") !== "true";
}

function overlapsHorizontally(a, b) {
  return Math.min(a.right, b.right) - Math.max(a.left, b.left) > Math.min(a.width, b.width) * 0.35;
}

function findSubmitButtonFor(input) {
  const form = input.closest("form");
  const inputBox = input.getBoundingClientRect();
  const candidates = Array.from(document.querySelectorAll('button, input[type="submit"]'))
    .filter(enabledButton)
    .filter((button) => !providerButton(button))
    .filter((button) => {
      const box = button.getBoundingClientRect();
      const sameForm = form && button.closest("form") === form;
      const nearbyBelow = box.top >= inputBox.bottom - 8 && box.top <= inputBox.bottom + 160 && overlapsHorizontally(inputBox, box);
      return (sameForm || nearbyBelow) && (submitButtonText(button) || button.type === "submit" || nearbyBelow);
    })
    .sort((a, b) => {
      const aBox = a.getBoundingClientRect();
      const bBox = b.getBoundingClientRect();
      const aDistance = Math.abs(aBox.top - inputBox.bottom);
      const bDistance = Math.abs(bBox.top - inputBox.bottom);
      return aDistance - bDistance;
    });
  return candidates[0] || null;
}

function clickSubmitNear(input) {
  const button = findSubmitButtonFor(input);
  if (button) {
    button.click();
    return true;
  }
  const form = input.closest("form");
  if (form && !Array.from(form.querySelectorAll("button, input[type='submit']")).some(providerButton)) {
    form.requestSubmit();
    return true;
  }
  return false;
}

function pageText() {
  return document.body?.innerText?.toLowerCase() || "";
}

function captchaVisible() {
  const text = pageText();
  if (text.includes("captcha") || text.includes("verify you are human")) return true;
  return Array.from(document.querySelectorAll("iframe")).some((frame) => /captcha|hcaptcha|turnstile/i.test(frame.src || ""));
}

function wrongPasswordVisible() {
  return /wrong password|incorrect password|invalid password/.test(pageText());
}

function inboxVerificationPage() {
  const text = pageText();
  return text.includes("check your inbox") || text.includes("enter the verification code") || /\bcode\b/.test(text) && text.includes("resend email");
}

async function waitFor(predicate, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (captchaVisible()) return { status: "captcha" };
    const value = predicate();
    if (value) return { status: "ok", value };
    if (wrongPasswordVisible()) return { status: "wrong_password" };
    await wait(500);
  }
  return { status: "timeout" };
}

function emailInput() {
  return findInput([
    'input[type="email"]',
    'input[name="username"]',
    'input[autocomplete="username"]',
    'input[name="email"]'
  ]);
}

function passwordInput() {
  if (inboxVerificationPage()) return null;
  return findInput([
    'input[type="password"]',
    'input[name="password"]',
    'input[autocomplete="current-password"]'
  ]);
}

function visibleTextEntryInputs() {
  return Array.from(document.querySelectorAll("input"))
    .filter(visible)
    .filter((input) => !input.disabled && input.getAttribute("aria-disabled") !== "true")
    .filter((input) => !["button", "checkbox", "hidden", "radio", "reset", "submit"].includes(String(input.type || "").toLowerCase()));
}

function otpInputs() {
  const one = findInput([
    'input[autocomplete="one-time-code"]',
    'input[inputmode="numeric"]',
    'input[name*="code" i]',
    'input[id*="code" i]',
    'input[aria-label*="code" i]',
    'input[placeholder*="code" i]'
  ]);
  if (one) return [one];
  if (inboxVerificationPage()) {
    const entries = visibleTextEntryInputs();
    if (entries.length === 1) return [entries[0]];
    const focused = entries.find((input) => input === document.activeElement);
    if (focused) return [focused];
  }
  const boxes = Array.from(document.querySelectorAll('input[maxlength="1"], input[aria-label*="code" i]')).filter(visible);
  return boxes.length >= 4 ? boxes : [];
}

async function submitEmail(email) {
  const found = await waitFor(emailInput, 30000);
  if (found.status !== "ok") return found;
  setValue(found.value, email);
  if (!clickSubmitNear(found.value)) return { status: "unexpected_page", reason: "safe_submit_not_found" };
  await wait(1200);
  return { status: "ok" };
}

async function submitPassword(password) {
  const found = await waitFor(passwordInput, 20000);
  if (found.status !== "ok") return found;
  setValue(found.value, password);
  if (!clickSubmitNear(found.value)) return { status: "unexpected_page", reason: "safe_submit_not_found" };
  await wait(1600);
  if (wrongPasswordVisible()) return { status: "wrong_password" };
  return { status: "ok" };
}

async function waitForOtp() {
  const found = await waitFor(() => {
    const codes = otpInputs();
    if (codes.length) return codes;
    if (passwordInput()) return "password_required";
    return null;
  }, 60000);
  if (found.status !== "ok") return found;
  if (found.value === "password_required") return { status: "password_required" };
  return { status: "ok" };
}

async function submitOtp(code) {
  const found = await waitFor(() => {
    const codes = otpInputs();
    return codes.length ? codes : null;
  }, 15000);
  if (found.status !== "ok") return found;
  const inputs = found.value;
  if (inputs.length === 1) {
    setValue(inputs[0], code);
    if (!clickSubmitNear(inputs[0])) return { status: "unexpected_page", reason: "safe_submit_not_found" };
  } else {
    [...String(code)].forEach((char, index) => {
      if (inputs[index]) setValue(inputs[index], char);
    });
    if (!clickSubmitNear(inputs[inputs.length - 1])) return { status: "unexpected_page", reason: "safe_submit_not_found" };
  }
  await wait(4000);
  return { status: "ok" };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message?.type === "rotatorSubmitEmail") return submitEmail(message.email);
    if (message?.type === "rotatorSubmitPassword") return submitPassword(message.password);
    if (message?.type === "rotatorWaitForOtp") return waitForOtp();
    if (message?.type === "rotatorSubmitOtp") return submitOtp(message.code);
    return { status: "ignored" };
  })().then(sendResponse).catch((error) => {
    sendResponse({ status: "error", reason: error instanceof Error ? error.message : "unknown_error" });
  });
  return true;
});

const MAILROOM_ASSISTANT_CLASS = "mailroom-assist-chip";
const MAILROOM_DISMISS_CLASS = "mailroom-assist-dismiss";
const assistantChips = new Map();
const pageChips = new Map();
const otpPolls = new WeakMap();
let verificationLinkPoll = null;
let aliasLookupPromise = null;
let publicConfigPromise = null;

async function assistantFetch(path, options = {}) {
  const response = await chrome.runtime.sendMessage({ type: "mailroomFetch", path, options });
  if (response?.ok) return response.payload;
  const error = new Error(response?.message || "Mailroom request failed.");
  error.status = response?.status;
  error.payload = response?.payload;
  throw error;
}

function installAssistantStyles() {
  if (document.getElementById("mailroom-assist-styles")) return;
  const style = document.createElement("style");
  style.id = "mailroom-assist-styles";
  const dmSansBoldUrl = chrome.runtime.getURL("fonts/dm-sans-latin-700-normal.woff2");
  style.textContent = `
    @font-face {
      font-family: "Mailroom DM Sans";
      font-style: normal;
      font-weight: 700;
      font-display: swap;
      src: url("${dmSansBoldUrl}") format("woff2");
    }

    .${MAILROOM_ASSISTANT_CLASS} {
      position: absolute;
      z-index: 2147483647;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      max-width: min(360px, calc(100vw - 20px));
      min-height: 30px;
      border: 1px solid #c9cbd8;
      background: #ffffff;
      color: #111111;
      box-shadow: 0 6px 22px rgba(15, 23, 42, 0.16);
      padding: 4px 6px 4px 10px;
      font: 700 12px/1.25 "Mailroom DM Sans", "DM Sans", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .${MAILROOM_ASSISTANT_CLASS} button {
      all: unset;
      box-sizing: border-box;
      cursor: pointer;
      color: inherit;
    }
    .${MAILROOM_ASSISTANT_CLASS} [data-mailroom-action] {
      overflow-wrap: anywhere;
    }
    .${MAILROOM_ASSISTANT_CLASS} .${MAILROOM_DISMISS_CLASS} {
      display: grid;
      place-items: center;
      width: 20px;
      height: 20px;
      border-left: 1px solid #e4e6ef;
      color: #5f6368;
      font-size: 16px;
      line-height: 1;
    }
    .${MAILROOM_ASSISTANT_CLASS}[data-floating="true"] {
      position: fixed;
      top: 76px;
      right: 18px;
    }
  `;
  document.documentElement.append(style);
}

function assistantEligibleFrame() {
  return window.top === window.self;
}

function inputAvailable(input) {
  return input instanceof HTMLInputElement && visible(input) && !input.disabled && !input.readOnly && input.getAttribute("aria-disabled") !== "true";
}

function fieldHasValue(input) {
  return String(input.value || "").trim().length > 0;
}

function backendLookupForPage() {
  if (!aliasLookupPromise) {
    aliasLookupPromise = assistantFetch(`/api/rotator/aliases/lookup?hostname=${encodeURIComponent(location.hostname)}`)
      .then((result) => ({
        mode: "use",
        alias: result.alias,
        domain: result.domain
      }))
      .catch((error) => {
        if (error?.status === 404 && error.payload?.domain) {
          return {
            mode: "create",
            alias: error.payload.suggestedAlias || "",
            domain: error.payload.domain
          };
        }
        throw error;
      });
  }
  return aliasLookupPromise;
}

function backendConfig() {
  if (!publicConfigPromise) {
    publicConfigPromise = assistantFetch("/api/public-config").catch(() => ({ mailDomain: "zenvy.com.bd" }));
  }
  return publicConfigPromise;
}

function positionChip(input, chip) {
  if (!document.documentElement.contains(input)) {
    chip.remove();
    assistantChips.delete(input);
    return;
  }
  const box = input.getBoundingClientRect();
  chip.style.top = `${Math.max(8, window.scrollY + box.bottom + 6)}px`;
  chip.style.left = `${Math.max(8, Math.min(window.scrollX + box.left, window.scrollX + document.documentElement.clientWidth - chip.offsetWidth - 8))}px`;
}

function removeChip(input) {
  const chip = assistantChips.get(input);
  if (chip) chip.remove();
  assistantChips.delete(input);
}

function createChip(input, label, onClick) {
  removeChip(input);
  installAssistantStyles();
  const chip = document.createElement("span");
  chip.className = MAILROOM_ASSISTANT_CLASS;
  chip.innerHTML = `
    <button type="button" data-mailroom-action></button>
    <button type="button" class="${MAILROOM_DISMISS_CLASS}" aria-label="Dismiss Mailroom suggestion" title="Dismiss">x</button>
  `;
  const action = chip.querySelector("[data-mailroom-action]");
  action.textContent = label;
  action.addEventListener("mousedown", (event) => event.preventDefault());
  action.addEventListener("click", () => onClick(action));
  chip.querySelector(`.${MAILROOM_DISMISS_CLASS}`).addEventListener("click", () => removeChip(input));
  document.documentElement.append(chip);
  assistantChips.set(input, chip);
  requestAnimationFrame(() => positionChip(input, chip));
  return chip;
}

function removePageChip(key) {
  const chip = pageChips.get(key);
  if (chip) chip.remove();
  pageChips.delete(key);
}

function createPageChip(key, label, onClick) {
  removePageChip(key);
  installAssistantStyles();
  const chip = document.createElement("span");
  chip.className = MAILROOM_ASSISTANT_CLASS;
  chip.dataset.floating = "true";
  chip.innerHTML = `
    <button type="button" data-mailroom-action></button>
    <button type="button" class="${MAILROOM_DISMISS_CLASS}" aria-label="Dismiss Mailroom suggestion" title="Dismiss">x</button>
  `;
  const action = chip.querySelector("[data-mailroom-action]");
  action.textContent = label;
  action.addEventListener("click", () => onClick(action));
  chip.querySelector(`.${MAILROOM_DISMISS_CLASS}`).addEventListener("click", () => removePageChip(key));
  document.documentElement.append(chip);
  pageChips.set(key, chip);
  return chip;
}

function syncChipPositions() {
  for (const [input, chip] of assistantChips.entries()) {
    positionChip(input, chip);
  }
}

function likelyEmailInput(input) {
  if (!inputAvailable(input) || fieldHasValue(input)) return false;
  const type = String(input.type || "text").toLowerCase();
  if (["button", "checkbox", "file", "hidden", "image", "password", "radio", "range", "reset", "search", "submit"].includes(type)) return false;
  if (type === "email") return true;

  const autocomplete = String(input.autocomplete || input.getAttribute("autocomplete") || "").toLowerCase();
  if (autocomplete === "email" || autocomplete === "username") return true;

  const fieldText = [
    input.name,
    input.id,
    input.getAttribute("aria-label"),
    input.getAttribute("placeholder"),
    input.getAttribute("data-testid"),
    input.getAttribute("data-uia")
  ].join(" ");
  if (/\b(e-?mail|email address|mail address|username|login id)\b/i.test(fieldText)) return true;
  if (/\b(mobile|phone)\b/i.test(fieldText) && /\b(e-?mail|email)\b/i.test(fieldText)) return true;
  return false;
}

function emailSuggestionInputs() {
  return Array.from(document.querySelectorAll("input")).filter(likelyEmailInput);
}

async function ensureEmailChip(input) {
  if (assistantChips.has(input)) return;
  let lookup;
  try {
    lookup = await backendLookupForPage();
  } catch {
    return;
  }
  if (!inputAvailable(input) || fieldHasValue(input)) return;
  const useExisting = lookup.mode === "use";
  const label = useExisting
    ? `Use ${lookup.alias}`
    : `Create ${lookup.alias || "an alias"} for this site?`;
  createChip(input, label, async (action) => {
    try {
      action.textContent = useExisting ? `Filling ${lookup.alias}...` : "Creating alias...";
      const result = useExisting
        ? lookup
        : await assistantFetch("/api/rotator/aliases", {
          method: "POST",
          body: JSON.stringify({ hostname: location.hostname })
        });
      if (result.alias) {
        setValue(input, result.alias);
        removeChip(input);
        aliasLookupPromise = Promise.resolve({ mode: "use", alias: result.alias, domain: result.domain || lookup.domain });
      }
    } catch (error) {
      action.textContent = error instanceof Error ? error.message.slice(0, 120) : "Could not fill alias.";
    }
  });
}

function textNear(input) {
  const form = input.closest("form");
  const parent = input.closest("label, div, section, main") || input.parentElement;
  return [
    input.getAttribute("aria-label"),
    input.getAttribute("placeholder"),
    input.name,
    input.id,
    form?.innerText,
    parent?.innerText
  ].join(" ").replace(/\s+/g, " ").slice(0, 1200);
}

function likelyOtpInput(input) {
  if (!inputAvailable(input) || fieldHasValue(input)) return false;
  const autocomplete = String(input.autocomplete || input.getAttribute("autocomplete") || "").toLowerCase();
  if (autocomplete === "one-time-code") return true;
  const nearby = textNear(input);
  const nearbyCodeSignal = /\b(verification code|enter code|security code|one[-\s]?time code|otp|2fa|two[-\s]?factor)\b/i.test(nearby);
  if (!nearbyCodeSignal) return false;
  const maxLength = Number(input.getAttribute("maxlength") || input.maxLength || 0);
  const numericHint = /^(tel|number)$/i.test(input.type || "") || /numeric|decimal/i.test(input.inputMode || "") || /\b(code|otp|pin)\b/i.test(`${input.name} ${input.id} ${input.placeholder}`);
  return numericHint && (!maxLength || (maxLength >= 1 && maxLength <= 8));
}

function otpSuggestionInputs() {
  return Array.from(document.querySelectorAll("input")).filter(likelyOtpInput);
}

async function visibleMailroomAliasOnPage() {
  const config = await backendConfig();
  const domains = Array.from(new Set(["zenvy.com.bd", config.mailDomain].filter(Boolean).map((item) => String(item).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
  if (!domains.length) return "";
  const pattern = new RegExp(`\\b[a-z0-9._%+-]+@(?:${domains.join("|")})\\b`, "i");
  return (document.body?.innerText || "").match(pattern)?.[0]?.toLowerCase() || "";
}

async function relevantAliasForOtp() {
  try {
    const lookup = await backendLookupForPage();
    if (lookup.mode === "use" && lookup.alias) return lookup.alias;
  } catch {
    // Fall back to visible sent-to text below.
  }
  return visibleMailroomAliasOnPage();
}

async function fetchOtpOnce(alias) {
  try {
    const result = await assistantFetch(`/api/rotator/aliases/action?alias=${encodeURIComponent(alias)}`);
    return result.code || "";
  } catch (error) {
    if (error?.status === 404) return "";
    throw error;
  }
}

function fillOtpInput(input, code) {
  const form = input.closest("form");
  const boxes = form
    ? Array.from(form.querySelectorAll('input[maxlength="1"], input[aria-label*="code" i]')).filter(inputAvailable)
    : [];
  if (boxes.length >= 4 && boxes.length <= 8 && input.maxLength === 1) {
    [...String(code)].forEach((char, index) => {
      if (boxes[index]) setValue(boxes[index], char);
    });
    removeChip(input);
    return;
  }
  setValue(input, code);
  removeChip(input);
}

async function ensureOtpChip(input) {
  if (assistantChips.has(input) || otpPolls.has(input)) return;
  const alias = await relevantAliasForOtp();
  if (!alias || !inputAvailable(input) || fieldHasValue(input)) return;
  const chip = createChip(input, `Waiting for code from ${alias}`, () => undefined);
  const action = chip.querySelector("[data-mailroom-action]");
  const poll = (async () => {
    const started = Date.now();
    while (Date.now() - started < 60000 && inputAvailable(input) && !fieldHasValue(input)) {
      try {
        const code = await fetchOtpOnce(alias);
        if (code) {
          action.textContent = `Fill code (${code}) from ${alias}`;
          action.onclick = null;
          action.addEventListener("click", () => fillOtpInput(input, code), { once: true });
          return;
        }
      } catch {
        action.textContent = "Could not fetch code.";
        return;
      }
      await wait(5000);
    }
    if (assistantChips.get(input) === chip) removeChip(input);
  })();
  otpPolls.set(input, poll);
  await poll.finally(() => otpPolls.delete(input));
}

function activationLinkPageVisible() {
  const text = (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 2500);
  if (!text) return false;
  const sentSignal = /(sent|send|emailed|delivered)/i.test(text);
  const mailboxSignal = /(check|open|follow).{0,80}(email|mailbox|inbox|message)/i.test(text) || /(email|mailbox|inbox|message).{0,80}(check|open|follow)/i.test(text);
  const linkSignal = /(activation link|activate your account|verify your email|verification link|confirm your email|follow the link|complete registration)/i.test(text);
  return sentSignal && mailboxSignal && linkSignal;
}

async function fetchVerificationActionOnce(alias) {
  try {
    return await assistantFetch(`/api/rotator/aliases/action?alias=${encodeURIComponent(alias)}`);
  } catch (error) {
    if (error?.status === 404) return null;
    throw error;
  }
}

async function openVerificationLink(url) {
  const response = await chrome.runtime.sendMessage({ type: "openVerificationLink", url });
  if (!response?.ok) throw new Error(response?.message || "Could not open link.");
}

async function ensureVerificationLinkChip() {
  if (verificationLinkPoll || pageChips.has("verification-link") || !activationLinkPageVisible()) return;
  const alias = await relevantAliasForOtp();
  if (!alias) return;
  const chip = createPageChip("verification-link", `Waiting for activation link from ${alias}`, () => undefined);
  const action = chip.querySelector("[data-mailroom-action]");
  verificationLinkPoll = (async () => {
    const started = Date.now();
    while (Date.now() - started < 90000 && activationLinkPageVisible()) {
      try {
        const result = await fetchVerificationActionOnce(alias);
        if (result?.link) {
          action.textContent = `Open activation link from ${alias}`;
          action.onclick = null;
          action.addEventListener("click", async () => {
            try {
              action.textContent = "Opening activation link...";
              await openVerificationLink(result.link);
              removePageChip("verification-link");
            } catch (error) {
              action.textContent = error instanceof Error ? error.message.slice(0, 120) : "Could not open link.";
            }
          }, { once: true });
          return;
        }
      } catch {
        action.textContent = "Could not fetch activation link.";
        return;
      }
      await wait(5000);
    }
    if (pageChips.get("verification-link") === chip) removePageChip("verification-link");
  })();
  await verificationLinkPoll.finally(() => {
    verificationLinkPoll = null;
  });
}

function scanPassiveFields() {
  if (!assistantEligibleFrame()) return;
  emailSuggestionInputs().forEach((input) => ensureEmailChip(input).catch(() => undefined));
  otpSuggestionInputs().forEach((input) => ensureOtpChip(input).catch(() => undefined));
  ensureVerificationLinkChip().catch(() => undefined);
}

function startPassiveAssistant() {
  if (!assistantEligibleFrame()) return;
  let timer = 0;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(scanPassiveFields, 350);
  };
  schedule();
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["type", "name", "autocomplete", "placeholder", "maxlength", "value", "style", "class"] });
  window.addEventListener("scroll", syncChipPositions, { passive: true });
  window.addEventListener("resize", syncChipPositions);
}

startPassiveAssistant();
