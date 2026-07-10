const accountsEl = document.querySelector("#accounts");
const saveAccountEl = document.querySelector("#save-account");
const saveSessionButton = document.querySelector("#save-session");
const refreshButton = document.querySelector("#refresh");
const optionsButton = document.querySelector("#options-button");
const statusEl = document.querySelector("#status");

let accounts = [];

function setStatus(message, kind = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${kind}`.trim();
}

function statusClass(status) {
  if (status === "active") return "badge active";
  if (status === "needs_relogin") return "badge warning";
  return "badge";
}

function formatDate(value) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function renderAccounts() {
  saveAccountEl.innerHTML = "";
  accountsEl.innerHTML = "";

  if (!accounts.length) {
    saveAccountEl.innerHTML = '<option value="">No accounts</option>';
    accountsEl.innerHTML = '<p class="hint">No accounts yet. Add one from /admin/rotator.</p>';
    return;
  }

  for (const account of accounts) {
    const option = document.createElement("option");
    option.value = account.id;
    option.textContent = `${account.label} (${account.email})`;
    saveAccountEl.append(option);

    const item = document.createElement("article");
    item.className = "account";
    item.innerHTML = `
      <div>
        <strong></strong>
        <p></p>
        <span class="${statusClass(account.status)}">${account.status.replace("_", " ")}</span>
        <span class="mini">${account.hasSession ? "Session saved" : "No session saved"}</span>
      </div>
      <button type="button" ${account.hasSession ? "" : "disabled"}>Activate</button>
      <p class="meta">Last used: ${formatDate(account.lastUsed)}</p>
    `;
    item.querySelector("strong").textContent = account.label;
    item.querySelector("p").textContent = account.email;
    item.querySelector("button").addEventListener("click", () => activateAccount(account));
    accountsEl.append(item);
  }
}

async function loadAccounts() {
  setStatus("Loading accounts...");
  try {
    const result = await mailroomFetch("/api/rotator/accounts");
    accounts = result.accounts || [];
    renderAccounts();
    setStatus("Ready.", "ok");
  } catch (error) {
    accounts = [];
    renderAccounts();
    setStatus(error instanceof Error ? error.message : "Could not load accounts.", "error");
  }
}

async function saveCurrentSession() {
  const accountId = saveAccountEl.value;
  if (!accountId) return setStatus("Choose an account first.", "error");
  setStatus("Reading ChatGPT/OpenAI cookies...");
  try {
    const cookies = await getRelevantCookies();
    if (!cookies.length) throw new Error("No ChatGPT/OpenAI cookies found. Log in to ChatGPT first.");
    await mailroomFetch(`/api/rotator/accounts/${encodeURIComponent(accountId)}/session`, {
      method: "POST",
      body: JSON.stringify(cookies)
    });
    await loadAccounts();
    setStatus(`Saved ${cookies.length} cookie(s).`, "ok");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Could not save session.", "error");
  }
}

async function markStatus(accountId, status) {
  await mailroomFetch(`/api/rotator/accounts/${encodeURIComponent(accountId)}/mark-status`, {
    method: "POST",
    body: JSON.stringify({ status })
  });
}

async function activateAccount(account) {
  setStatus(`Activating ${account.label}...`);
  let snapshot = null;
  try {
    const result = await mailroomFetch(`/api/rotator/accounts/${encodeURIComponent(account.id)}/session`);
    snapshot = result.session;
    if (!Array.isArray(snapshot)) throw new Error("Saved session snapshot is invalid.");
    await clearRelevantCookies();
    await setCookieSnapshot(snapshot);
    snapshot = null;
    await openOrReloadChatGPT();
    const loggedIn = await verifyChatGPTLogin();
    await markStatus(account.id, loggedIn ? "active" : "needs_relogin");
    await loadAccounts();
    setStatus(loggedIn ? `${account.label} is active.` : `${account.label} needs login again.`, loggedIn ? "ok" : "error");
  } catch (error) {
    snapshot = null;
    setStatus(error instanceof Error ? error.message : "Could not activate account.", "error");
  }
}

saveSessionButton.addEventListener("click", () => saveCurrentSession());
refreshButton.addEventListener("click", () => loadAccounts());
optionsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());

loadAccounts();
