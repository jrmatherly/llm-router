# Web Management Token Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The web management token is documented as full administrative access, and LLMR stops writing it where someone who should not hold it can read it.

**Architecture:** The server returns the token as its own value and never puts it in a URL query. A token LLMR generated is offered once in a URL fragment, which no server or proxy logs. A token the user supplied is never printed or placed in any URL: the page asks for it. Start-up refuses a short supplied token and a non-loopback bind without an explicit opt-in, and LLMR's own secrets are filtered out of the environment of the processes it starts. The masking of provider credentials gains the key names it misses.

**What the fragment does and does not do.** It keeps the token out of server, Nginx and reverse-proxy access logs and out of the `Referer` header. It does not keep it out of the terminal or container log where LLMR prints it, the process list while the OS opener runs, or the browser's history entry for the first load. Docs written under this plan say "may remain in browser history", not that it is gone.

**Tech Stack:** TypeScript, `node:http`, `node:test` with `node:assert/strict`, Nginx (Docker image), Playwright (`tests/e2e`).

**Spec:** [`docs/superpowers/research/2026-11-19-web-management-token-scope.md`](../research/2026-11-19-web-management-token-scope.md), direction (a) in its Part 4. Read its "Answer in short", Part 3 and Part 4(a) before any task. The decisions below settle what that document leaves open.

**Review history.** Audited on 2026-11-19 by two independent passes, one against the code line by line and one on the design. The first found two blockers in Task 1 (`readServiceState` dropped the new fields; the e2e helper read the token from stdout), both fixed here. The second replaced the hand-built tokened URL with a sign-in prompt in the page.

## Decisions

| # | Decision | Who, when |
|---|---|---|
| T-1 | Direction (a): the token is full administrative access by design. No address check on probes or on `saveConfig` (direction c), and no guard on command-starting config (direction b). | Owner, 2026-11-18: asked for this plan after direction (a) was recommended with this task list |
| T-2 | The work is hardening how the token is exposed, in the order of this plan, with the token-printing bug first. | Owner, 2026-11-18 |
| T-3 | The research document stays in the public repository. A finding that helps someone who does not hold the token is not added to it until its fix has merged. | Plan author's recommendation, 2026-11-18. The owner read it and asked for this plan; he has not confirmed this line in words |
| T-4 | No logging of or delay on a wrong token. With Task 2's minimum of 32 characters online guessing is not feasible, and a per-request log line is a flooding risk. The comparison is already constant-time (`management-server.ts:808-815`). | Plan author; reverse it if the owner wants failed attempts visible |
| T-5 | Trusted loopback origins on any port stay trusted. A page on another local port still needs the token, and `sessionStorage` is per origin. This follows from T-1. | Plan author, from the 2026-11-18 code read |
| T-6 | No fallback for a `service.json` written by an older build (`AGENTS.md`: no compatibility path). Stop a running daemon before upgrading; otherwise end it by the `pid` in `~/.llm-router/service.json`. | Plan author, from `AGENTS.md` |
| T-7 | The page asks for the token when it has none or the server rejects it. A supplied token is therefore never printed and never needs a URL. | Plan author, from the 2026-11-19 design review |
| T-8 | `--allow-remote` is an explicit opt-in for a non-loopback bind. It guards the CLI path only: in Docker the server binds loopback inside the container and the user publishes Nginx, which no flag covers. | Plan author; the alternative considered was requiring `LLMR_PUBLIC_BASE_URL` for a remote bind |

## Global Constraints

