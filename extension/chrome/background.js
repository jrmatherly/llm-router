chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = handlerFor(message?.type);
  if (!handler) {
    return false;
  }

  handler(message, sender)
    .then((reply) => sendResponse({ ...reply, ok: true }))
    .catch((error) => sendResponse({
      error: formatError(error),
      ok: false,
      ...(error?.needsPermission ? { needsPermission: true } : {})
    }));
  return true;
});

function handlerFor(type) {
  switch (type) {
    case "llmr-login-import-confirm":
      return confirmImport;
    case "llmr-login-import-preview":
      return previewImport;
    case "llmr-login-import-run":
      return runPopupImport;
    default:
      return undefined;
  }
}

async function confirmImport({ importUrl }, sender) {
  const senderUrl = sender.tab?.url;
  if (typeof senderUrl !== "string") {
    throw new Error("Invalid LLMR import URL.");
  }

  const job = await loadJob(importUrl, senderUrl);
  if (!(await chrome.permissions.contains({ origins: originsForDomains(job.domains) }))) {
    await chrome.storage.session.set({ pendingImportUrl: job.importUrl });
    try {
      await chrome.action.openPopup();
    } catch (error) {
      // The reply below tells the user to open the popup by hand.
      console.warn("LLMR Login Import could not open its popup.", error);
    }
    throw Object.assign(
      new Error("Chrome needs your approval for these sites. Open the LLMR Login Import popup and click Import."),
      { needsPermission: true }
    );
  }
  return { result: await importLoginState(job) };
}

async function previewImport({ importUrl }, sender) {
  requirePopupSender(sender);
  const job = await loadJob(importUrl);
  return { domains: job.domains, origins: originsForDomains(job.domains) };
}

async function runPopupImport({ domains, importUrl }, sender) {
  requirePopupSender(sender);
  const job = await loadJob(importUrl);
  if (!Array.isArray(domains) || job.domains.join("\n") !== domains.join("\n")) {
    throw new Error("The LLMR import job changed after it was loaded. Click Load Job again.");
  }
  await ensureHostPermissions(job.domains);
  const result = await importLoginState(job);
  await chrome.storage.session.remove("pendingImportUrl");
  return { result };
}

function requirePopupSender(sender) {
  if (sender.tab || sender.url !== chrome.runtime.getURL("popup.html")) {
    throw new Error("This request is accepted only from the LLMR Login Import popup.");
  }
}

// Chrome keeps a granted host permission when an update makes it optional, so an install that had
// version 0.1.0's all-site access would never see the per-import prompt. onInstalled does not fire
// when Chrome restarts onto changed unpacked files, so this runs before every job.
async function dropStandingSiteAccess() {
  const origins = ["http://*/*", "https://*/*"];
  if (await chrome.permissions.contains({ origins: ["https://*/*"] }) || await chrome.permissions.contains({ origins: ["http://*/*"] })) {
    await chrome.permissions.remove({ origins });
  }
}

async function loadJob(importUrl, senderUrl) {
  await dropStandingSiteAccess();
  const normalizedImportUrl = normalizeImportUrl(importUrl, senderUrl);
  if (!normalizedImportUrl) {
    throw new Error("Invalid LLMR import URL.");
  }

  const job = await fetchImportJob(normalizedImportUrl);
  const domains = Array.isArray(job.domains) ? job.domains.map(normalizeDomain).filter(Boolean) : [];
  if (domains.length === 0) {
    throw new Error("LLMR import job does not include any domains.");
  }
  return { domains, importUrl: normalizedImportUrl };
}

async function importLoginState({ domains, importUrl }) {
  const cookies = await readCookiesForDomains(domains);
  const localStorageEntries = await readLocalStorageForDomains(domains, cookies);
  if (cookies.length === 0 && localStorageEntries.length === 0) {
    throw new Error("No cookies or localStorage entries were found for the selected domains.");
  }

  return await submitLoginState(importUrl, cookies, localStorageEntries, domains);
}

