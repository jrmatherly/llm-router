# Claude Apps Gateway Integration (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make LLM Router a correct upstream for Anthropic's Claude apps gateway: attribute each request to the developer the gateway forwards, refuse to break a gateway-pinned Claude Code install, and ship a local gateway harness plus a docs page that prove the topology end to end.

**Architecture:** The gateway stays Anthropic's binary; LLMR changes only at its ingress and in the Claude Code profile apply. Attribution reuses the existing `client` dimension through `inferGatewayClient`, so no store schema moves. The guard is a pure reader of managed-settings files called once from `applyClaudeCodeProfile`. The harness is Compose for Postgres and Dex plus one Node script that renders `gateway.yaml` and runs the native `claude gateway`.

**Tech Stack:** TypeScript under `packages/core`, `node:test` with `node:assert/strict`, esbuild test bundles via `node build/test.mjs <pkg>`, Docker Compose, the `claude` CLI (2.1.310 installed at `~/.local/bin/claude`), Astro docs under `docs/`.

**Spec:** `docs/superpowers/specs/2026-10-25-claude-apps-gateway-integration.md`

## Global Constraints

- Identity header names, verbatim: `x-claude-gateway-user-email`, `x-litellm-end-user-id`, `x-claude-gateway-user-id`. Only the first two name a client; the third is never used.
- Precedence inside `inferGatewayClient`: `x-ccr-client`, `x-client-name`, `x-forwarded-client-cert`, then `x-claude-gateway-user-email`, then `x-litellm-end-user-id`, then the existing API-key and user-agent fallbacks.
- Managed settings files, verbatim: macOS `/Library/Application Support/ClaudeCode/managed-settings.json`, Linux and WSL `/etc/claude-code/managed-settings.json`, Windows `C:\Program Files\ClaudeCode\managed-settings.json`, each plus `managed-settings.d/*.json` in the same directory. The profile's own settings file is read too.
- Guard keys, verbatim: `forceLoginMethod` equal to `"gateway"`, or `allowedProviders` an array containing `"gateway"`.
- Gateway config floors: `admin.write_keys[].key` at least 32 characters, `session.jwt_secret` at least 32 bytes, `CLAUDE_GATEWAY_ALLOW_LOOPBACK=1` in the gateway's environment, `listen.host: 127.0.0.1`, Dex mock user `kilgore@kilgore.trout` with groups `[authors]`, `load_test_mode` needs gateway 2.1.282 or later.
- Style per `AGENTS.md`: double quotes, semicolons, two-space indent, alphabetized keys where the surrounding file does, `node:` imports first then `@ccr/<pkg>/...`, no comments except a non-obvious why. Tests are `*.test.mjs` with `node:test` and `node:assert/strict`.
- One test file: `node build/test.mjs <pkg> && node --test .test-dist/<pkg>/test/<unit-or-integration>/<path>.test.js`. Architecture tests: `npm run test:architecture`.
- Commit gate on any Bash `git commit`: typecheck plus `npm run test:architecture` (about 11 s).
- No secrets in the repo: the harness generates its JWT secret and admin key per run; rendered config and `.env` are gitignored.

## Review Focus

1. A gateway request that carries `x-ccr-client` and `x-claude-gateway-user-email` together: expected `x-ccr-client` wins, so an LLMR-aware proxy in front keeps its label. Pinned in Task 1.
2. An e-mail header with surrounding whitespace or an empty value: expected trimmed, and an empty header falls through to the next source instead of producing an empty client. Pinned in Task 1.
3. A `managed-settings.json` that is not valid JSON or a `managed-settings.d` directory that does not exist: expected the guard treats both as "no policy" and the apply proceeds, never throws. Pinned in Task 2.
4. A profile whose own settings file sets `forceLoginMethod: "gateway"` on a machine with no managed settings: expected the guard still refuses, since Claude Code 2.1.295+ reads the login keys from user settings. Pinned in Task 2.
5. The harness started with `--port 18090`: expected the gateway's `public_url` and Dex's registered redirect URI move together, or sign-in bounces off the IdP with a redirect mismatch. Pinned in Task 3 by rendering both files from one options object.

---

