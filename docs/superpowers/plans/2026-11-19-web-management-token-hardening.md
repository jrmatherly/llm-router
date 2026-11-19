# Web Management Token Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The web management token is documented as full administrative access, and LLMR stops writing it where someone who should not hold it can read it.

**Architecture:** The token leaves the URL query and the process environment. The server returns it as its own value, and the one URL a person opens carries it in the fragment, which no server or proxy logs. A token the user supplied is never printed. Start-up refuses a short supplied token and a non-loopback bind without an explicit opt-in. The masking of provider credentials gains the key names it misses.

**Tech Stack:** TypeScript, `node:http`, `node:test` with `node:assert/strict`, Nginx (Docker image), Playwright (`tests/e2e`).

**Spec:** [`docs/superpowers/research/2026-11-19-web-management-token-scope.md`](../research/2026-11-19-web-management-token-scope.md), direction (a) in its Part 4. Read its "Answer in short", Part 3 and Part 4(a) before any task. The decisions below are the owner's and settle what that document leaves open.

## Decisions

| # | Decision | Who, when |
|---|---|---|
| T-1 | Direction (a): the token is full administrative access by design. No address check on probes or on `saveConfig` (direction c), and no guard on command-starting config (direction b). | Owner, 2026-11-18: asked for this plan after direction (a) was recommended with this task list |
| T-2 | The work is hardening how the token is exposed, in the order of this plan, with the token-printing bug first. | Owner, 2026-11-18 |
| T-3 | The research document stays in the public repository. A finding that helps someone who does not hold the token is not added to it until its fix has merged. | Plan author's recommendation, 2026-11-18. The owner read it and asked for this plan; he has not confirmed this line in words |
| T-4 | No logging of or delay on a wrong token. With Task 2's minimum of 32 characters online guessing is not feasible, and a per-request log line is a flooding risk. | Plan author; reverse it if the owner wants failed attempts visible |
| T-5 | Trusted loopback origins on any port stay trusted. A page on another local port still needs the token, and `sessionStorage` is per origin. | Plan author, from the 2026-11-18 code read |

## Global Constraints

- The fork has no consumers. No compatibility path: the query-string form `?llmr_web_token=` is removed, not kept beside the fragment form.
- Never weigh upstream parity.
- Double quotes, semicolons, two-space indent. Object keys and type members alphabetized where the surrounding file does it. No comments except a non-obvious why.
- Tests are `node:test` with `node:assert/strict`. A test that pins an issue carries its number in its name; these carry no number, so name them by behaviour.
- One test file: `node build/test.mjs <pkg> && node --test .test-dist/<pkg>/test/<unit|integration>/<path>.test.js`. Architecture: `node build/test.mjs architecture && node --test .test-dist/architecture/test/<name>.test.js`.
- A live check needs a fresh build: `npm run build:assets`, then `git checkout -- packages/core/models.json packages/ui/src/generated`.
- Each task is one branch and one squash-merged PR. Before each PR: `npm run typecheck`, `npm run lint`, `npm run test:architecture`, the package suites the task touches, and for Tasks 1 to 3 `npm run test:system` (needs Docker; `orbctl start`) and `npm run test:e2e`.
- Merging needs the owner's word, once per PR.
- Test tokens in this plan are at least 32 characters: use `"test-web-auth-token-0123456789abcdef"`.
- The names used across tasks: URL fragment parameter `llmr_web_token`, header `x-llmr-web-auth`, environment variables `LLMR_WEB_AUTH_TOKEN` and `LLMR_WEB_ALLOW_REMOTE`, CLI flag `--allow-remote`.

## Review Focus

