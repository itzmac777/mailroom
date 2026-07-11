const LOGIN_URL = "https://chatgpt.com/auth/login";
const MAX_CAPTCHA_FAILURES = 2;

let runnerState = {
  running: false,
  jobId: "",
  current: "",
  message: "Idle.",
  consecutiveCaptchas: 0
};

function setRunnerState(patch) {
  runnerState = { ...runnerState, ...patch };
  chrome.runtime.sendMessage({ type: "onboardingState", state: runnerState }).catch(() => undefined);
}

function randomDelayMs() {
  return 5000 + Math.floor(Math.random() * 10000);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function closeTab(tabId) {
  if (tabId) await chrome.tabs.remove(tabId).catch(() => undefined);
}

async function sendToTab(tabId, message, attempts = 20) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      lastError = error;
      await sleep(500);
    }
  }
  throw lastError || new Error("Could not reach ChatGPT login page.");
}

async function reportOnboardingResult(jobId, itemId, status, errorReason, errorDetail) {
  return mailroomFetch(`/api/rotator/onboarding/jobs/${encodeURIComponent(jobId)}/items/${encodeURIComponent(itemId)}/result`, {
    method: "POST",
    body: JSON.stringify({ status, errorReason, errorDetail })
  });
}

function onboardingErrorReason(rawReason) {
  const allowed = ["wrong_password", "otp_timeout", "captcha_encountered", "unexpected_page", "missing_password", "otp_not_found"];
  if (allowed.includes(rawReason)) return rawReason;
  if (/no otp found/i.test(rawReason)) return "otp_not_found";
  if (/timeout|timed out/i.test(rawReason)) return "otp_timeout";
  if (/captcha|human verification/i.test(rawReason)) return "captcha_encountered";
  return "unknown_error";
}

async function pollOtp(jobId, itemId) {
  const started = Date.now();
  while (Date.now() - started < 60000) {
    try {
      const result = await mailroomFetch(`/api/rotator/onboarding/jobs/${encodeURIComponent(jobId)}/items/${encodeURIComponent(itemId)}/otp`);
      if (result.code) return result.code;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!/No OTP found/i.test(message)) throw error;
    }
    await sleep(5000);
  }
  throw new Error("otp_timeout");
}

async function saveOnboardedSession(item) {
  const cookies = await getRelevantCookies();
  if (!cookies.length) throw new Error("No ChatGPT/OpenAI cookies found after login.");
  await mailroomFetch(`/api/rotator/accounts/${encodeURIComponent(item.accountId)}/session`, {
    method: "POST",
    body: JSON.stringify(cookies)
  });
  await mailroomFetch(`/api/rotator/accounts/${encodeURIComponent(item.accountId)}/mark-status`, {
    method: "POST",
    body: JSON.stringify({ status: "active" })
  });
}