async function fetchImportJob(importUrl) {
  const response = await fetch(importUrl, {
    headers: {
      "x-llmr-login-import": "chrome-extension"
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error?.message || `LLMR import job request failed (${response.status}).`);
  }
  if (!body.job || body.job.status !== "pending") {
    throw new Error(`LLMR import job is ${body.job?.status || "unavailable"}.`);
  }
  return body.job;
}

async function submitLoginState(importUrl, cookies, localStorage, domains) {
  const response = await fetch(`${importUrl.replace(/\/+$/, "")}/cookies`, {
    body: JSON.stringify({
      cookies,
      domains,
      localStorage,
      source: {
        browser: "chrome",
        extension: chrome.runtime.getManifest().version
      }
    }),
    headers: {
      "content-type": "application/json",
      "x-llmr-login-import": "chrome-extension"
    },
    method: "POST"
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error?.message || `LLMR login import failed (${response.status}).`);
  }
  const result = body.result || {};
  if (!result.imported) {
    throw new Error(`LLMR imported nothing and skipped ${result.skipped ?? 0} entries. Start a new import in LLMR.`);
  }
  return result;
}

async function readCookiesForDomains(domains) {
  const cookies = [];
  for (const domain of domains) {
    cookies.push(...await chrome.cookies.getAll({ domain }));
  }
  return dedupeCookies(cookies);
}

async function readLocalStorageForDomains(domains, cookies) {
  const origins = localStorageOriginsForDomains(domains, cookies);
  const entries = [];
  for (const origin of origins) {
    const entry = await readLocalStorageForOrigin(origin).catch(() => undefined);
    if (entry && Object.keys(entry.items).length > 0) {
      entries.push(entry);
    }
  }
  return entries;
}

async function readLocalStorageForOrigin(origin) {
  const tab = await chrome.tabs.create({
    active: false,
    url: `${origin}/`
  });
  try {
    await waitForTabLoad(tab.id, 15000);
    const [frameResult] = await chrome.scripting.executeScript({
      func: () => {
        const items = {};
        for (let index = 0; index < window.localStorage.length; index += 1) {
          const key = window.localStorage.key(index);
          if (key !== null) {
            items[key] = window.localStorage.getItem(key) || "";
          }
        }
        return {
          items,
          origin: window.location.origin
        };
      },
      target: { tabId: tab.id },
      world: "MAIN"
    });
    const result = frameResult?.result;
    if (!result || !allowedLocalStorageOrigin(result.origin, origin)) {
      return undefined;
    }
    return result;
  } finally {
    if (tab.id !== undefined) {
      await chrome.tabs.remove(tab.id).catch(() => undefined);
    }
  }
}

function waitForTabLoad(tabId, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) {
        return;
      }
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timeout);
      resolve();
    };
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        finish();
      }
    };
    const timeout = setTimeout(finish, timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function dedupeCookies(cookies) {
  const seen = new Set();
  const result = [];
  for (const cookie of cookies) {
    const partitionKey = cookie.partitionKey ? JSON.stringify(cookie.partitionKey) : "";
    const key = `${cookie.storeId || ""}\n${cookie.domain}\n${cookie.path}\n${cookie.name}\n${partitionKey}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(cookie);
    }
  }
  return result;
}

function localStorageOriginsForDomains(domains, cookies) {
  const origins = new Set();
  for (const domain of domains) {
    if (domain === "localhost" || isIpAddress(domain)) {
      origins.add(`http://${domain}`);
      origins.add(`https://${domain}`);
    } else {
      origins.add(`https://${domain}`);
    }
  }

  for (const cookie of cookies) {
    const host = normalizeDomain(cookie.domain);
    if (!host || !cookie.hostOnly || !domains.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
      continue;
    }
    origins.add(`${cookie.secure === false ? "http" : "https"}://${host}`);
  }

  return [...origins];
}

function originsForDomains(domains) {
  return [...new Set(domains.flatMap((domain) => {
    if (domain === "localhost" || isIpAddress(domain)) {
      return [
        `http://${domain}/*`,
        `https://${domain}/*`
      ];
    }
    return [
      `http://${domain}/*`,
      `https://${domain}/*`,
      `http://*.${domain}/*`,
      `https://*.${domain}/*`
    ];
  }))];
}

async function ensureHostPermissions(domains) {
  const origins = originsForDomains(domains);
  const granted = await chrome.permissions.contains({ origins });
  if (granted) {
    return;
  }
  throw new Error(
    [
      `LLMR Login Import does not have Chrome site access for ${domains.join(", ")}.`,
      "Open the LLMR Login Import popup and click Import to grant site access."
    ].join(" ")
  );
}

function normalizeImportUrl(value, senderUrl) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    return "";
  }
  try {
    const url = new URL(raw);
    const senderOrigin = senderUrl === undefined ? url.origin : new URL(senderUrl).origin;
    if (url.origin !== senderOrigin) {
      return "";
    }
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
      return "";
    }
    if (!/^\/chrome-import\/jobs\/[^/]+\/?$/.test(url.pathname)) {
      return "";
    }
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeDomain(value) {
  const host = typeof value === "string"
    ? value.trim().replace(/^\*\./, "").replace(/^\./, "").replace(/\.+$/, "").toLowerCase()
    : "";
  return host === "localhost" || isIpAddress(host) || host.includes(".") ? host : "";
}

function allowedLocalStorageOrigin(actualOrigin, requestedOrigin) {
  try {
    const actual = new URL(actualOrigin);
    const requested = new URL(requestedOrigin);
    return actual.protocol === requested.protocol && actual.hostname === requested.hostname && actual.port === requested.port;
  } catch {
    return false;
  }
}

function isIpAddress(value) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value) || value.includes(":");
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
