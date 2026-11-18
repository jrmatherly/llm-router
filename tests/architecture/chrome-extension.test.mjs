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

function loadWorker({ granted = false, standing = false } = {}) {
  const calls = { contains: [], posts: 0, removed: [] };
  const listeners = {};
  const session = {};
  const context = {
    chrome: {
      action: { openPopup: async () => { throw new Error("no window"); } },
      cookies: { getAll: async () => [{ domain: ".example.com", name: "sid", path: "/", value: "1" }] },
      permissions: {
        contains: async (query) => {
          if (query.origins.some((origin) => /^https?:\/\/\*\/\*$/.test(origin))) {
            return standing;
          }
          calls.contains.push([...query.origins]);
          return granted || standing;
        },
        remove: async (query) => { calls.removed.push([...query.origins]); standing = false; return true; }
      },
      runtime: {
        getManifest: () => ({ version: "test" }),
        getURL: (path) => `chrome-extension://id/${path}`,
        onMessage: { addListener(fn) { listeners.message = fn; } }
      },
      storage: { session: { remove: async (key) => { delete session[key]; }, set: async (items) => Object.assign(session, items) } }
    },
    console: { warn() {} },
    fetch: async (_url, init) => {
      const post = init?.method === "POST";
      calls.posts += post ? 1 : 0;
      return { json: async () => (post ? { result: { cookieImported: 1 } } : { job: { domains: ["example.com"], status: "pending" } }), ok: true };
    },
    URL
  };
  vm.runInNewContext(read("background.js"), context);
  const send = (message, sender) => new Promise((resolve) => assert.equal(listeners.message(message, sender, resolve), true));
  return { calls, context, listeners, send, session };
}

const importUrl = "http://127.0.0.1:4000/chrome-import/jobs/j";
const popup = { url: "chrome-extension://id/popup.html" };
const confirmTab = { tab: { url: `${importUrl}/confirm` } };
const exampleOrigins = ["http://example.com/*", "https://example.com/*", "http://*.example.com/*", "https://*.example.com/*"];
const fakeElement = (id, handlers) => ({ addEventListener(type, fn) { handlers[`${id}:${type}`] = fn; }, appendChild() {}, className: "", disabled: false, hidden: false, textContent: "", value: "" });
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

test("the worker rejects single-label domains", () => {
  const { normalizeDomain } = loadWorker().context;
  for (const value of ["com", "*.com", ".intranet", "", "com."]) {
    assert.equal(normalizeDomain(value), "", value);
  }
  assert.equal(normalizeDomain(".Example.com."), "example.com");
  assert.equal(normalizeDomain("localhost"), "localhost");
  assert.equal(normalizeDomain("127.0.0.1"), "127.0.0.1");
});

test("an install that still holds all-site access gives it up before an import", async () => {
  const { calls, send } = loadWorker({ standing: true });
  const confirm = await send({ importUrl, type: "llmr-login-import-confirm" }, confirmTab);
  assert.deepEqual(calls.removed, [["http://*/*", "https://*/*"]]);
  assert.equal(confirm.needsPermission, true);
  assert.equal(calls.posts, 0);
  await send({ importUrl, type: "llmr-login-import-preview" }, popup);
  assert.equal(calls.removed.length, 1);
});

test("the worker accepts preview and run only from its own popup", async () => {
  const { calls, listeners, send } = loadWorker({ granted: true });
  assert.equal(listeners.message({ type: "other" }, {}, () => {}), false);
  const run = { domains: ["example.com"], importUrl, type: "llmr-login-import-run" };
  for (const sender of [confirmTab, { tab: confirmTab.tab, url: popup.url }, { url: "chrome-extension://other/popup.html" }]) {
    for (const message of [run, { importUrl, type: "llmr-login-import-preview" }]) {
      assert.match((await send(message, sender)).error, /only from the LLMR Login Import popup/);
    }
  }
  assert.equal(calls.posts, 0);
});