- The fork has no consumers. No compatibility path: the query-string form `?llmr_web_token=` is removed, not kept beside the fragment form.
- Never weigh upstream parity.
- Double quotes, semicolons, two-space indent. Object keys and type members alphabetized where the surrounding file does it. No comments except a non-obvious why.
- Tests are `node:test` with `node:assert/strict`, named by behaviour.
- One test file: `node build/test.mjs <pkg> && node --test .test-dist/<pkg>/test/<unit|integration>/<path>.test.js`. Architecture: `node build/test.mjs architecture && node --test .test-dist/architecture/test/<name>.test.js`.
- `npm run build:assets` and `npm run test:e2e` rewrite `packages/core/models.json` and `packages/ui/src/generated`. Restore them afterwards: `git checkout -- packages/core/models.json packages/ui/src/generated`. `npm run test:e2e` needs `npm run test:e2e:install` once per install.
- A live check needs a fresh build (`npm run build:assets`); a stale `dist/` reports old behaviour.
- Each task is one branch and one squash-merged PR. Before each PR: `npm run typecheck`, `npm run lint`, `npm run test:architecture`, the package suites the task touches, and for Tasks 1 to 3 `npm run test:system` (needs Docker; `orbctl start`) and `npm run test:e2e`.
- Merging needs the owner's word, once per PR.
- Test tokens are at least 32 characters. The standard one in this plan is `"test-web-auth-token-0123456789abcdef"`.
- Names used across tasks: URL fragment parameter `llmr_web_token`, header `x-llmr-web-auth`, `sessionStorage` key `llmr.webAuthToken`, environment variables `LLMR_WEB_AUTH_TOKEN` and `LLMR_WEB_ALLOW_REMOTE`, CLI flag `--allow-remote`.

## Review Focus

1. **A user who set `LLMR_WEB_AUTH_TOKEN` opens the printed URL.** They must get a field to enter the token, and the page must work after they do. Task 1 Step 7 builds the prompt and Step 9's e2e signs in through it.
2. **A second tab, a bookmark, or a reload after the browser cleared session data.** The token is per tab. The page must ask for it, not show a bare "missing or invalid" error. Same prompt; Task 1 Step 9 opens a page without the fragment.
3. **A token with `+`, `&`, `#` or a space in it.** The smoke test's own token has them. The fragment must carry it exactly, and so must the prompt. Task 1 Steps 1 and 6.
4. **A user runs `--host 0.0.0.0` as the docs told them to.** The process must exit with a message that names the flag, not start on loopback or hang. Task 2.
5. **A provider config holds a field whose name ends in `token` but is not a credential.** It must stay readable in the web UI. Task 4 pins the fork's real names; the rule was run against all 692 key names in `contracts/app.ts` on 2026-11-19 and newly masked none that is not a credential.

---

### Task 1: The token leaves the query string, and a supplied token is never printed

One PR. This fixes the confirmed bug: `docker logs` shows a token the user set themselves (run on 2026-11-18: `LLMR core server is running at http://127.0.0.1:3459/?llmr_web_token=<token>`), while `docker/entrypoint.sh:204` and the Docker guide say only a generated token is printed.

**Files:**
- Modify: `packages/core/src/web/management-server.ts` (`WebManagementServerRuntime` at `:109-113`, `startWebManagementServer` at `:140-182`, `urlWithWebAuthToken` at `:693-697`)
- Modify: `packages/core/src/entrypoints/server.ts:28`
- Create: `packages/cli/src/service-state.ts`: the `ServiceState` type, `readServiceState`, `writeServiceState` and `serviceAuthToken`, moved out of `cli.ts` so a test can import them (`cli.ts` is the entry script and runs on import; `stale-runtime.ts` and its test are the precedent)
- Modify: `packages/cli/src/cli.ts` (`ServiceState` at `:54-62`, print sites at `:445`, `:470`, `:487`, `:490`, `:524`, `readServiceState` at `:723-744`, `writeServiceState` at `:748-751`, `callServiceRpc` at `:979-983`, `serviceAuthToken` at `:1017-1023`)
- Modify: `packages/ui/src/web-client-bridge.ts` (`webAuthToken` at `:7`, `rpc` at `:13-37`, `readWebAuthTokenFromUrl` at `:56-69`)
- Modify: `docker/entrypoint.sh` (`:22`, `:34`, `:157`, `:204-207`)
- Modify: `docs/src/content/docs/en/guides/cli.md`, `docs/src/content/docs/en/guides/docker.md`, `docker/README.md`, `packages/cli/README.md`
- Test: `packages/core/test/unit/web/web-management-server.test.mjs`, `packages/cli/test/unit/service-state.test.mjs` (new), `tests/architecture/docker-management-security.test.mjs`, `tests/system/docker-smoke.mjs`, `tests/e2e/cli-web-runtime.ts`, and the five specs `cli-web`, `provider-edit`, `recent-issues`, `opencode-go-import`, `local-agent-login-import`

**Interfaces:**
- Produces, in `management-server.ts`:

