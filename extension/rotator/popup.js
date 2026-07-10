const accountsEl = document.querySelector("#accounts");
const saveAccountEl = document.querySelector("#save-account");
const saveSessionButton = document.querySelector("#save-session");
const refreshButton = document.querySelector("#refresh");
const optionsButton = document.querySelector("#options-button");
const statusEl = document.querySelector("#status");
const jobsEl = document.querySelector("#jobs");
const runnerStatusEl = document.querySelector("#runner-status");
const stopOnboardingButton = document.querySelector("#stop-onboarding");

let accounts = [];
let jobs = [];

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

function renderJobs() {
  jobsEl.innerHTML = "";
  const runnable = jobs.filter((job) => job.status === "running" && job.items.some((item) => item.status === "queued"));
  if (!jobs.length) {
    jobsEl.innerHTML = '<p class="hint">No onboarding jobs. Create one from /admin/rotator.</p>';
    return;
  }

  for (const job of jobs.slice(0, 5)) {
    const counts = job.items.reduce((summary, item) => {
      summary[item.status] = (summary[item.status] || 0) + 1;
      return summary;
    }, {});
    const queued = counts.queued || 0;
    const saved = counts.saved || 0;
    const failed = (counts.failed || 0) + (counts.needs_manual || 0);
    const item = document.createElement("article");
    item.className = "account";
    item.innerHTML = `
      <div>
        <strong></strong>
        <p></p>
        <span class="${job.status === "completed" ? "badge active" : "badge"}">${job.status}</span>
      </div>
      <button type="button" ${queued ? "" : "disabled"}>Start</button>
      <p class="meta">Saved ${saved} · Failed/manual ${failed} · Queued ${queued}</p>
    `;
    item.querySelector("strong").textContent = `Job ${job.id.slice(0, 8)}`;
    item.querySelector("p").textContent = `${job.items.length} account(s) · ${formatDate(job.createdAt)}`;
    item.querySelector("button").addEventListener("click", () => startOnboarding(job.id));
    jobsEl.append(item);
  }

  if (!runnable.length && jobs.some((job) => job.status === "running")) {
    runnerStatusEl.textContent = "No queued items are waiting in the current jobs.";
  }
}

async function loadData() {
  setStatus("Loading accounts...");
  try {
    const [accountResult, jobResult] = await Promise.all([
      mailroomFetch("/api/rotator/accounts"),
      mailroomFetch("/api/rotator/onboarding/jobs")
    ]);
    accounts = accountResult.accounts || [];
    jobs = jobResult.jobs || [];
    renderAccounts();
    renderJobs();
    setStatus("Ready.", "ok");
  } catch (error) {
    accounts = [];
    jobs = [];
    renderAccounts();
    renderJobs();
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
    await loadData();
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
    await loadData();
    setStatus(loggedIn ? `${account.label} is active.` : `${account.label} needs login again.`, loggedIn ? "ok" : "error");
  } catch (error) {
    snapshot = null;
    setStatus(error instanceof Error ? error.message : "Could not activate account.", "error");
  }
}

async function startOnboarding(jobId) {
  runnerStatusEl.textContent = "Starting onboarding runner...";
  const response = await chrome.runtime.sendMessage({ type: "startOnboarding", jobId });
  renderRunnerState(response?.state);
}

async function stopOnboarding() {
  const response = await chrome.runtime.sendMessage({ type: "stopOnboarding" });
  renderRunnerState(response?.state);
}

function renderRunnerState(state) {
  if (!state) return;
  runnerStatusEl.textContent = state.current ? `${state.message} (${state.current})` : state.message;
  stopOnboardingButton.disabled = !state.running;
}

async function loadRunnerState() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "getOnboardingState" });
    renderRunnerState(response?.state);
  } catch {
    runnerStatusEl.textContent = "Runner unavailable.";
  }
}

saveSessionButton.addEventListener("click", () => saveCurrentSession());
refreshButton.addEventListener("click", () => loadData());
optionsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());
stopOnboardingButton.addEventListener("click", () => stopOnboarding());

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "onboardingState") {
    renderRunnerState(message.state);
    if (!message.state.running) loadData();
  }
});

loadData();
loadRunnerState();