### Task 1: Attribute requests to the developer the gateway forwards

**Files:**
- Modify: `packages/core/src/gateway/http/io.ts:10-25`
- Test: `packages/core/test/unit/gateway/http-boundary.test.mjs`

**Interfaces:**
- Consumes: `inferGatewayClient(apiKey: ApiKeyConfig | undefined, headers: IncomingHttpHeaders): string | undefined`, already exported from `io.ts` and imported by the test.
- Produces: the same signature; new behavior only. Task 4's docs describe it.

- [ ] **Step 1: Write the failing tests**

Add to `http-boundary.test.mjs`, in the existing test that exercises `inferGatewayClient` or a new one named `"inferGatewayClient names the developer a Claude apps gateway forwards"`:

```js
assert.equal(inferGatewayClient({ id: "gw", name: "Apps gateway key" }, { "x-claude-gateway-user-email": " dev@example.com ", "user-agent": "claude-cli/2.1.310" }), "dev@example.com");
assert.equal(inferGatewayClient({ id: "gw", name: "Apps gateway key" }, { "x-litellm-end-user-id": "dev@example.com" }), "dev@example.com");
assert.equal(inferGatewayClient(undefined, { "x-ccr-client": "Proxy", "x-claude-gateway-user-email": "dev@example.com" }), "Proxy");
assert.equal(inferGatewayClient({ id: "gw", name: "Apps gateway key" }, { "x-claude-gateway-user-email": "   " }), "Apps gateway key");
assert.equal(inferGatewayClient({ id: "gw", name: "Apps gateway key" }, { "x-claude-gateway-user-id": "sub-123" }), "Apps gateway key");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/gateway/http-boundary.test.js`
Expected: FAIL on the first new assertion with `"Apps gateway key"` instead of `"dev@example.com"`.

- [ ] **Step 3: Extend `inferGatewayClient` in `io.ts`**