```ts
export type WebManagementServerRuntime = {
  authToken: string;
  close: () => Promise<void>;
  openUrl: string;         // url + "#llmr_web_token=" + encodeURIComponent(authToken) when tokenGenerated, else url
  server: Server;
  tokenGenerated: boolean; // false when the token came from options.authToken or LLMR_WEB_AUTH_TOKEN
  url: string;             // "http://<host>:<port>/", never carries the token
};
export function describeWebManagementUrl(runtime: Pick<WebManagementServerRuntime, "openUrl" | "tokenGenerated" | "url">): string;
```

`describeWebManagementUrl` returns `openUrl` when `tokenGenerated`, otherwise `` `${url} (sign in with your LLMR_WEB_AUTH_TOKEN)` ``. Every line LLMR writes to stdout or stderr with a management URL goes through it.
- Produces, in `packages/cli/src/service-state.ts`:

```ts
export type ServiceState = { authToken: string; host?: string; pid: number; profileManaged: boolean; serviceToken?: string; startedAt: string; startGateway: boolean; tokenGenerated: boolean; url: string };
export function readServiceState(file: string): ServiceState | undefined; // undefined when pid, url or authToken is missing
export function writeServiceState(state: ServiceState, file: string): void; // mode 0600
export function serviceAuthToken(state: Pick<ServiceState, "authToken">): string;
```

- Consumed by Task 2: `startWebManagementServer` reads the environment token once, at `:146`.

- [ ] **Step 1: Write the failing server tests** in `web-management-server.test.mjs`. Replace `"the management URL carries the token as llmr_web_token"` with:

```js
test("the runtime keeps the token out of its URL", async () => {
  const { startWebManagementServer } = await import("@llmr/core/web/management-server.ts");
  const authToken = "test-web-auth-token-0123456789abcdef";
  const runtime = await startWebManagementServer({ authToken, host: "127.0.0.1", port: 0, startGateway: false });
  try {
    assert.equal(new URL(runtime.url).search, "");
    assert.equal(new URL(runtime.url).hash, "");
    assert.equal(runtime.authToken, authToken);
    assert.equal(runtime.tokenGenerated, false);
    assert.equal(runtime.openUrl, runtime.url, "a supplied token is not put in any URL");
  } finally {
    await runtime.close();
  }
});

test("a generated token is offered once, in the fragment, and survives escaping", async () => {
  const { startWebManagementServer } = await import("@llmr/core/web/management-server.ts");
  const runtime = await startWebManagementServer({ host: "127.0.0.1", port: 0, startGateway: false });
  try {
    assert.equal(runtime.tokenGenerated, true);
    assert.equal(new URL(runtime.openUrl).search, "");
    assert.equal(decodeURIComponent(new URL(runtime.openUrl).hash.slice("#llmr_web_token=".length)), runtime.authToken);
  } finally {
    await runtime.close();
  }
});

test("a supplied token is never part of what LLMR prints, a generated one is", async () => {
  const { describeWebManagementUrl } = await import("@llmr/core/web/management-server.ts");
  const url = "http://127.0.0.1:3458/";
  const openUrl = `${url}#llmr_web_token=secret-value`;
  assert.equal(describeWebManagementUrl({ openUrl: url, tokenGenerated: false, url }), `${url} (sign in with your LLMR_WEB_AUTH_TOKEN)`);
  assert.equal(describeWebManagementUrl({ openUrl, tokenGenerated: true, url }), openUrl);
});
```

The generated-token test must run with `LLMR_WEB_AUTH_TOKEN` unset; clear and restore it with the file's `setOptionalEnv` helper. Tests that build an endpoint with `new URL("/api/llmr/rpc", runtime.url)` keep working. Change any test that reads the token back out of `runtime.url` to use `runtime.authToken`.

- [ ] **Step 2: Run them and see them fail**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/web/web-management-server.test.js`
Expected: the three new tests fail (`runtime.authToken` is undefined, `describeWebManagementUrl` is not a function).

- [ ] **Step 3: Implement the runtime shape and `describeWebManagementUrl`** in `management-server.ts`. `tokenGenerated` is true only when neither `options.authToken` nor the environment supplied a value. Replace `urlWithWebAuthToken` with a function that builds the fragment form. `openSystemExternal` receives `openUrl` (it passes `URL.toString()` to `open`, `xdg-open` or `rundll32 url.dll,FileProtocolHandler` as one argument, which keeps a fragment on macOS and Linux; Windows is not verified, see Step 11). The failure warning at `:171` prints `describeWebManagementUrl(...)`.

