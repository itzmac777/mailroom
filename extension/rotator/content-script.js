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
