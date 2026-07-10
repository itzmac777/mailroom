const form = document.querySelector("#settings-form");
const backendUrlInput = document.querySelector("#backend-url");
const deviceTokenInput = document.querySelector("#device-token");
const statusEl = document.querySelector("#status");

function setStatus(message, kind = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${kind}`.trim();
}

async function loadOptions() {
  const settings = await getSettings();
  backendUrlInput.value = settings.backendUrl;
  deviceTokenInput.value = settings.deviceToken;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Testing connection...");
  try {
    const backendUrl = normalizeBaseUrl(backendUrlInput.value);
    const deviceToken = deviceTokenInput.value.trim();
    if (!deviceToken) throw new Error("Device token is required.");
    const granted = await requestBackendPermission(backendUrl);
    if (!granted) throw new Error("Backend permission was not granted.");

    await saveSettings({ backendUrl, deviceToken });
    const result = await mailroomFetch("/api/rotator/accounts");
    setStatus(`Connected. ${result.accounts.length} account(s) available.`, "ok");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Setup failed.", "error");
  }
});

loadOptions().catch((error) => setStatus(error.message, "error"));
