import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const read = (name) => readFileSync(`extension/chrome/${name}`, "utf8");

test("the extension content script runs only on LLMR confirm pages", () => {
  const manifest = JSON.parse(readFileSync("extension/chrome/manifest.json", "utf8"));
  assert.deepEqual(manifest.content_scripts[0].matches, [
    "http://127.0.0.1/chrome-import/jobs/*/confirm",
    "http://localhost/chrome-import/jobs/*/confirm"
  ]);
  assert.doesNotMatch(readFileSync("extension/chrome/confirm.js", "utf8"), /data-import-url|dataset\.importUrl/);
});

test("the background worker only imports from the sender tab's origin", () => {
  const background = readFileSync("extension/chrome/background.js", "utf8");
  assert.match(background, /sender\.tab\?\.url/);
  assert.match(background, /url\.origin !== senderOrigin/);
});

test("the manifest requests remote hosts only optionally", () => {
  const manifest = JSON.parse(read("manifest.json"));
  assert.deepEqual(manifest.host_permissions, ["http://127.0.0.1/*", "http://localhost/*"]);
  assert.deepEqual(manifest.optional_host_permissions, ["http://*/*", "https://*/*"]);
  assert.equal(manifest.minimum_chrome_version, "127");
});

test("the popup delegates the import to the worker", () => {
  const popup = read("popup.js");
  assert.doesNotMatch(popup, /function (readCookiesForDomains|normalizeImportUrl|fetchImportJob|originsForDomains|normalizeDomain)\b/);
  assert.doesNotMatch(popup, /chrome\.cookies|chrome\.scripting|chrome\.tabs|fetch\(/);
  assert.match(popup, /chrome\.permissions\.request\(/);
  assert.match(popup, /llmr-login-import-preview/);
  assert.match(popup, /llmr-login-import-run/);
});

test("the confirm page requires a trusted click", () => {
  assert.match(read("confirm.js"), /event\.isTrusted/);
});

test("the worker accepts popup messages only from its own popup", () => {
  assert.match(read("background.js"), /chrome\.runtime\.getURL\("popup\.html"\)/);
});

test("the worker rejects single-label domains", () => {
  const context = { chrome: { runtime: { onMessage: { addListener() {} } } }, URL };
  vm.runInNewContext(read("background.js"), context);
  for (const value of ["com", "*.com", ".intranet", ""]) {
    assert.equal(context.normalizeDomain(value), "", value);
  }
  assert.equal(context.normalizeDomain(".Example.com"), "example.com");
  assert.equal(context.normalizeDomain("localhost"), "localhost");
  assert.equal(context.normalizeDomain("127.0.0.1"), "127.0.0.1");
});

test("the worker refuses popup messages from a tab and asks for permission before a confirm import", async () => {
  let listener;
  const session = {};
  const context = {
    chrome: {
      action: { openPopup: async () => { throw new Error("no window"); } },
      permissions: { contains: async () => false },
      runtime: { getURL: (path) => `chrome-extension://id/${path}`, onMessage: { addListener(fn) { listener = fn; } } },
      storage: { session: { set: async (items) => Object.assign(session, items) } }
    },
    fetch: async () => ({ json: async () => ({ job: { domains: ["example.com"], status: "pending" } }), ok: true }),
    URL
  };
  vm.runInNewContext(read("background.js"), context);
  const importUrl = "http://127.0.0.1:4000/chrome-import/jobs/j";
  const tab = { url: `${importUrl}/confirm` };
  const reply = (type, sender, domains) => new Promise((resolve) => assert.equal(listener({ domains, importUrl, type }, sender, resolve), true));

  assert.equal(listener({ type: "other" }, {}, () => {}), false);
  assert.equal((await reply("llmr-login-import-preview", { tab, url: tab.url })).ok, false);
  assert.equal((await reply("llmr-login-import-run", { url: "chrome-extension://other/popup.html" })).ok, false);
  assert.deepEqual((await reply("llmr-login-import-preview", { url: "chrome-extension://id/popup.html" })).domains, ["example.com"]);
  assert.match((await reply("llmr-login-import-run", { url: "chrome-extension://id/popup.html" }, ["other.com"])).error, /changed after it was loaded/);
  assert.match((await reply("llmr-login-import-run", { url: "chrome-extension://id/popup.html" }, ["example.com"])).error, /does not have Chrome site access/);
  assert.equal((await reply("llmr-login-import-confirm", { tab: { url: "http://127.0.0.1:5000/chrome-import/jobs/j/confirm" } })).error, "Invalid LLMR import URL.");
  const confirm = await reply("llmr-login-import-confirm", { tab });
  assert.equal(confirm.ok, false);
  assert.equal(confirm.needsPermission, true);
  assert.equal(session.pendingImportUrl, importUrl);
});