- [ ] **Step 4: Print through `describeWebManagementUrl`** at `entrypoints/server.ts:28` and `cli.ts:524`.

- [ ] **Step 5: Write the failing CLI state tests, then move and change the state helpers.** In the new `packages/cli/test/unit/service-state.test.mjs`, importing from `@llmr/cli/service-state.ts`:

```js
test("service state round-trips the token apart from the URL", () => {
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), "llmr-service-state-")), "service.json");
  const state = { authToken: "test-web-auth-token-0123456789abcdef", pid: process.pid, profileManaged: false, startedAt: "2026-11-19T00:00:00.000Z", startGateway: true, tokenGenerated: true, url: "http://127.0.0.1:3458/" };
  writeServiceState(state, file);
  assert.equal(statSync(file).mode & 0o777, 0o600);
  const read = readServiceState(file);
  assert.deepEqual(read, state);
  assert.equal(serviceAuthToken(read), state.authToken);
});

test("a state file without a token is not a usable state", () => {
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), "llmr-service-state-")), "service.json");
  writeFileSync(file, JSON.stringify({ pid: process.pid, startedAt: "", url: "http://127.0.0.1:3458/?llmr_web_token=old" }));
  assert.equal(readServiceState(file), undefined);
});
```

`readServiceState` today rebuilds the state one field at a time (`cli.ts:723-744`), so a field it does not name is lost on every read: it must name `authToken` and `tokenGenerated`. `cli.ts` keeps thin wrappers that pass `serviceStateFile()`. `runWebServer` writes `authToken: runtime.authToken`, `tokenGenerated: runtime.tokenGenerated`, `url: runtime.url`. `callServiceRpc` takes the token from `serviceAuthToken(state)`. The print sites at `:445`, `:470`, `:487` and `:490` print `describeWebManagementUrl` built from the state, and `openManagementUrl` opens the fragment URL when the token was generated and the plain URL otherwise.

- [ ] **Step 6: The page reads the fragment.** In `web-client-bridge.ts`, `readWebAuthTokenFromUrl` takes the raw text after `llmr_web_token=` in `window.location.hash`, up to the next `&`, and runs it through `decodeURIComponent` (not `URLSearchParams`, which turns `+` into a space). It removes that parameter with `history.replaceState`, writing no trailing `#` when the fragment ends up empty, and no longer looks at the query.

- [ ] **Step 7: The page asks for the token (decision T-7).** `webAuthToken` at `:7` becomes mutable. Add to the bridge:

```ts
function requestWebAuthToken(message: string): Promise<never>; // shows the prompt; on submit stores the token and reloads
```

