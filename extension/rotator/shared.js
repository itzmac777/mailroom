const CHATGPT_URL = "https://chatgpt.com/";
const VERIFY_URL = "https://chatgpt.com/backend-api/me";
const COOKIE_DOMAINS = ["chatgpt.com", "openai.com"];

function normalizeBaseUrl(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) throw new Error("Backend URL is required.");
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("Use HTTPS for the backend URL.");
  }
  return url.origin;
}

async function getSettings() {
  const stored = await chrome.storage.local.get(["backendUrl", "deviceToken"]);
  return {
    backendUrl: stored.backendUrl || "",
    deviceToken: stored.deviceToken || ""
  };
}

async function saveSettings(settings) {
  await chrome.storage.local.set(settings);
}

function backendOriginPattern(baseUrl) {
  const url = new URL(baseUrl);
  return `${url.protocol}//${url.hostname}/*`;
}

async function requestBackendPermission(baseUrl) {
  const origins = [backendOriginPattern(baseUrl)];
  const hasPermission = await chrome.permissions.contains({ origins });
  if (hasPermission) return true;
  return chrome.permissions.request({ origins });
}

async function mailroomFetch(path, options = {}) {
  const settings = await getSettings();
  if (!settings.backendUrl || !settings.deviceToken) {
    throw new Error("Open extension options and save your Mailroom URL and device token first.");
  }
  const baseUrl = normalizeBaseUrl(settings.backendUrl);
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${settings.deviceToken}`,
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Mailroom request failed.");
  return payload;
}

function cookieKey(cookie) {
  return [cookie.storeId || "", cookie.domain || "", cookie.path || "", cookie.name || ""].join("\n");
}

function cookieUrl(cookie) {
  const host = String(cookie.domain || "").replace(/^\./, "");
  if (!host) throw new Error("Saved cookie is missing its domain. Re-save this session with the updated extension.");
  const path = cookie.path || "/";
  return `${cookie.secure === false ? "http" : "https"}://${host}${path.startsWith("/") ? path : `/${path}`}`;
}

function sanitizeCookie(cookie) {
  const clean = {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path || "/",
    secure: Boolean(cookie.secure),
    httpOnly: Boolean(cookie.httpOnly),
    hostOnly: Boolean(cookie.hostOnly),
    sameSite: cookie.sameSite,
    storeId: cookie.storeId
  };
  if (!cookie.session && typeof cookie.expirationDate === "number") clean.expirationDate = cookie.expirationDate;
  return clean;
}

async function getRelevantCookies() {
  const found = new Map();
  for (const domain of COOKIE_DOMAINS) {
    const cookies = await chrome.cookies.getAll({ domain });
    for (const cookie of cookies) {
      found.set(cookieKey(cookie), sanitizeCookie(cookie));
    }
  }
  return Array.from(found.values());
}

async function clearRelevantCookies() {
  for (const domain of COOKIE_DOMAINS) {
    const cookies = await chrome.cookies.getAll({ domain });
    for (const cookie of cookies) {
      await chrome.cookies.remove({
        url: cookieUrl(cookie),
        name: cookie.name,
        storeId: cookie.storeId
      }).catch(() => undefined);
    }
  }
}

async function setCookieSnapshot(cookies) {
  for (const cookie of cookies) {
    const details = {
      url: cookieUrl(cookie),
      name: cookie.name,
      value: cookie.value,
      path: cookie.path || "/",
      secure: Boolean(cookie.secure),
      httpOnly: Boolean(cookie.httpOnly),
      sameSite: cookie.sameSite,
      storeId: cookie.storeId
    };
    if (cookie.domain && !cookie.hostOnly) details.domain = cookie.domain;
    if (typeof cookie.expirationDate === "number") details.expirationDate = cookie.expirationDate;
    await chrome.cookies.set(details);
  }
}

async function openOrReloadChatGPT() {
  const tabs = await chrome.tabs.query({ url: ["https://chatgpt.com/*"] });
  if (tabs[0]?.id) {
    await chrome.tabs.update(tabs[0].id, { active: true, url: CHATGPT_URL });
    return tabs[0].id;
  }
  const tab = await chrome.tabs.create({ url: CHATGPT_URL, active: true });
  return tab.id;
}

async function verifyChatGPTLogin() {
  await new Promise((resolve) => setTimeout(resolve, 1800));
  try {
    const response = await fetch(VERIFY_URL, { credentials: "include" });
    if (!response.ok) return false;
    const payload = await response.json().catch(() => null);
    return Boolean(payload && typeof payload === "object");
  } catch {
    return false;
  }
}