test("the worker previews exactly the job's origins and imports only what was previewed", async () => {
  const { calls, send, session } = loadWorker({ granted: true });
  session.pendingImportUrl = importUrl;
  const preview = await send({ importUrl, type: "llmr-login-import-preview" }, popup);
  assert.deepEqual([...preview.domains], ["example.com"]);
  assert.deepEqual([...preview.origins], exampleOrigins);
  assert.match((await send({ domains: ["other.com"], importUrl, type: "llmr-login-import-run" }, popup)).error, /changed after it was loaded/);
  assert.equal(calls.posts, 0);
  const run = await send({ domains: ["example.com"], importUrl, type: "llmr-login-import-run" }, popup);
  assert.equal(run.ok, true);
  assert.equal(run.result.cookieImported, 1);
  assert.deepEqual(calls.contains, [exampleOrigins]);
  assert.equal(session.pendingImportUrl, undefined);
});

test("a confirm import asks for permission before it reads anything", async () => {
  const { calls, send, session } = loadWorker();
  assert.equal((await send({ importUrl, type: "llmr-login-import-confirm" }, popup)).error, "Invalid LLMR import URL.");
  assert.equal((await send({ importUrl, type: "llmr-login-import-confirm" }, { tab: { url: "http://127.0.0.1:5000/chrome-import/jobs/j/confirm" } })).error, "Invalid LLMR import URL.");
  const confirm = await send({ importUrl, type: "llmr-login-import-confirm" }, confirmTab);
  assert.equal(confirm.ok, false);
  assert.equal(confirm.needsPermission, true);
  assert.deepEqual(calls.contains, [exampleOrigins]);
  assert.equal(session.pendingImportUrl, importUrl);
  assert.equal(calls.posts, 0);
  assert.match((await send({ domains: ["example.com"], importUrl, type: "llmr-login-import-run" }, popup)).error, /does not have Chrome site access/);
});

test("the confirm page ignores a synthetic click", async () => {
  const handlers = {};
  const elements = {};
  const sent = [];
  vm.runInNewContext(read("confirm.js"), {
    chrome: { runtime: { sendMessage: async (message) => { sent.push(message); return { ok: true, result: {} }; } } },
    document: { getElementById: (id) => (elements[id] ??= fakeElement(id, handlers)) },
    location: { origin: "http://127.0.0.1:4000", pathname: "/chrome-import/jobs/j/confirm" }
  });
  handlers["llmr-confirm-import:click"]({ isTrusted: false });
  await settle();
  assert.equal(sent.length, 0);
  handlers["llmr-confirm-import:click"]({ isTrusted: true });
  await settle();
  assert.equal(sent[0].importUrl, importUrl);
});

test("the popup asks Chrome for the previewed origins inside the click", async () => {
  const handlers = {};
  const elements = {};
  const requested = [];
  const session = {};
  vm.runInNewContext(read("popup.js"), {
    chrome: {
      permissions: { request: (query) => { requested.push(query.origins); return Promise.resolve(false); } },
      runtime: { sendMessage: async () => ({ domains: ["example.com"], ok: true, origins: exampleOrigins }) },
      storage: {
        local: { get: async () => ({}), set: async () => {} },
        session: { get: async () => ({}), remove: async () => {}, set: async (items) => Object.assign(session, items) }
      }
    },
    document: { addEventListener() {}, createElement: () => fakeElement("pill", handlers), getElementById: (id) => (elements[id] ??= fakeElement(id, handlers)) }
  });
  elements["import-url"].value = importUrl;
  handlers["load-button:click"]();
  await settle();
  assert.equal(elements["import-button"].disabled, false);
  assert.equal(session.pendingImportUrl, importUrl);
  handlers["import-button:click"]();
  assert.deepEqual(requested, [exampleOrigins]);
  await settle();
  assert.equal(elements.status.textContent, "Chrome site access was not granted.");
  handlers["import-url:input"]();
  assert.equal(elements["import-button"].disabled, true);
});