It builds a `<dialog>` with one `<input type="password" autocomplete="off">`, a submit button and `message`, using DOM calls only (the page's policy is `script-src 'self'` and allows inline styles). On submit it writes the trimmed value to `sessionStorage` under `llmr.webAuthToken` and calls `location.reload()`. One dialog at a time: a second call while one is open returns the same promise. `rpc` calls it when there is no token before the request, with `"Enter the LLMR management token."`, and when a response is `401`, with `"That token was not accepted. Enter the LLMR management token."` after removing the stored token. The bridge has no unit tests today; Step 9 covers this.

- [ ] **Step 8: Docker.** In `docker/entrypoint.sh`: the redirect at `:157` becomes `return 302 /pages/home/index.html;`. `LLMR_WEB_AUTH_TOKEN_QUERY` is no longer exported (`:34`); keep the encoding at `:22` as a local used only by the line at `:206`, which prints `${LLMR_PUBLIC_BASE_URL%/}/#llmr_web_token=<encoded token>`, still only when the token was generated. Update `tests/architecture/docker-management-security.test.mjs` (it passes `LLMR_WEB_AUTH_TOKEN_QUERY` into the rendered template). In `tests/system/docker-smoke.mjs`, remove the checks of `?llmr_web_token=` on the redirect (`:76-79`) and add:

```js
const logs = run("docker", ["logs", containerId]);
assert.ok(!logs.includes(token), "a token the user set must not appear in the container log");
const rootRedirect = await fetch(baseUrl, { redirect: "manual" });
assert.equal(new URL(rootRedirect.headers.get("location"), baseUrl).search, "", "the redirect carries no query");
```

- [ ] **Step 9: e2e.** `tests/e2e/cli-web-runtime.ts:77-93` parses the token out of the stdout line and throws when it is empty; after this task that line holds no token. The helper returns the `authToken` it was given and takes only the base URL from stdout. Give each spec's token constant 32 characters or more now (`cli-web.spec.ts:8`, `local-agent-login-import.spec.ts:4`, `opencode-go-import.spec.ts:4`, `provider-edit.spec.ts:10`, and the one in `recent-issues.spec.ts`), so Task 2 does not have to return to them. Every `page.goto` of `/?llmr_web_token=` becomes `/#llmr_web_token=${encodeURIComponent(token)}`, including `recent-issues.spec.ts:74`, which loads `/pages/tray/index.html`. Add to `cli-web.spec.ts`:

```ts
test("the page asks for the token when the URL carries none", async ({ page }) => {
  await page.goto(`${current.baseUrl}/`);
  await page.getByRole("dialog").locator("input[type=password]").fill(current.token);
  await page.getByRole("dialog").getByRole("button").click();
  await expect(page.getByText("Providers")).toBeVisible();
});

test("a wrong token is asked for again", async ({ page }) => {
  await page.goto(`${current.baseUrl}/#llmr_web_token=wrong-token-0123456789-0123456789`);
  await expect(page.getByRole("dialog")).toContainText("not accepted");
});
```

- [ ] **Step 10: Docs.** In the three guides and `packages/cli/README.md`: a generated token is printed once, in a URL of the form `/#llmr_web_token=<token>`, to the terminal or the container log; a token you set is never printed and never goes in a URL, the page asks for it; the token is per browser tab, so a new tab asks again; the fragment keeps the token out of server and proxy logs but it may remain in browser history. Remove the sentences that describe Nginx passing the query through. Add to the upgrade notes: stop a running daemon before upgrading (decision T-6).

- [ ] **Step 11: Run everything in Global Constraints, then a live check.** Rebuild. Start `llmr serve` once with no token and once with `LLMR_WEB_AUTH_TOKEN` set to a 32-character value containing `+` and `&`. Confirm from stdout that the first prints a fragment URL and the second prints no token. In the built-in browser, the first URL signs in directly, and the second shows the prompt and signs in after the token is typed. Run `llmr start` then `llmr stop` and confirm the daemon stops. Record in the PR that Windows was not checked: whether `rundll32 url.dll,FileProtocolHandler` keeps a `#fragment` is unknown, and if it does not, a Windows user gets the prompt and must copy the token from the terminal.

- [ ] **Step 12: Commit, open the PR, ask the owner once for the merge.**

```bash
git commit -m "fix(web): keep the management token out of logs and the URL query"
```

---

### Task 2: Start-up refuses a weak token and an unrequested remote bind, and children do not inherit LLMR's secrets

One PR.

**Files:**
- Modify: `packages/core/src/web/management-server.ts:140-146`, `WebManagementServerOptions` at `:101-107`
- Modify: `packages/core/src/routing/route-script-worker.ts:204-207` (`routeScriptEnvironment`)
- Modify the `...process.env` spread, and only that spread, at: `agents/bot-gateway/qr-login-service.ts:186`, `agents/claude-app/launch.ts:71`, `agents/codex/app-launch.ts:618`, `agents/opencode/app-launch.ts:76`, `profiles/launch-service.ts:183`, `:1348`, `:1424`, `:1486` (paths under `packages/core/src/`; re-check each with `grep -n "process.env" <file>`, the line numbers are from 2026-11-19)
- Modify: `packages/cli/src/cli.ts` (option parsing near `:383-389`, child arguments at `:418-427`, help text at `:598-709`), `packages/core/src/entrypoints/server.ts` (its own option parsing and help)
- Modify: `docker/entrypoint.sh:19-20`
- Modify: `docs/src/content/docs/en/guides/cli.md`, `docs/src/content/docs/en/guides/docker.md`, `docker/README.md`
- Test: `packages/core/test/unit/web/web-management-server.test.mjs`, `packages/core/test/unit/routing/route-script-runtime.test.mjs`, `packages/cli/test/integration/cli-help.test.mjs`, `tests/system/docker-smoke.mjs:12`