Add `(readHeader(headers["x-claude-gateway-user-email"]) || readHeader(headers["x-litellm-end-user-id"]) || undefined)` as a second explicit source, evaluated after the existing `explicit` chain and before `apiKeyClient`. `readHeader` (`io.ts:304`) trims a string and returns `undefined` for a blank string, but for an array header it returns `value[0]?.trim()`, which can be `""`; the `|| undefined` covers that.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/gateway/http-boundary.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/gateway/http/io.ts packages/core/test/unit/gateway/http-boundary.test.mjs
git commit -m "feat(gateway): attribute requests to the developer a Claude apps gateway forwards"
```

---

### Task 2: Refuse to apply a Claude Code profile on a gateway-pinned machine

**Files:**
- Create: `packages/core/src/agents/claude-code/gateway-login-policy.ts`
- Modify: `packages/core/src/profiles/service.ts:399-406` (`applyClaudeCodeProfile`, before any write)
- Test: `packages/core/test/unit/agents/claude-code-gateway-login-policy.test.mjs`
- Test: `packages/core/test/integration/profiles/profile-service.test.mjs`

**Interfaces:**
- Produces, from `gateway-login-policy.ts`:
  - `export type ClaudeCodeGatewayLoginPolicy = { file: string; key: "allowedProviders" | "forceLoginMethod" };`
  - `export function claudeCodeManagedSettingsDir(platform: NodeJS.Platform = process.platform): string` returning the literal directory from Global Constraints for `darwin`, `win32`, and everything else.
  - `export function claudeCodeManagedSettingsFiles(dir: string = claudeCodeManagedSettingsDir()): string[]` returning `dir/managed-settings.json` followed by every `*.json` in `dir/managed-settings.d`, sorted, existing files only.
  - `export function readClaudeCodeGatewayLoginPolicy(files: string[]): ClaudeCodeGatewayLoginPolicy | undefined` returning the first file and key that pins the machine to a gateway; a missing or unparsable file counts as no policy.
- Consumes in `service.ts`: `resolveClaudeCodeSettingsFile(profile)` (line 920) for the profile's own settings file, and `ProfileClientApplyStatus` from `@ccr/core/contracts/app`.

- [ ] **Step 1: Write the failing unit tests**

Create `claude-code-gateway-login-policy.test.mjs` importing from `@ccr/core/agents/claude-code/gateway-login-policy.ts`. Each test writes files in a `mkdtempSync` directory and removes it in `finally`.

```js
test("forceLoginMethod gateway in managed settings pins the machine", () => {
  // write managed-settings.json = { forceLoginMethod: "gateway", forceLoginGatewayUrl: "https://gw.internal" }
  assert.deepEqual(readClaudeCodeGatewayLoginPolicy([file]), { file, key: "forceLoginMethod" });
});
test("allowedProviders containing gateway pins the machine", () => {
  // write { allowedProviders: ["gateway"] }
  assert.deepEqual(readClaudeCodeGatewayLoginPolicy([file]), { file, key: "allowedProviders" });
});
test("a drop-in file in managed-settings.d is read after managed-settings.json", () => {
  // dir/managed-settings.json = {}, dir/managed-settings.d/10-login.json = { forceLoginMethod: "gateway" }
  const files = claudeCodeManagedSettingsFiles(dir);
  assert.deepEqual(files, [path.join(dir, "managed-settings.json"), path.join(dir, "managed-settings.d", "10-login.json")]);
  assert.equal(readClaudeCodeGatewayLoginPolicy(files)?.key, "forceLoginMethod");
});
test("missing, invalid JSON and non-gateway settings are no policy", () => {
  // invalid.json = "{", other.json = { forceLoginMethod: "console", allowedProviders: ["anthropic"] }
  assert.equal(readClaudeCodeGatewayLoginPolicy([path.join(dir, "absent.json"), invalid, other]), undefined);
});
test("managed settings directory follows the platform", () => {
  assert.equal(claudeCodeManagedSettingsDir("darwin"), "/Library/Application Support/ClaudeCode");
  assert.equal(claudeCodeManagedSettingsDir("linux"), "/etc/claude-code");
  assert.equal(claudeCodeManagedSettingsDir("win32"), "C:\\Program Files\\ClaudeCode");
  assert.equal(claudeCodeManagedSettingsFiles(path.join(dir, "absent")), []);
});
```

- [ ] **Step 2: Run the unit test to verify it fails**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/agents/claude-code-gateway-login-policy.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `gateway-login-policy.ts`**

`claudeCodeManagedSettingsDir`: `darwin` → `/Library/Application Support/ClaudeCode`, `win32` → `C:\Program Files\ClaudeCode`, anything else → `/etc/claude-code`. `claudeCodeManagedSettingsFiles(dir)`: `dir/managed-settings.json` plus sorted `*.json` under `dir/managed-settings.d`, filtered by `existsSync`; a missing `managed-settings.d` yields no entries. `readClaudeCodeGatewayLoginPolicy`: for each file, `JSON.parse(readFileSync(...))` inside try/catch, skip non-objects; return `{ file, key: "forceLoginMethod" }` when `forceLoginMethod === "gateway"`, else `{ file, key: "allowedProviders" }` when `Array.isArray(allowedProviders) && allowedProviders.includes("gateway")`. One comment allowed, the why: `// shortcut: plist and HKLM managed sources are not read; they need platform APIs. Upgrade when a user reports a pinned machine the file check misses.`

- [ ] **Step 4: Run the unit test to verify it passes**

Run: the Step 2 command. Expected: PASS.

- [ ] **Step 5: Write the failing integration test**

In `profile-service.test.mjs`, copy the shape of the test at line 87 (temp root, `settingsFile`, a `claude-code` profile with `scope: "global"`, `applyProfileFixture`). Name it `"profile service refuses to apply a Claude Code profile when the settings file pins Claude Code to a cloud gateway"`. Write `settingsFile` as `{ forceLoginMethod: "gateway", forceLoginGatewayUrl: "http://127.0.0.1:18080" }` before applying. Assert:

```js
const status = result.clients.find((client) => client.client === "claude-code");
assert.equal(status.ok, false);
assert.match(status.message, /forceLoginMethod/);
assert.match(status.message, new RegExp(settingsFile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.deepEqual(JSON.parse(readFileSync(settingsFile, "utf8")), { forceLoginMethod: "gateway", forceLoginGatewayUrl: "http://127.0.0.1:18080" });
```

