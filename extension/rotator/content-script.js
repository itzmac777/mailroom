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
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function clickSubmitNear(input) {
  const form = input.closest("form");
  const button = form?.querySelector('button[type="submit"], button:not([disabled])')
    || document.querySelector('button[type="submit"], button:not([disabled])');
  if (button) button.click();
  else form?.requestSubmit();
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
  return findInput([
    'input[type="password"]',
    'input[name="password"]',
    'input[autocomplete="current-password"]'
  ]);
}

function otpInputs() {
  const one = findInput([
    'input[autocomplete="one-time-code"]',
    'input[inputmode="numeric"]',
    'input[name*="code" i]',
    'input[id*="code" i]'
  ]);
  if (one) return [one];
  const boxes = Array.from(document.querySelectorAll('input[maxlength="1"], input[aria-label*="code" i]')).filter(visible);
  return boxes.length >= 4 ? boxes : [];
}

async function submitEmail(email) {
  const found = await waitFor(emailInput, 30000);
  if (found.status !== "ok") return found;
  setValue(found.value, email);
  clickSubmitNear(found.value);
  await wait(1200);
  return { status: "ok" };
}

async function submitPassword(password) {
  const found = await waitFor(passwordInput, 20000);
  if (found.status !== "ok") return found;
  setValue(found.value, password);
  clickSubmitNear(found.value);
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
    clickSubmitNear(inputs[0]);
  } else {
    [...String(code)].forEach((char, index) => {
      if (inputs[index]) setValue(inputs[index], char);
    });
    clickSubmitNear(inputs[inputs.length - 1]);
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