**Interfaces:**
- Consumes: `withoutLlmrSecretEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv` from `packages/core/src/mcp/child-env.ts` (exists; removes names matching `/^LLMR_\w*(TOKEN|SECRET|PASSWORD|API_KEY)/`).
- Produces: `WebManagementServerOptions.allowRemote?: boolean`; environment variable `LLMR_WEB_ALLOW_REMOTE=1`; CLI flag `--allow-remote` on `start`, `ui` and `serve`.

- [ ] **Step 1: Write the failing tests** in `web-management-server.test.mjs`:

```js
test("a token set in the environment must be at least 32 characters", async (t) => {
  const previous = process.env.LLMR_WEB_AUTH_TOKEN;
  t.after(() => setOptionalEnv("LLMR_WEB_AUTH_TOKEN", previous));
  const { startWebManagementServer } = await import("@llmr/core/web/management-server.ts");
  process.env.LLMR_WEB_AUTH_TOKEN = "short-token";
  await assert.rejects(startWebManagementServer({ host: "127.0.0.1", port: 0, startGateway: false }), /LLMR_WEB_AUTH_TOKEN must be at least 32 characters.*openssl rand -base64 32/);
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
    assert.equal(runtime.tokenGenerated, false);
  } finally {
    await runtime.close();
  }
});

test("a non-loopback bind needs an explicit opt-in", async () => {
  const { startWebManagementServer } = await import("@llmr/core/web/management-server.ts");
  const authToken = "test-web-auth-token-0123456789abcdef";
  for (const host of ["0.0.0.0", "192.0.2.1", "127.0.0.2"]) {
    await assert.rejects(startWebManagementServer({ authToken, host, port: 0, startGateway: false }), /--allow-remote/, host);
  }
  for (const host of ["127.0.0.1", "localhost", "LOCALHOST", "::1", "[::1]"]) {
    const runtime = await startWebManagementServer({ authToken, host, port: 0, startGateway: false });
    await runtime.close();
  }
  const remote = await startWebManagementServer({ allowRemote: true, authToken, host: "0.0.0.0", port: 0, startGateway: false });
  await remote.close();
});
```

and in `route-script-runtime.test.mjs`, a script that returns `[api.env("LLMR_SERVICE_INSTANCE_TOKEN"), typeof api.env("PATH")]` with that variable set in the test's environment, asserting `[undefined, "string"]`.

The existing wildcard-bind test in `web-management-server.test.mjs` (`host: "0.0.0.0"`) gains `allowRemote: true`.

- [ ] **Step 2: Run them and see them fail.** Same command as Task 1 Step 2, plus the route script file.

- [ ] **Step 3: Implement in `startWebManagementServer`,** in this order and all before `listen`:
  1. Read the environment token. If it is set and shorter than 32 characters, throw `LLMR_WEB_AUTH_TOKEN must be at least 32 characters. Generate one with: openssl rand -base64 32`. A token passed as `options.authToken` is not checked: no CLI flag sets it, only LLMR's own code and tests do.
  2. `delete process.env.LLMR_WEB_AUTH_TOKEN`.
  3. If `normalizeHostname(host)` (`:824`) is not in `loopbackWebCorsHosts` (`localhost`, `127.0.0.1`, `::1`, `0:0:0:0:0:0:0:1`) and neither `options.allowRemote` nor `LLMR_WEB_ALLOW_REMOTE=1` is set, throw `Refusing to listen on <host>: the management token is full access to this machine. Only localhost, 127.0.0.1 and ::1 are local. Pass --allow-remote or set LLMR_WEB_ALLOW_REMOTE=1 to expose it.`

  What the delete is worth: it removes the token from what a later child of this process inherits. It does not remove it from `/proc/<pid>/environ`, from `docker inspect`, or from processes the Docker entrypoint started before the server (the entrypoint exports it at `:33`). Step 4 is the part that protects children. After the delete, a second `startWebManagementServer` call in the same process generates a random token unless it is given one; nothing in LLMR starts two.