Keep the same `{ skip: !process.env.CCR_INTERNAL_HOME_DIR }` option the neighbouring tests use.

- [ ] **Step 6: Run the integration test to verify it fails**

Run: `node build/test.mjs core && node --test .test-dist/core/test/integration/profiles/profile-service.test.js`
Expected: the new test FAILS because `status.ok` is `true` and the file was rewritten.

- [ ] **Step 7: Wire the guard into `applyClaudeCodeProfile`**

In `service.ts`, right after the `!profile.enabled` branch and before the `try`, call `readClaudeCodeGatewayLoginPolicy([...claudeCodeManagedSettingsFiles(), settingsFile])`. When it returns a policy, return `{ client: "claude-code", enabled: true, message, ok: false, path: settingsFile }` where `message` is exactly: `` `Claude Code on this machine is pinned to a Claude apps gateway by ${policy.key} in ${policy.file}. LLMR did not change ${settingsFile}; sign Claude Code in to the gateway, or point the gateway's upstream at LLMR instead.` ``. Import the two functions with the other `@ccr/core/agents/claude-code/...` imports.

- [ ] **Step 8: Run the integration test and the full core suite**

Run: the Step 6 command, then `npm run test:core`.
Expected: PASS, and no other profile test changes outcome.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/agents/claude-code/gateway-login-policy.ts packages/core/src/profiles/service.ts packages/core/test/unit/agents/claude-code-gateway-login-policy.test.mjs packages/core/test/integration/profiles/profile-service.test.mjs
git commit -m "feat(profiles): refuse to rewrite Claude Code settings on a gateway-pinned machine"
```

---

### Task 3: Local Claude apps gateway harness

**Files:**
- Create: `docker/claude-apps-gateway/compose.yaml`
- Create: `docker/claude-apps-gateway/.gitignore`
- Create: `docker/claude-apps-gateway/README.md`
- Create: `scripts/claude-apps-gateway-dev.mjs`
- Test: `tests/architecture/claude-apps-gateway-harness.test.mjs`

**Interfaces:**
- Produces, from `scripts/claude-apps-gateway-dev.mjs`:
  - `export type` (JSDoc, the script is `.mjs`) `GatewayConfigOptions = { adminWriteKey: string; dexPort: number; gatewayPort: number; jwtSecret: string; loadTest: boolean; upstreamApiKey?: string; upstreamBaseUrl: string }`
  - `export function renderGatewayConfig(options): string` returning the complete gateway YAML.
  - `export function renderDexConfig(options): string` returning the Dex YAML whose `issuer` and `redirectURIs` use the same `dexPort` and `gatewayPort`.
  - `export function parseArgs(argv: string[]): { loadTest: boolean; upstreamApiKey?: string; upstreamBaseUrl: string; gatewayPort: number; dexPort: number }` with defaults `gatewayPort 18080`, `dexPort 15556`, `upstreamBaseUrl "http://127.0.0.1:3456"`, flags `--load-test`, `--upstream <url>`, `--api-key <key>`, `--port <n>`, `--dex-port <n>`.
  - The script runs `main()` only when `path.basename(process.argv[1]) === "claude-apps-gateway-dev.mjs"`, the pattern `scripts/rebrand-ccr.mjs:107` uses.
- Consumes: the installed `claude` binary (`command -v claude`), Docker Compose, Task 1's attribution for the proof step.

- [ ] **Step 1: Write the failing test**

`tests/architecture/claude-apps-gateway-harness.test.mjs`, importing `renderGatewayConfig`, `renderDexConfig` and `parseArgs` from `../../scripts/claude-apps-gateway-dev.mjs` like `rebrand-ccr.test.mjs` does:

```js
test("rendered gateway.yaml points the anthropic upstream at LLMR with identity forwarding", () => {
  const yaml = renderGatewayConfig({ adminWriteKey: "a".repeat(32), dexPort: 15556, gatewayPort: 18080, jwtSecret: "b".repeat(48), loadTest: false, upstreamApiKey: "llmr-key", upstreamBaseUrl: "http://127.0.0.1:3456" });
  assert.match(yaml, /host: 127\.0\.0\.1/);
  assert.match(yaml, /issuer: http:\/\/127\.0\.0\.1:15556/);
  assert.match(yaml, /provider: anthropic/);
  assert.match(yaml, /base_url: http:\/\/127\.0\.0\.1:3456/);
  assert.match(yaml, /forward_user_identity: true/);
  assert.match(yaml, /admin_groups: \[authors\]/);
  assert.doesNotMatch(yaml, /load_test_mode/);
});
test("--load-test replaces the upstream call with a canned reply", () => {
  const yaml = renderGatewayConfig({ adminWriteKey: "a".repeat(32), dexPort: 15556, gatewayPort: 18080, jwtSecret: "b".repeat(48), loadTest: true, upstreamBaseUrl: "http://127.0.0.1:3456" });
  assert.match(yaml, /load_test_mode:\n\s+enabled: true\n\s+reply_seconds: 0/);
  assert.doesNotMatch(yaml, /forward_user_identity/);
});
test("renderer refuses secrets below the gateway's floors", () => {
  assert.throws(() => renderGatewayConfig({ adminWriteKey: "short", dexPort: 15556, gatewayPort: 18080, jwtSecret: "b".repeat(48), loadTest: true, upstreamBaseUrl: "x" }), /32/);
});
test("gateway and Dex configs move ports together", () => {
  const options = { adminWriteKey: "a".repeat(32), dexPort: 15557, gatewayPort: 18090, jwtSecret: "b".repeat(48), loadTest: true, upstreamBaseUrl: "x" };
  assert.match(renderGatewayConfig(options), /public_url: http:\/\/127\.0\.0\.1:18090/);
  assert.match(renderGatewayConfig(options), /issuer: http:\/\/127\.0\.0\.1:15557/);
  assert.match(renderDexConfig(options), /issuer: http:\/\/127\.0\.0\.1:15557/);
  assert.match(renderDexConfig(options), /redirectURIs:\n\s+- http:\/\/127\.0\.0\.1:18090\/oauth\/callback/);
  assert.match(renderDexConfig(options), /type: mockCallback/);
});
test("parseArgs defaults and flags", () => {
  assert.deepEqual(parseArgs([]), { dexPort: 15556, gatewayPort: 18080, loadTest: false, upstreamApiKey: undefined, upstreamBaseUrl: "http://127.0.0.1:3456" });
  assert.equal(parseArgs(["--load-test", "--port", "18090"]).gatewayPort, 18090);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:architecture`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `scripts/claude-apps-gateway-dev.mjs`**

`renderGatewayConfig` emits, in order: `listen` (`host: 127.0.0.1`, `port`, `public_url: http://127.0.0.1:<port>`), `oidc` (`issuer: http://127.0.0.1:<dexPort>`, `client_id: llmr-dev`, `client_secret: llmr-dev-secret`, `userinfo_fallback: true`, `scopes: [openid, profile, email, offline_access, groups]`), `session` (`jwt_secret`, `ttl_hours: 8`), `store` (`postgres_url: postgres://gw:pw@127.0.0.1:15432/gateway`), then either `upstreams` with `provider: anthropic`, `base_url`, `auth: { api_key }`, `forward_user_identity: true` or, when `loadTest`, `upstreams` with `provider: anthropic` and `auth: { api_key: load-test-unused }` plus a trailing `load_test_mode: { enabled: true, reply_seconds: 0 }`; then `auto_include_builtin_models: true` and `admin` (`write_keys: [{ id: dev, key }]`, `admin_groups: [authors]`). Throw `new Error("admin write key and JWT secret must be at least 32 characters")` when either is shorter than 32. The upstream API key is required unless `loadTest`; throw naming `--api-key` otherwise.

`renderDexConfig` emits `issuer: http://127.0.0.1:<dexPort>`, `storage: { type: memory }`, `web: { http: 0.0.0.0:5556 }`, `oauth2: { skipApprovalScreen: true }`, `connectors: [{ type: mockCallback, id: mock, name: Mock }]`, `staticClients: [{ id: llmr-dev, secret: llmr-dev-secret, name: LLMR dev gateway, redirectURIs: [http://127.0.0.1:<gatewayPort>/oauth/callback] }]`. The mock connector's fixed user is `kilgore@kilgore.trout` with groups `[authors]`; Dex defines it, not this file.

`main`: `parseArgs`; check `command -v claude` via `execFileSync("sh", ["-c", "command -v claude"])` and exit 1 with a message if absent; write `renderDexConfig` to `docker/claude-apps-gateway/dex.rendered.yaml`; `docker compose -f docker/claude-apps-gateway/compose.yaml up -d`; generate `jwtSecret` and `adminWriteKey` with `randomBytes(32).toString("base64url")`; write the rendered gateway YAML to `docker/claude-apps-gateway/gateway.rendered.yaml` with mode `0o600`; print the admin key once, the Postgres URL, and the line `A new JWT secret was generated; tokens from earlier runs are invalid.`; spawn `claude gateway --config <file>` with `stdio: "inherit"` and env `CLAUDE_GATEWAY_ALLOW_LOOPBACK=1`; forward SIGINT to the child. The compose port mapping for Dex is fixed at `15556:5556`, so `--dex-port` other than 15556 also needs the `DEX_PORT` compose variable the script passes in its environment (`"${DEX_PORT:-15556}:5556"` in `compose.yaml`).

`compose.yaml`: service `postgres` (`postgres:16-alpine`, env `POSTGRES_USER=gw`, `POSTGRES_PASSWORD=pw`, `POSTGRES_DB=gateway`, port `15432:5432`, named volume `pgdata`, healthcheck `pg_isready -U gw`) and service `dex` (`ghcr.io/dexidp/dex:v2.44.0`, a release that exists as of 2026-10-25, command `dex serve /etc/dex/config.yaml`, volume `./dex.rendered.yaml:/etc/dex/config.yaml:ro`, port `"${DEX_PORT:-15556}:5556"`). `.gitignore`: `*.rendered.yaml` and `.env`.

`README.md` (English, factual): what runs where, the two commands below, the sign-in loop, teardown `docker compose -f docker/claude-apps-gateway/compose.yaml down -v`, and two notes: plist or HKLM managed settings on the host are not read by the Task 2 guard, and `--load-test` needs an empty database (the gateway refuses load-test mode once any developer has spent anything), so run `docker compose -f docker/claude-apps-gateway/compose.yaml down -v` between a real run and a load-test run.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:architecture`
Expected: PASS.

- [ ] **Step 5: Prove the harness against the real binary**

Run, with LLMR Desktop or `ccr start` serving `http://127.0.0.1:3456` and a client key created under API Keys:

```bash
node scripts/claude-apps-gateway-dev.mjs --api-key <llmr-client-key>
```

Expected in the gateway's stderr within a few seconds: migrations applied and `claude gateway listening on http://127.0.0.1:18080`. Then:

```bash
curl -s http://127.0.0.1:18080/.well-known/oauth-authorization-server | jq .device_authorization_endpoint
```

Expected: `"http://127.0.0.1:18080/oauth/device_authorization"`.

In a second shell, with `~/.claude/settings.json` holding `"forceLoginMethod": "gateway", "forceLoginGatewayUrl": "http://127.0.0.1:18080"` (back the file up first; LLMR's profile apply must not run meanwhile, which Task 2 now guarantees), run `claude`, then `/login`, accept the fingerprint prompt, approve in the browser as the mock user, pick with `/model` a model id that LLMR routes (the gateway forwards the id unchanged to an `anthropic` upstream, so an LLMR provider or virtual model must answer to that exact id), and send one prompt. Expected: a 200 row in LLMR's Logs page whose Client cell reads `kilgore@kilgore.trout`, and the same value under Client in the request's detail panel. Record the measured result in the README's "Verified" line with the date and the gateway version from `claude --version`.

Restore `~/.claude/settings.json` afterwards.

- [ ] **Step 6: Commit**

```bash
git add docker/claude-apps-gateway scripts/claude-apps-gateway-dev.mjs tests/architecture/claude-apps-gateway-harness.test.mjs
git commit -m "feat(docker): local Claude apps gateway harness with LLMR as its upstream"
```

---

### Task 4: Docs page

**Files:**
- Create: `docs/src/content/docs/en/guides/claude-apps-gateway.md`
- Create: `docs/src/content/docs/zh/guides/claude-apps-gateway.md`
- Modify: `docs/src/docs-structure.ts:109-114` (insert after the `guides/observability` entry)

**Interfaces:**
- Consumes: Task 1's header behavior, Task 2's refusal message, Task 3's script and flags.

- [ ] **Step 1: Add the navigation entry**

Insert after the `guides/observability` object:

```ts
  {
    key: "guides/claude-apps-gateway",
    section: "guides",
    label: { zh: "Claude apps gateway 上游", en: "Behind a Claude apps gateway" },
    path: { zh: "/guides/claude-apps-gateway/", en: "/en/guides/claude-apps-gateway/" },
    source: { zh: "guides/claude-apps-gateway.md", en: "guides/claude-apps-gateway.md" },
  },
```

Every guide exists in both locales today (6 of 6), so the zh page is required, not optional.

- [ ] **Step 2: Write the English page, then its Chinese translation**

Frontmatter in the `docker.md` shape: `title: Behind a Claude apps gateway`, `pageTitle` the same, `eyebrow: Quick start`, `lead` one sentence. Sections, in order:

1. **What the gateway does and where LLMR sits**: the gateway is `claude gateway`, signs developers in with your IdP, enforces models and spend, and forwards `/v1/messages` to one upstream. LLMR is that upstream.
2. **Point the gateway at LLMR**: the exact block
   ```yaml
   upstreams:
     - provider: anthropic
       base_url: http://<llmr-host>:3456
       auth: { api_key: ${LLMR_CLIENT_KEY} }
       forward_user_identity: true
   ```
   with the note that the gateway appends `/v1/messages` itself, so no `/v1` suffix, and that `GET /v1/models` is answered by the gateway from its own `models:` catalog.
3. **What LLMR records**: the request log and usage `client` becomes the developer's e-mail from `x-claude-gateway-user-email` (or `x-litellm-end-user-id`); request logs are local and keep that e-mail for the day; `x-ccr-client` still wins when set.
4. **Claude Code profiles on a gateway-pinned machine**: LLMR refuses the apply and shows the message from Task 2; what to do instead.
5. **Try it locally**: `node scripts/claude-apps-gateway-dev.mjs --api-key <key>`, the `--load-test` variant, the sign-in loop, teardown.
6. **Reference deployments**: links to `https://github.com/aws-samples/sample-claude-apps-gateway-on-aws` and Anthropic's pages `https://code.claude.com/docs/en/claude-apps-gateway`, `.../claude-apps-gateway-config`, `.../claude-apps-gateway-spend-limits`.

The zh page carries the same six sections translated, the same code blocks verbatim, and the same links; product names (`LLMR`, `Claude apps gateway`, `Claude Code`) stay in English as the other zh guides do.

- [ ] **Step 3: Build the docs and check the page renders**

Run: `cd docs && npm run build`
Expected: build succeeds and both `dist/en/guides/claude-apps-gateway/index.html` and `dist/guides/claude-apps-gateway/index.html` exist.

- [ ] **Step 4: Commit**

```bash
git add docs/src/content/docs/en/guides/claude-apps-gateway.md docs/src/content/docs/zh/guides/claude-apps-gateway.md docs/src/docs-structure.ts
git commit -m "docs: running LLMR behind a Claude apps gateway"
```

---

### Task 5: Whole-branch check

- [ ] **Step 1: Run the suites the gate does not**

Run: `npm run typecheck && npm run test:core && npm run test:architecture`
Expected: all PASS. Then `git status --short` shows nothing uncommitted; if `packages/core/models.json` or `packages/ui/src/generated` changed, restore them with `git checkout -- packages/core/models.json packages/ui/src/generated`.

- [ ] **Step 2: Open the PR**

Title `feat: run LLMR behind a Claude apps gateway (phase 1)`. Body: the four deliverables, the harness proof line from Task 3 Step 5, the deferred phase 2 list from the spec, and the attribution footer the repo uses.