1. **A user who set `LLMR_WEB_AUTH_TOKEN` opens the printed URL and lands on a page that cannot authenticate.** They expect to be told how to supply the token. Task 1 prints the fragment to append and the page shows a message when it has no token.
2. **A daemon started by an older build left a `service.json` whose `url` holds the token in the query and no `authToken` field.** `llmr stop` and `llmr status` must still find and stop that process, not report "not running" and leave it behind. Task 1 Step 5 covers it.
3. **A reverse proxy or Nginx redirects `/` to the page.** The fragment must survive the redirect. Browsers keep a fragment across a redirect that has none of its own; Task 1's Docker smoke step asserts the redirect target carries no query and its e2e step loads through it.
4. **A user binds `--host 0.0.0.0` as the docs told them to.** The process must exit with a message that names the flag, not start bound to loopback or hang. Task 2.
5. **A provider config holds a field whose name ends in `token` but is not a credential.** It must stay readable in the web UI. Task 4 lists the fork's real names that must not be masked.

---

### Task 1: The token leaves the query string and is not printed when supplied

One PR. This fixes the confirmed bug: `docker logs` shows a token the user set themselves (run on 2026-11-18: `LLMR core server is running at http://127.0.0.1:3459/?llmr_web_token=<token>`), while `docker/entrypoint.sh:204` and the Docker guide say only a generated token is printed.

**Files:**
- Modify: `packages/core/src/web/management-server.ts` (`WebManagementServerRuntime` at `:109-113`, `startWebManagementServer` at `:139-182`, `urlWithWebAuthToken` at `:693-697`)
- Modify: `packages/core/src/entrypoints/server.ts:28`
- Create: `packages/cli/src/service-state.ts` (the `ServiceState` type, `writeServiceState`, and `serviceAuthToken`, moved out of `cli.ts` so a test can import them: `cli.ts` is the entry script and runs on import)
- Modify: `packages/cli/src/cli.ts` (`ServiceState` at `:54-62`, print sites at `:445`, `:470`, `:487`, `:490`, `:524`, `callServiceRpc` at `:979-983`, `writeServiceState` at `:748-752`, `serviceAuthToken` at `:1017-1023`)
- Modify: `packages/ui/src/web-client-bridge.ts:56-69` (`readWebAuthTokenFromUrl`)
- Modify: `docker/entrypoint.sh` (`:22`, `:34`, `:157`, `:204-207`)
- Modify: `docs/src/content/docs/en/guides/cli.md`, `docs/src/content/docs/en/guides/docker.md`, `docker/README.md`, `packages/cli/README.md`
- Test: `packages/core/test/unit/web/web-management-server.test.mjs`, `packages/cli/test/unit/service-state.test.mjs` (new), `tests/architecture/docker-management-security.test.mjs`, `tests/system/docker-smoke.mjs`, `tests/e2e/cli-web-runtime.ts` and the four specs that build the tokened URL

**Interfaces:**
- Produces, in `management-server.ts`:

```ts
export type WebManagementServerRuntime = {
  authToken: string;
  close: () => Promise<void>;
  openUrl: string;        // `${url}#llmr_web_token=${encodeURIComponent(authToken)}`
  server: Server;
  tokenGenerated: boolean; // false when the token came from options.authToken or LLMR_WEB_AUTH_TOKEN
  url: string;            // `http://<host>:<port>/`, never carries the token
};
export function describeWebManagementUrl(runtime: Pick<WebManagementServerRuntime, "openUrl" | "tokenGenerated" | "url">): string;
```

`describeWebManagementUrl` returns `openUrl` when `tokenGenerated`, otherwise `` `${url} (append #llmr_web_token=<your LLMR_WEB_AUTH_TOKEN> to sign in)` ``. It is the only way any line reaches stdout or stderr with a URL.
- Produces, in `packages/cli/src/service-state.ts`: `ServiceState` with two new members, `authToken: string` and `tokenGenerated: boolean`, and a `url` that holds no token; `writeServiceState(state: ServiceState, file: string): void`; `serviceAuthToken(state: Pick<ServiceState, "url"> & { authToken?: string }): string`.
- Consumed by Task 2: `startWebManagementServer` reads the token once, at the line Task 2 changes.

- [ ] **Step 1: Write the failing server tests** in `web-management-server.test.mjs`. Replace `"the management URL carries the token as llmr_web_token"` with:

```js
test("the runtime keeps the token out of its URL and offers one URL to open", async () => {
  const { startWebManagementServer } = await import("@llmr/core/web/management-server.ts");
  const authToken = "test-web-auth-token-0123456789abcdef";
  const runtime = await startWebManagementServer({ authToken, host: "127.0.0.1", port: 0, startGateway: false });
  try {
    assert.equal(new URL(runtime.url).search, "");
    assert.equal(new URL(runtime.url).hash, "");
    assert.equal(runtime.authToken, authToken);
    assert.equal(runtime.tokenGenerated, false);
    assert.equal(runtime.openUrl, `${runtime.url}#llmr_web_token=${authToken}`);
  } finally {
    await runtime.close();
  }
});