- [ ] **Step 4: Filter the environment handed on.** `routeScriptEnvironment` reads from `withoutLlmrSecretEnv()`. At each spawn listed under Files, replace the `...process.env` spread with `...withoutLlmrSecretEnv()` and leave the rest of the object alone: `agents/codex/app-launch.ts:651` adds `LLMR_PROFILE_API_KEY` on purpose, and filtering the merged object would drop it. `LLMR_INTERNAL_*` names do not match the filter. One name does and is read by a launched agent: `LLMR_REMOTE_SYNC_API_KEY` (`cli-middleware-runtime-source.runtime.cjs:5139`). It is not documented; say in the PR that a user who exported it in their shell no longer passes it to launched agents.

- [ ] **Step 5: CLI and server flags.** `--allow-remote` sets the option, and the daemon parent passes it to the child in the argument list at `cli.ts:418-427`. Help text for `--host` says a non-loopback host needs it. `cli-help.test.mjs` has no snapshot; add an `assert.match(output, /--allow-remote/)` beside its existing matches.

- [ ] **Step 6: Docker.** `entrypoint.sh:19-20` prints the same message to stderr and exits 1 instead of warning. `tests/system/docker-smoke.mjs:12` defaults its token to `"token+/&=#?"` (11 characters): lengthen it to 32 or more and keep those special characters. The container's server binds `127.0.0.1`, so the image needs no `LLMR_WEB_ALLOW_REMOTE`; setting `LLMR_WEB_HOST` to another address now makes the container refuse to start, and the env table says so.

- [ ] **Step 7: Docs.** The `0.0.0.0` paragraph in the CLI guide names `--allow-remote`. The environment tables gain `LLMR_WEB_ALLOW_REMOTE`, say `LLMR_WEB_AUTH_TOKEN` must be 32 characters or more with the `openssl` line, and (`docker/README.md:202`) say `LLMR_WEB_HOST` must stay loopback in the image. State decision T-8's limit: in Docker, what you publish with `-p` is what is exposed, and no LLMR flag checks it.

- [ ] **Step 8: Run everything in Global Constraints. Commit, open the PR, ask the owner once for the merge.**

```bash
git commit -m "fix(web): refuse a short token and an unrequested remote bind"
```

---

### Task 3: Framing and referrer headers

One PR, small.

**Files:**
- Modify: `packages/core/src/web/management-server.ts`: `sendBuffer` (`:632-644`), `sendJson` (`:646-655`) and the OPTIONS `204` (`:201`) each write their own headers today
- Modify: `docker/entrypoint.sh` (the `server` block, which serves the page itself)
- Modify: `docs/src/content/docs/en/guides/docker.md` (one line, Step 3)
- Test: `packages/core/test/unit/web/web-management-server.test.mjs`, `tests/architecture/docker-management-security.test.mjs`, `tests/system/docker-smoke.mjs`

**Interfaces:**
- Produces: `const webSecurityHeaders` in `management-server.ts`, an object with `content-security-policy: "frame-ancestors 'none'"`, `referrer-policy: "no-referrer"`, `x-content-type-options: "nosniff"`, `x-frame-options: "DENY"`, spread into every `writeHead`.

- [ ] **Step 1: Write the failing tests.** Server: on a started runtime, each of `GET /`, a `401` from `POST /api/llmr/rpc`, a `200` RPC reply and an allowed `OPTIONS` carries `content-security-policy` containing `frame-ancestors 'none'`, `referrer-policy: no-referrer` and `x-frame-options: DENY`. Architecture: the rendered Nginx config contains `add_header Content-Security-Policy "frame-ancestors 'none'" always;`, `add_header Referrer-Policy "no-referrer" always;` and `add_header X-Frame-Options "DENY" always;`. Smoke: `fetch(baseUrl + "/pages/home/index.html")` carries all three; assert with `includes`, because a proxied RPC reply carries Nginx's copy and the server's.

- [ ] **Step 2: Run them and see them fail.**

- [ ] **Step 3: Add `webSecurityHeaders`** and use it in `sendBuffer`, `sendJson` and the `204`. Add the three `add_header` lines to the Nginx `server` block. The page's own `<meta>` policy stays: `frame-ancestors` is ignored in a meta tag, which is why it has to be a header, and `X-Frame-Options` covers browsers that ignore it. In the Docker guide's troubleshooting section, add one line: `/health` answers without the token and reports only whether the model gateway is up; it is not management access.

- [ ] **Step 4: Run the tests, then everything in Global Constraints. Commit, open the PR, ask the owner once for the merge.**