async function processOnboardingItem(jobId, item) {
  let tabId = null;
  let reachedOtpPage = false;
  try {
    setRunnerState({ current: item.email, message: `Opening login for ${item.email}...` });
    await clearRelevantCookies();
    const tab = await chrome.tabs.create({ url: LOGIN_URL, active: true });
    tabId = tab.id;

    setRunnerState({ message: `Submitting ${item.email}...` });
    const emailResult = await sendToTab(tabId, { type: "rotatorSubmitEmail", email: item.email });
    if (emailResult?.status === "captcha") throw new Error("captcha_encountered");
    if (emailResult?.status !== "ok") throw new Error(emailResult?.reason || "unexpected_page");

    if (item.password) {
      setRunnerState({ message: `Submitting password for ${item.email}...` });
      const passwordResult = await sendToTab(tabId, { type: "rotatorSubmitPassword", password: item.password });
      if (passwordResult?.status === "captcha") throw new Error("captcha_encountered");
      if (passwordResult?.status === "wrong_password") throw new Error("wrong_password");
      if (passwordResult?.status !== "ok") throw new Error(passwordResult?.reason || "unexpected_page");
    }

    setRunnerState({ message: `Waiting for OTP field for ${item.email}...` });
    const otpReady = await sendToTab(tabId, { type: "rotatorWaitForOtp" }, 60);
    if (otpReady?.status === "captcha") throw new Error("captcha_encountered");
    if (otpReady?.status === "password_required" && !item.password) throw new Error("missing_password");
    if (otpReady?.status !== "ok") throw new Error(otpReady?.reason || "unexpected_page");
    reachedOtpPage = true;

    setRunnerState({ message: `Fetching OTP for ${item.email}...` });
    const code = await pollOtp(jobId, item.id);

    setRunnerState({ message: `Submitting OTP for ${item.email}...` });
    const otpResult = await sendToTab(tabId, { type: "rotatorSubmitOtp", code });
    if (otpResult?.status === "captcha") throw new Error("captcha_encountered");
    if (otpResult?.status !== "ok") throw new Error(otpResult?.reason || "unexpected_page");

    setRunnerState({ message: `Verifying ${item.email}...` });
    const loggedIn = await verifyChatGPTLogin();
    if (!loggedIn) throw new Error("unexpected_page");

    await saveOnboardedSession(item);
    await reportOnboardingResult(jobId, item.id, "saved");
    setRunnerState({ consecutiveCaptchas: 0, message: `Saved ${item.email}.` });
    await closeTab(tabId);
  } catch (error) {
    const rawReason = error instanceof Error ? error.message : "unknown_error";
    const errorReason = onboardingErrorReason(rawReason);
    const keepTabOpen = reachedOtpPage || errorReason === "captcha_encountered";
    if (!keepTabOpen) await closeTab(tabId);
    const status = keepTabOpen ? "needs_manual" : "failed";
    await reportOnboardingResult(jobId, item.id, status, errorReason, rawReason).catch(() => undefined);
    if (errorReason === "captcha_encountered") {
      setRunnerState({ consecutiveCaptchas: runnerState.consecutiveCaptchas + 1 });
    } else {
      setRunnerState({ consecutiveCaptchas: 0 });
    }
    setRunnerState({
      running: keepTabOpen ? false : runnerState.running,
      message: keepTabOpen
        ? `${item.email} needs manual finish: ${rawReason.replaceAll("_", " ")}. The login tab was left open.`
        : `${item.email} stopped: ${errorReason.replaceAll("_", " ")}.`
    });
    if (runnerState.consecutiveCaptchas >= MAX_CAPTCHA_FAILURES) {
      throw new Error("Repeated CAPTCHA challenges. Pausing onboarding.");
    }
  }
}

async function runOnboardingJob(jobId) {
  setRunnerState({ running: true, jobId, current: "", message: "Starting onboarding job...", consecutiveCaptchas: 0 });
  try {
    while (runnerState.running && runnerState.jobId === jobId) {
      const claimed = await mailroomFetch(`/api/rotator/onboarding/jobs/${encodeURIComponent(jobId)}/next`);
      if (!claimed.item) {
        setRunnerState({ running: false, current: "", message: "Onboarding job finished." });
        return;
      }
      await processOnboardingItem(jobId, claimed.item);
      if (!runnerState.running) return;
      const delay = randomDelayMs();
      setRunnerState({ current: "", message: `Waiting ${Math.round(delay / 1000)}s before the next account...` });
      await sleep(delay);
    }
  } catch (error) {
    setRunnerState({
      running: false,
      current: "",
      message: error instanceof Error ? error.message : "Onboarding stopped."
    });
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "mailroomFetch") {
    mailroomFetch(message.path, message.options || {})
      .then((payload) => sendResponse({ ok: true, payload }))
      .catch((error) => {
        sendResponse({
          ok: false,
          message: error instanceof Error ? error.message : "Mailroom request failed.",
          status: error?.status,
          payload: error?.payload
        });
      });
    return true;
  }
  if (message?.type === "getOnboardingState") {
    sendResponse({ state: runnerState });
    return true;
  }
  if (message?.type === "stopOnboarding") {
    setRunnerState({ running: false, current: "", message: "Stopping after the current step..." });
    sendResponse({ state: runnerState });
    return true;
  }
  if (message?.type === "startOnboarding") {
    if (runnerState.running) {
      sendResponse({ state: runnerState });
      return true;
    }
    runOnboardingJob(message.jobId);
    sendResponse({ state: runnerState });
    return true;
  }
  return false;
});