test("a supplied token is never part of what LLMR prints, a generated one is", async () => {
  const { describeWebManagementUrl } = await import("@llmr/core/web/management-server.ts");
  const url = "http://127.0.0.1:3458/";
  const openUrl = `${url}#llmr_web_token=secret-value`;
  assert.doesNotMatch(describeWebManagementUrl({ openUrl, tokenGenerated: false, url }), /secret-value/);
  assert.match(describeWebManagementUrl({ openUrl, tokenGenerated: false, url }), /#llmr_web_token=/);
  assert.equal(describeWebManagementUrl({ openUrl, tokenGenerated: true, url }), openUrl);
});

test("a token that needs escaping survives the open URL", async () => {
  const { startWebManagementServer } = await import("@llmr/core/web/management-server.ts");
  const authToken = "token with spaces & symbols #/? 0123456789";
  const runtime = await startWebManagementServer({ authToken, host: "127.0.0.1", port: 0, startGateway: false });
  try {
    assert.equal(new URLSearchParams(new URL(runtime.openUrl).hash.slice(1)).get("llmr_web_token"), authToken);
  } finally {
    await runtime.close();
  }
});
```

Every other test in the file that builds an endpoint from `runtime.url` keeps working, because `new URL("/api/llmr/rpc", runtime.url)` does not need the token in it. Change the tests that read the token back out of `runtime.url` to use `runtime.authToken`.

- [ ] **Step 2: Run them and see them fail**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/web/web-management-server.test.js`
Expected: the three new tests fail (`runtime.authToken` is undefined, `describeWebManagementUrl` is not a function).

- [ ] **Step 3: Implement the runtime shape and `describeWebManagementUrl`** in `management-server.ts`. `tokenGenerated` is true only when neither `options.authToken` nor the environment supplied a value. Replace `urlWithWebAuthToken` with a function that sets the fragment. `openSystemExternal` receives `openUrl`; the failure warning at `:171` prints `describeWebManagementUrl(...)`.

- [ ] **Step 4: Print through `describeWebManagementUrl`** at `entrypoints/server.ts:28` and `cli.ts:524`.

- [ ] **Step 5: Write the failing CLI state tests, then change `ServiceState`.** Tests in the new `packages/cli/test/unit/service-state.test.mjs`, importing from `@llmr/cli/service-state.ts` the way `stale-runtime.test.mjs` imports its module:

```js
test("service state stores the token apart from the URL", () => {
  // write a state through the same function runWebServer uses, read the file back
  assert.equal(new URL(saved.url).search, "");
  assert.equal(saved.authToken, "test-web-auth-token-0123456789abcdef");
  assert.equal(statSync(file).mode & 0o777, 0o600);
});

test("a state file from an older build still yields its token", () => {
  // { url: "http://127.0.0.1:3458/?llmr_web_token=old-token", pid, startedAt, startGateway, profileManaged }
  assert.equal(serviceAuthToken(legacyState), "old-token");
});
```

`serviceAuthToken` takes the state, returns `state.authToken`, and falls back to the query parameter of `state.url` only so that `llmr stop` can reach a daemon an older build started. That fallback is the one exception to "no compatibility path": it exists to stop a running process, and its comment says so. `callServiceRpc` uses it. The print sites at `:445`, `:470`, `:487` and `:490` print `describeWebManagementUrl` built from the state; `openManagementUrl` opens the fragment URL.

- [ ] **Step 6: The page reads the fragment.** In `web-client-bridge.ts`, `readWebAuthTokenFromUrl` parses `new URLSearchParams(window.location.hash.slice(1)).get("llmr_web_token")`, removes that parameter from the fragment with `history.replaceState`, and no longer looks at the query. Add a UI unit test beside the existing bridge tests if there are any (`packages/ui/test/unit/`); if the bridge has none, cover it in the e2e step.

- [ ] **Step 7: Docker.** In `docker/entrypoint.sh`: drop `LLMR_WEB_AUTH_TOKEN_QUERY` (`:22`, `:34`); the redirect at `:157` becomes `return 302 /pages/home/index.html;`; the line at `:206` prints `${LLMR_PUBLIC_BASE_URL%/}/#llmr_web_token=<url-encoded token>`, still only when the token was generated. Update `tests/architecture/docker-management-security.test.mjs` (it passes `LLMR_WEB_AUTH_TOKEN_QUERY` into the template and asserts the token is absent from the rendered config) and add to `tests/system/docker-smoke.mjs`:

```js
const logs = run("docker", ["logs", containerId]);
assert.ok(!logs.includes(token), "a token the user set must not appear in the container log");
const rootRedirect = await fetch(baseUrl, { redirect: "manual" });
assert.equal(new URL(rootRedirect.headers.get("location"), baseUrl).search, "", "the redirect carries no query");
```

The smoke test's existing checks of `?llmr_web_token=` on the redirect are removed with the behaviour.

- [ ] **Step 8: e2e.** `tests/e2e/cli-web-runtime.ts` and the specs that navigate to `/?llmr_web_token=` navigate to `/#llmr_web_token=`. Its `LLMR_WEB_AUTH_TOKEN` value becomes 32 characters or more now, so Task 2 does not have to touch it.

- [ ] **Step 9: Docs.** In the three guides and `packages/cli/README.md`: the URL form is `/#llmr_web_token=<token>`; a token you set is never printed, and you append it yourself; a generated token is printed once, to the terminal or the container log. Remove the sentences that describe Nginx passing the query through.

- [ ] **Step 10: Run everything in Global Constraints, then a live check.** Rebuild, start `llmr serve` once with no token and once with `LLMR_WEB_AUTH_TOKEN` set, and confirm from stdout: the first prints a fragment URL that signs in when opened in the built-in browser, the second prints no token and its page signs in after the fragment is appended.

- [ ] **Step 11: Commit, open the PR, ask the owner once for the merge.**

```bash
git commit -m "fix(web): keep the management token out of logs and the URL query"
```

---

### Task 2: Start-up refuses a weak token and an unintended exposure, and forgets the token

One PR.

**Files:**
- Modify: `packages/core/src/web/management-server.ts:139-146`, `WebManagementServerOptions` at `:101-107`
- Modify: `packages/core/src/routing/route-script-worker.ts:204-207` (`routeScriptEnvironment`)
- Modify: `packages/core/src/agents/bot-gateway/qr-login-service.ts:185-189`, and each spawn that passes `process.env` unfiltered: `agents/claude-app/launch.ts:71`, `agents/codex/app-launch.ts:618`, `agents/opencode/app-launch.ts:76`, `profiles/launch-service.ts:183`, `:1348`, `:1424`, `:1486` (re-check each with `grep -n "process.env" <file>` before editing; the line numbers are from 2026-11-18)
- Modify: `packages/cli/src/cli.ts` (option parsing near `:383-389`, help text at `:598-709`), `packages/core/src/entrypoints/server.ts` (its own option parsing and help)
- Modify: `docker/entrypoint.sh:19-20`
- Modify: `docs/src/content/docs/en/guides/cli.md`, `docs/src/content/docs/en/guides/docker.md`, `docker/README.md`
- Test: `packages/core/test/unit/web/web-management-server.test.mjs`, `packages/core/test/unit/routing/route-script-runtime.test.mjs`, `packages/cli/test/integration/cli-help.test.mjs`

**Interfaces:**
- Consumes: `withoutLlmrSecretEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv` from `packages/core/src/mcp/child-env.ts` (exists; strips `LLMR_*TOKEN`, `*SECRET`, `*PASSWORD`, `*API_KEY`).
- Produces: `WebManagementServerOptions.allowRemote?: boolean`; environment variable `LLMR_WEB_ALLOW_REMOTE=1`; CLI flag `--allow-remote` on `start`, `ui` and `serve`.

- [ ] **Step 1: Write the failing tests** in `web-management-server.test.mjs`:

```js
test("a token set in the environment must be at least 32 characters", async (t) => {
  const previous = process.env.LLMR_WEB_AUTH_TOKEN;
  t.after(() => setOptionalEnv("LLMR_WEB_AUTH_TOKEN", previous));
  const { startWebManagementServer } = await import("@llmr/core/web/management-server.ts");
  process.env.LLMR_WEB_AUTH_TOKEN = "short-token";
  await assert.rejects(startWebManagementServer({ host: "127.0.0.1", port: 0, startGateway: false }), /LLMR_WEB_AUTH_TOKEN must be at least 32 characters/);
});

test("the token is gone from the environment once the server has read it", async (t) => {
  const previous = process.env.LLMR_WEB_AUTH_TOKEN;
  t.after(() => setOptionalEnv("LLMR_WEB_AUTH_TOKEN", previous));
  const { startWebManagementServer } = await import("@llmr/core/web/management-server.ts");
  process.env.LLMR_WEB_AUTH_TOKEN = "test-web-auth-token-0123456789abcdef";
  const runtime = await startWebManagementServer({ host: "127.0.0.1", port: 0, startGateway: false });
  try {
    assert.equal(process.env.LLMR_WEB_AUTH_TOKEN, undefined);
    assert.equal(runtime.authToken, "test-web-auth-token-0123456789abcdef");
  } finally {
    await runtime.close();
  }
});

test("a non-loopback bind needs an explicit opt-in", async () => {
  const { startWebManagementServer } = await import("@llmr/core/web/management-server.ts");
  const authToken = "test-web-auth-token-0123456789abcdef";
  await assert.rejects(startWebManagementServer({ authToken, host: "0.0.0.0", port: 0, startGateway: false }), /--allow-remote/);
  const runtime = await startWebManagementServer({ allowRemote: true, authToken, host: "0.0.0.0", port: 0, startGateway: false });
  await runtime.close();
});
```

and in `route-script-runtime.test.mjs`, a script that returns `api.env("LLMR_SERVICE_INSTANCE_TOKEN")` with that variable set in the test's environment, asserting the script sees `undefined` while `api.env("PATH")` is still a string.

The existing wildcard-bind test in `web-management-server.test.mjs` (`host: "0.0.0.0"`) gains `allowRemote: true`.

- [ ] **Step 2: Run them and see them fail.** Same command as Task 1 Step 2, plus the route script file.

- [ ] **Step 3: Implement in `startWebManagementServer`,** in this order: read the environment token; throw `LLMR_WEB_AUTH_TOKEN must be at least 32 characters.` if it is set and shorter (a token passed as `options.authToken` is not checked: that path is LLMR's own code and its tests); `delete process.env.LLMR_WEB_AUTH_TOKEN`; then, if the host is not one of `localhost`, `127.0.0.1`, `::1` and neither `options.allowRemote` nor `LLMR_WEB_ALLOW_REMOTE=1` is set, throw `Refusing to listen on <host>: the management token is full access to this machine. Pass --allow-remote or set LLMR_WEB_ALLOW_REMOTE=1 to expose it.` Both throws happen before `listen`.

- [ ] **Step 4: Filter the environment handed on.** `routeScriptEnvironment` and each spawn listed under Files pass `withoutLlmrSecretEnv(...)` instead of `process.env`. `LLMR_INTERNAL_*` names do not match the filter and still reach agent launches.

- [ ] **Step 5: CLI and server flags.** `--allow-remote` sets the option; the daemon parent passes it to the child (the argument list at `cli.ts:418-427`). Help text for `--host` says a non-loopback host needs it. Update the snapshot in `cli-help.test.mjs`.

- [ ] **Step 6: Docker.** `entrypoint.sh:19-20` exits 1 with the same message instead of warning. The container's server binds `127.0.0.1`, so it needs no `LLMR_WEB_ALLOW_REMOTE`.

- [ ] **Step 7: Docs.** The `0.0.0.0` paragraph in the CLI guide names `--allow-remote`. The environment tables gain `LLMR_WEB_ALLOW_REMOTE` and say `LLMR_WEB_AUTH_TOKEN` must be 32 characters or more.

- [ ] **Step 8: Run everything in Global Constraints. Commit, open the PR, ask the owner once for the merge.**

```bash
git commit -m "fix(web): refuse a short token and an unrequested remote bind"
```

---

### Task 3: Framing and referrer headers

One PR, small.

**Files:**
- Modify: `packages/core/src/web/management-server.ts:632-644` (`sendBuffer`)
- Modify: `docker/entrypoint.sh` (the `server` block, which serves the page itself)
- Test: `packages/core/test/unit/web/web-management-server.test.mjs`, `tests/architecture/docker-management-security.test.mjs`, `tests/system/docker-smoke.mjs`

**Interfaces:** none.

- [ ] **Step 1: Write the failing tests.** Server: a `GET /` on a started runtime returns `content-security-policy: frame-ancestors 'none'` and `referrer-policy: no-referrer`, and so does a `401` from `/api/llmr/rpc`. Architecture: the rendered Nginx config contains `add_header Content-Security-Policy "frame-ancestors 'none'" always;` and `add_header Referrer-Policy "no-referrer" always;`. Smoke: `fetch(baseUrl + "/pages/home/index.html")` carries both headers.

- [ ] **Step 2: Run them and see them fail.**

- [ ] **Step 3: Add the two headers** in `sendBuffer` (every response goes through it) and the two `add_header` lines in the Nginx `server` block. The page's own `<meta>` policy stays; `frame-ancestors` is ignored in a meta tag, which is why it has to be a header.

- [ ] **Step 4: Run the tests, then everything in Global Constraints. Commit, open the PR, ask the owner once for the merge.**

```bash
git commit -m "fix(web): forbid framing the management UI and stop sending a referrer"
```

---

### Task 4: Masking covers the credential names it misses

One PR. Independent of Tasks 1 to 3.

**Files:**
- Modify: `packages/core/src/web/provider-secrets.ts:16-21` (`isSecretField`), `:47-55` (`redact`), `:86-103` (`restore`)
- Test: `packages/core/test/unit/web/provider-secrets.test.mjs`

**Interfaces:**
- Produces: `isSecretField(key: string, parentKey?: string): boolean`, still private to the module.

- [ ] **Step 1: Write the failing tests** in `provider-secrets.test.mjs`:

```js
test("credential names the first rule missed are hidden", () => {
  const names = ["Ocp-Apim-Subscription-Key", "privateKey", "private_key", "access_key", "secretAccessKey", "AWS_SECRET_ACCESS_KEY", "sessionToken", "authToken", "bearerToken", "botToken", "appSecret", "secret_key", "x-auth-key", "OPENAI_KEY", "GITHUB_PAT"];
  const config = { Providers: [{ extraHeaders: Object.fromEntries(names.map((name) => [name, `value-of-${name}`])), id: "p", name: "P" }] };
  const masked = redactWebConfig(config);
  for (const name of names) {
    assert.doesNotMatch(masked.Providers[0].extraHeaders[name], /value-of-/, name);
  }
  assert.deepEqual(restoreWebConfigSecrets(masked), config);
});

test("a key in a URL query object is a credential, a key elsewhere is not", () => {
  const config = { providerPlugins: [{ auth: { query: { key: "gemini-key", alt: "sse" } }, key: "llmr-local-agent-opencode", name: "plugin" }] };
  const masked = redactWebConfig(config);
  assert.doesNotMatch(JSON.stringify(masked), /gemini-key/);
  assert.equal(masked.providerPlugins[0].key, "llmr-local-agent-opencode");
  assert.equal(masked.providerPlugins[0].auth.query.alt, "sse");
  assert.deepEqual(restoreWebConfigSecrets(masked), config);
});

test("names that only look like credentials stay readable", () => {
  const readable = { apiKeyHelper: "helper", auth: "provider-api-key", authMode: "api-key", authScheme: "Bearer", keyFile: "/path", max_tokens: 1, maxTokens: 2, monkey: "x", passwordless: true, token_limit: 3, tokenizer: "cl100k", tokens: 4 };
  const config = { Providers: [{ ...readable, id: "p", name: "P" }] };
  assert.deepEqual(redactWebConfig(config), config);
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/web/provider-secrets.test.js`
Expected: the first two fail; the third passes already and must keep passing.

- [ ] **Step 3: Replace the three patterns in `isSecretField` with one rule.** This exact rule was run against both name lists above on 2026-11-18 and hides every name in the first and none in the third:

```ts
function isSecretField(key: string, parentKey?: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_]/g, "");
  return ["authorization", "proxyauthorization", "cookie", "setcookie"].includes(normalized) ||
    /(?:token|secret|password|apikey|privatekey|accesskey|secretkey|subscriptionkey|authkey)$/.test(normalized) ||
    /^[A-Z0-9]+(?:_[A-Z0-9]+)*_(?:KEY|PAT)$/.test(key) ||
    (key === "key" && parentKey === "query");
}
```

`redact` and `restore` pass the key of the enclosing record down as `parentKey`. The upper-case rule is for environment-variable names (`OPENAI_KEY`, `GITHUB_PAT`); it will also mask a name such as `CACHE_KEY`, which costs nothing because a masked value round-trips.

- [ ] **Step 4: Run the tests, then `npm run test:core`.**

- [ ] **Step 5: Update the documents that list the gap.** In the research document's Part 3, replace the "Not matched" bullet and the "concrete case" bullet with one line saying both were closed by this task and naming its PR. In the three guides, the list of masked field names gains "private keys, access keys and session tokens".

- [ ] **Step 6: Commit, open the PR, ask the owner once for the merge.**

```bash
git commit -m "fix(web): mask the credential names the first rule missed"
```

---

## After the last task

- [ ] Move this plan to `docs/superpowers/plans/completed/` and repoint the two references to it (the review log's follow-up 4 and the handoff).
- [ ] In the review log (`docs/superpowers/upstream-review/reviews/2026-11-16-review.md`), mark open follow-up 4 as done under direction (a), with the four PR links, and state that directions (b) and (c) were declined on 2026-11-18 and why.
- [ ] In the research document, add a short "Outcome" section at the top: direction (a) chosen, the four PRs, and the token leak that Task 1 fixed (the Docker log printing a supplied token), which was held out of the document until then (decision T-3).
- [ ] Release notes need: the URL form is now `/#llmr_web_token=<token>`; a token you set must be 32 characters or more and is never printed; `--host` with a non-loopback address needs `--allow-remote`.

## Not in this plan

- Directions (b) and (c) of the research document (decision T-1).
- Telling upstream. Its tree at `da96d5df` has the same handlers behind the same kind of token; whether to tell them is the owner's call and needs no code.
- The Electron desktop path, which uses IPC and was not examined.
- A number or boolean under a credential field, which stays unmasked: no such value is known to occur.
- Leaving the GitHub fork network. It is the only way to make the repository private and would stop GitHub disabling workflows "on this fork", but it is permanent and a repository-level decision.