```bash
git commit -m "fix(web): forbid framing the management UI and stop sending a referrer"
```

---

### Task 4: Masking covers the credential names it misses

One PR. Independent of Tasks 1 to 3. Under decision T-1 masking is hygiene, not a boundary: it keeps credentials off the screen and out of a captured response, and the PR description says so.

**Files:**
- Modify: `packages/core/src/web/provider-secrets.ts`: `isSecretField` (`:16-21`), `redact` (`:47-55`), `restore` (`:86-103`). `mask` needs no change: it masks the whole subtree under a credential key.
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
  const config = { providerPlugins: [{ auth: { query: { alt: "sse", key: "gemini-key" } }, key: "llmr-local-agent-opencode", name: "plugin" }] };
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

- [ ] **Step 3: Replace the three patterns in `isSecretField` with one rule.** This exact rule was run on 2026-11-18 against both name lists above, and on 2026-11-19 against every key name in `contracts/app.ts` and the keys the UI reads; it hides every credential name and no other config field:

```ts
function isSecretField(key: string, parentKey?: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_]/g, "");
  return ["authorization", "proxyauthorization", "cookie", "setcookie"].includes(normalized) ||
    /(?:token|secret|password|apikey|privatekey|accesskey|secretkey|subscriptionkey|authkey)$/.test(normalized) ||
    /^[A-Z0-9]+(?:_[A-Z0-9]+)*_(?:KEY|PAT)$/.test(key) ||
    (key === "key" && parentKey === "query");
}
```

`redact` and `restore` pass the key of the enclosing record down as `parentKey`. The upper-case rule is for environment-variable names (`OPENAI_KEY`, `GITHUB_PAT`); it also masks a name such as `CACHE_KEY`, which costs nothing because a masked value round-trips.

- [ ] **Step 4: Run the tests, then `npm run test:core`.**

- [ ] **Step 5: Update the documents that list the gap.** In the research document's Part 3, replace the "Not matched" bullet and the "concrete case" bullet with one line saying both were closed by this task and naming its PR, and keep what is still unmasked: MCP `args` such as `--api-key=...`, a token inside a URL value, and a number or boolean under a credential key. In the three guides, the list of masked field names gains "private keys, access keys and session tokens".

- [ ] **Step 6: Commit, open the PR, ask the owner once for the merge.**

```bash
git commit -m "fix(web): mask the credential names the first rule missed"
```

---

## After the last task

- [ ] Move this plan to `docs/superpowers/plans/completed/` and repoint the two references to it (the review log's follow-up 4 and the handoff).
- [ ] In the review log (`docs/superpowers/upstream-review/reviews/2026-11-16-review.md`), mark open follow-up 4 as done under direction (a), with the four PR links, and state that directions (b) and (c) were declined on 2026-11-18 and why.
- [ ] In the research document, add a short "Outcome" section at the top: direction (a) chosen, the four PRs, and the token leak that Task 1 fixed (the Docker log printing a supplied token), which was held out of the document until then (decision T-3).
- [ ] Release notes need: a generated token is offered in a URL of the form `/#llmr_web_token=<token>`; a token you set must be 32 characters or more, is never printed, and is typed into the page; `--host` with a non-loopback address needs `--allow-remote`; stop a running daemon before upgrading.

## Not in this plan

- Directions (b) and (c) of the research document (decision T-1).
- Rotating or revoking the token without a restart. Small, and the next thing to add if exposure beyond one machine becomes normal.
- An `HttpOnly` cookie in place of `sessionStorage`. It would stop a script on the page reading the token and remove the per-tab prompt, and it brings CSRF into scope. A separate design.
- A check in the Docker entrypoint that refuses the default public host when the port is published beyond loopback (the Docker half of decision T-8).
- `Cross-Origin-Opener-Policy`: the UI opens provider login pages in new windows, and whether those flows need the opener was not checked.
- Telling upstream. Its tree at `da96d5df` has the same handlers behind the same kind of token; whether to tell them is the owner's call and needs no code.
- The Electron desktop path, which uses IPC, does not call `startWebManagementServer` and does not read `service.json`.
- Leaving the GitHub fork network. It is the only way to make the repository private and would stop GitHub disabling workflows "on this fork", but it is permanent and a repository-level decision.
