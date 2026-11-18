const importUrlInput = document.getElementById("import-url");
const loadButton = document.getElementById("load-button");
const importButton = document.getElementById("import-button");
const domainPreview = document.getElementById("domain-preview");
const domainList = document.getElementById("domain-list");
const statusElement = document.getElementById("status");

let loadedJob = { importUrl: "", origins: [] };

document.addEventListener("DOMContentLoaded", () => {
  void restoreImportUrl();
});

loadButton.addEventListener("click", () => {
  void loadJob();
});

importButton.addEventListener("click", () => {
  // Chrome grants a permission request only inside the click, so nothing may be awaited before it.
  const granted = chrome.permissions.request({ origins: loadedJob.origins });
  void runImport(granted);
});

async function restoreImportUrl() {
  const { pendingImportUrl } = await chrome.storage.session.get(["pendingImportUrl"]);
  const { lastImportUrl } = await chrome.storage.local.get(["lastImportUrl"]);
  const importUrl = [pendingImportUrl, lastImportUrl].find((value) => typeof value === "string");
  if (importUrl) {
    importUrlInput.value = importUrl;
  }
  if (typeof pendingImportUrl === "string" && !(await loadJob())) {
    await chrome.storage.session.remove("pendingImportUrl");
  }
}

async function loadJob() {
  const importUrl = importUrlInput.value.trim();
  importButton.disabled = true;
  renderDomains([]);
  if (!importUrl) {
    setStatus("Paste the import URL copied from LLMR.", "error");
    return false;
  }

  setStatus("Reading LLMR import job...");
  const response = await sendToWorker("llmr-login-import-preview", importUrl);
  if (!response.ok) {
    setStatus(response.error, "error");
    return false;
  }
  loadedJob = { importUrl, origins: response.origins };
  renderDomains(response.domains);
  await chrome.storage.local.set({ lastImportUrl: importUrl });
  importButton.disabled = false;
  setStatus("Review the domains, then click Import.");
  return true;
}

async function runImport(granted) {
  importButton.disabled = true;
  try {
    if (!(await granted)) {
      setStatus("Chrome site access was not granted.", "error");
      return;
    }
    setStatus("Importing Chrome cookies and localStorage into LLMR...");
    const response = await sendToWorker("llmr-login-import-run", loadedJob.importUrl);
    if (!response.ok) {
      throw new Error(response.error);
    }
    const result = response.result || {};
    setStatus(
      `Imported ${result.cookieImported ?? 0} cookies and ${result.localStorageImported ?? 0} localStorage items. Skipped ${result.skipped ?? 0}.`,
      "ok"
    );
  } catch (error) {
    setStatus(formatError(error), "error");
  } finally {
    importButton.disabled = false;
  }
}

async function sendToWorker(type, importUrl) {
  try {
    return (await chrome.runtime.sendMessage({ importUrl, type })) ?? { error: "The LLMR Login Import worker did not reply.", ok: false };
  } catch (error) {
    return { error: formatError(error), ok: false };
  }
}

function renderDomains(domains) {
  domainList.textContent = "";
  domainPreview.hidden = domains.length === 0;
  for (const domain of domains) {
    const item = document.createElement("span");
    item.className = "domain-pill";
    item.textContent = domain;
    item.title = domain;
    domainList.appendChild(item);
  }
}

function setStatus(message, kind = "") {
  statusElement.textContent = message;
  statusElement.className = `status ${kind}`.trim();
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
