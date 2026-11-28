# Major Updates: js-yaml 5, undici 8, React 19 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status, 2026-11-28: written from three prototypes, not built.** Each task was built once as a prototype on another model at `main` `8f1725f1`, in its own worktree, to a state where every suite it ran passed (its run). The lead then applied the three prototypes' source changes to one tree, regenerated the lockfiles and ran every suite: typecheck 0 errors, lint clean over 949 files, architecture 219 of 219, UI 338 of 338, Electron 46 of 46, CLI 21 of 21, core 2,544 passed with 16 skipped and none failed (the lead's run). No task is approved. Building each branch and merging each PR needs the owner's word.

> **Audited by building, 2026-11-28.** An audit on another model built Tasks 1, 2 and 3 in order on one tree from this text alone, without the prototypes. Every edit applied, every red check went red, and its gate matched the counts above. It found no Blocker, 5 Corrections and 5 Gaps, all applied below. It ran 6 mutants: 4 killed and 2 survivors, each of which now has a test or an assertion here. The version assertion in Task 1 Step 1 was written after the audit. The lead ran its expression alone: it reads 4.3.2 on `main` and on the audit's built tree, where the root's own copy reads 5.5.0.

**Goal:** Move `js-yaml` to 5, `undici` to 8 and React to 19, each as its own PR, with the code changes each needs and a test for what the change could break.

**Architecture:** Three independent branches, one PR each, smallest first. No two change the same source file. All three change the root `package-lock.json`, and Tasks 1 and 3 change the root `package.json`, so the second and third to merge rebase and run `npm install` again. TypeScript 7 is not here. It needs edits to the Codex runtime script and has no prototype.

**Tech Stack:** TypeScript on Node 24, React, `node:test` with `node:assert/strict`, npm workspaces, Astro for the docs site, GitHub Actions.

**Spec:** There is no separate spec. This plan argues from:
- Renovate's Dependency Dashboard, issue 188 of `jrmatherly/llm-router`, which lists the three updates.
- The section "What the prototypes found" below. Its evidence is outside the repo in `private/research/2026-11-28-major-updates/`, one folder per task with `prototype.patch` and `notes.md`.
- The makers' guides: [undici 7 to 8](https://undici.nodejs.org/best-practices/migrating-from-v7-to-v8), [React 19 upgrade](https://react.dev/blog/2024/04/25/react-19-upgrade-guide), [js-yaml changelog](https://raw.githubusercontent.com/nodeca/js-yaml/master/CHANGELOG.md).

## Global Constraints

- npm only. `npm ci` in a fresh worktree before anything else, and in `docs` for Task 3.
- Never run `npm run test:e2e`, Playwright, Electron or the desktop app on the owner's Mac. CI runs them.
- Never run `npm run build:assets` or `npm run models:build` on a branch.
- `~/.npmrc` holds a release-age cooldown and `save-exact=true`. Write each range by hand as this plan gives it. A caret floor newer than the cooldown fails with `ETARGET`.
- One test file: `node build/test.mjs <pkg> && node --test .test-dist/<pkg>/test/<unit|integration|component>/<path>.test.js`. For `tests/architecture/`: `node build/test.mjs architecture && node --test .test-dist/architecture/test/<name>.test.js`. No `--scope`.
- The gate before a PR: `npm run typecheck`, `rtk bypass npm run lint`, `npm run test:architecture`, `LLMR_TEST_GATEWAY_ENTRY="$PWD/node_modules/@the-next-ai/ai-gateway/bin/next-ai-gateway.js" npm run test:core`, `npm run test:ui`, `npm run test:electron`, `npm run test:cli`.
- A task builds what its text says and nothing else. Anything else found goes into the PR body under "Not in this PR".
- One commit per task, holding the change and its test.
- Merging needs the owner's word, once per PR. Read every CI job by hand first, Windows, the Intel Mac and e2e included. Merge with `gh pr merge <n> --squash --match-head-commit <full 40-character sha>`.
- **A builder must not open `private/research/2026-11-28-major-updates/`.** It holds a prototype of every task. A reviewer may diff a branch against it and should explain each difference.
- Style: double quotes, semicolons, two-space indent, no comments except a non-obvious why.
- Never `import()` or `require()` `@the-next-ai/ai-gateway`. It starts a server.

## What the prototypes found

Each line is a run by the prototype's builder unless it says read or inferred.

**js-yaml 5**
- 5.5.0 has no default export. The three default imports fail with "does not provide an export named 'default'".
- The root override `"js-yaml": "$js-yaml"` forces the root version onto `pm2`, `electron-updater`, `app-builder-lib`, `builder-util` and `dmg-builder`. Each declares js-yaml 4. With the override deleted, each keeps a nested 4.3.2 and the root uses 5.5.0. `npm audit` is 6 moderate before and after.
- `electron-updater` is bundled into the Electron main process, and a scratch bundle of `update-service.ts` pulls in only `electron-updater`'s own nested js-yaml. So the shipped app keeps 4.3.2.
- A `latest-mac.yml` written by 5.5.0 parses to the same values under 4.3.2. Three scalars differ in quoting and all read as the same strings. `releaseDate` stays quoted.
- No architecture test pins the override. `git log -S` finds only the upstream commit that added it, with no reason.

**undici 8**
- The five failing Codex wire tests fail because of the test's own redirect, not product code. The test sets a global dispatcher from the gateway's nested undici 6. Loading undici 8 later replaces a global dispatcher that only an older undici set, and the auth hook bundle loads LLMR's undici. Taking the test's dispatcher from LLMR's undici fixes all five, and passes on undici 7 too.
- `system-proxy-fetch.ts` hands an undici `ProxyAgent` to Node's own fetch. Node 24 bundles undici 7.30.2. An undici 8 dispatcher is rejected there with `UND_ERR_INVALID_ARG`, "invalid onRequestStart method". `Dispatcher1Wrapper` fixes it, and works on Node 26 too. Without it every proxied core request fails.
- HTTP/2: the gateway fetch preload in `supervisor.ts` is the only path where undici 8 changes the protocol. Its `Agent` and `ProxyAgent` speak HTTP/2 to a TLS server that offers it, through a proxy tunnel too. `allowH2: false` keeps HTTP/1.1 on both, which is what `main` does on every path.
- Loading undici 8 anywhere replaces the global dispatcher behind Node's fetch with a wrapper around an undici 8 `Agent`. It stays on HTTP/1.1. No product code calls `setGlobalDispatcher`.
- Through a proxy, undici 8 sends a plain `http://` target in absolute form where undici 7 used `CONNECT`. An `https://` target still tunnels.
- With a hostname target, undici 8 names the hostname in `net.connect` and resolves it to the proxy. The test network guard reads the name and refuses it. A test of this path uses an IP address.

**React 19**
- The 14 type errors have two causes. Six bare `useRef<T>()` calls give 6 TS2554. Three of those refs, two in `App.tsx` and one in `network-logs.tsx`, give 7 TS2322 where the code assigns `undefined` to `.current`. One global `JSX.Element` gives 1 TS2503.
- The one UI test failure is attribute casing. `renderToStaticMarkup(<Input readOnly />)` prints `readonly=""` on React 18 and `readOnly=""` on React 19. HTML attribute names are case-insensitive.
- Every installed dependent accepts React 19. The `ERESOLVE` warnings during the swap name only the outgoing React 18 packages, and a clean `npm ci` on the new lockfiles prints none.
- The docs site imports `packages/ui/src`, so root, `packages/ui` and `docs` move together. With `resolve.dedupe` already in `docs/astro.config.mjs`, the built docs hold one React, 19.3.1, and the four guide demos hydrate with the same control counts as on React 18: 14, 6, 5 and 16.
- The three renderer bundles build in memory with no errors and hold only React 19.3.1.
- No ref callback, removed API, `defaultProps` or error boundary is in the code (read).

## Review Focus

What no test here exercises, most likely to bite first. Each names its check.

1. **React 19 in a real window.** No renderer has mounted on React 19 outside the docs demos. Exit and layout animations (`AnimatePresence`, `LayoutGroup`) and the portals in `components/ui/popover.tsx` and `tooltip.tsx` inside dialogs are unseen. Check: the e2e job on the PR must pass, and the owner opens the app from the PR's build and clicks through a dialog, a popover, a tooltip and the Dashboard before saying merge.
2. **A real upstream proxy.** Task 2's test uses a loopback proxy and a plain `http://` target. An `https://` provider through a real proxy, with authentication, is not run. Check: Task 2 Step 8.
3. **Defaults of the global dispatcher.** After Task 2, Node's fetch in every LLMR process runs through an undici 8 `Agent` once undici loads. Its timeouts and connection limits were not compared with undici 7's. Check: Task 2 Step 7 records them in the PR body.
4. **The docs demos after a deploy.** A green docs build does not show hydration. Check: Task 3 Step 7, in a browser.
5. **Update file fields outside the fixtures.** `releaseNotes`, `minimumSystemVersion` and `stagingPercentage` are not in Task 1's round trip. The merge script copies what `electron-builder` wrote, and today's release writes none of the three (read in `build/merge-macos-update-metadata.mjs`). Check: a reviewer confirms that against the last release's `latest-mac.yml`.

## Order

1. Task 1, js-yaml. Smallest, and no runtime code changes.
2. Task 2, undici. Rebase on Task 1 if it merged, then `npm install`.
3. Task 3, React. Rebase on what merged, then `npm install` in the root.

Renovate has these three queued in issue 188. If it opens its own PR for one before the task's branch does, close Renovate's PR with a line pointing at this plan.

---

### Task 1: js-yaml 5, with the override removed

Branch `chore/js-yaml-5`.

**Files:**
- Modify: `package.json` (the `js-yaml` devDependency and the `overrides` block)
- Modify: `package-lock.json` (by npm)
- Modify: `build/merge-macos-update-metadata.mjs:3`
- Modify: `tests/architecture/release-publish-step.test.mjs:7`
- Test: `tests/architecture/merge-macos-update-metadata.test.mjs`

- [ ] **Step 1: Write the guard test.** In `tests/architecture/merge-macos-update-metadata.test.mjs`, add `import { createRequire } from "node:module";`, make `run` return the file's text as well, and add the test before the first existing one:

```js
function run(t, ...inputs) {
  // unchanged up to the spawnSync line
  const text = existsSync(out) ? readFileSync(out, "utf8") : undefined;
  return { ...result, merged: text && yaml.load(text), text };
}

test("the js-yaml that electron-updater ships reads the merged file with every value a string", (t) => {
  // Apps already in the field parse latest-mac.yml with this copy, which can be an older major than the one that writes it.
  const fromUpdater = createRequire(path.resolve("node_modules/electron-updater/package.json"));
  const updaterYaml = fromUpdater("js-yaml");
  assert.match(fromUpdater("js-yaml/package.json").version, /^4\./, "electron-updater must keep its own js-yaml 4, or this test reads the file with the version that wrote it");
  const tricky = ["=leading+equals==", "1e5", "2026-11-16", "0x1F", "1_000", "012", "true", "null", "~", "on"];
  const zip = file("Apple-Silicon-arm64.zip", tricky[0]);
  const dmgs = tricky.slice(1).map((sha512, index) => file(`odd-${index}.dmg`, sha512));
  const { text } = run(t, metadata("10.0", "2026-11-16T05:18:00.000Z", [zip, ...dmgs]), metadata("10.0", "2026-11-16T05:15:00.000Z", [x64Zip]));
  const read = updaterYaml.load(text);
  assert.deepEqual(read.files.map((entry) => entry.sha512), [tricky[0], "x64-zip", ...tricky.slice(1)]);
  assert.deepEqual([read.version, read.path, read.sha512, read.releaseDate], ["10.0", zip.url, tricky[0], "2026-11-16T05:18:00.000Z"]);
});
```

  `file`, `metadata` and `x64Zip` are the file's own helpers. The tests are bundled to CommonJS, so `import.meta.url` is empty there. Keep the `path.resolve` from the working directory. The version assertion is there because the test otherwise passes with the override kept, reading with js-yaml 5 what js-yaml 5 wrote (the audit's mutant).

- [ ] **Step 2: Run it on js-yaml 4.** `node build/test.mjs architecture && node --test .test-dist/architecture/test/merge-macos-update-metadata.test.js`. Expected: PASS, 7 tests. It is a guard, so it passes before the bump: on `main` the override gives `electron-updater` the root's 4.3.2. Step 6 shows it can fail.

- [ ] **Step 3: Bump and drop the override.** In the root `package.json` set `"js-yaml": "^5.0.0"` in `devDependencies`. In `overrides`, delete the line `"js-yaml": "$js-yaml"` and the comma before it. Run `npm install --ignore-scripts`. Expected from `npm ls js-yaml --all`: the root on 5.x, and `pm2`, `electron-updater`, `app-builder-lib`, `builder-util` and `dmg-builder` each on a nested 4.3.2.

- [ ] **Step 4: Run the architecture suite.** `npm run test:architecture`. Expected: exit 1 before any test runs. esbuild stops on `No matching export in "node_modules/js-yaml/dist/js-yaml.mjs" for import "default"` in `merge-macos-update-metadata.test.mjs` and `release-publish-step.test.mjs`.

- [ ] **Step 5: Change the three imports** to `import * as yaml from "js-yaml";` in `build/merge-macos-update-metadata.mjs`, `tests/architecture/merge-macos-update-metadata.test.mjs` and `tests/architecture/release-publish-step.test.mjs`. Run `npm run test:architecture`. Expected: 219 pass.

- [ ] **Step 6: Show the guard can fail.** Add `schema: yaml.CORE_SCHEMA` to the `dump` options in `build/merge-macos-update-metadata.mjs` and run the one file. Expected: only the new test fails, on `2026-11-16` read back as a `Date`. Revert the line.

- [ ] **Step 7: Check the audit and the install.** `npm audit --json | jq .metadata.vulnerabilities` must read moderate 6, total 6, as on `main`. `rm -rf node_modules && npm ci` must exit 0.

- [ ] **Step 8: Run the gate, then commit.** Subject: `chore(deps): move js-yaml to 5 and stop forcing it onto the packaging tools`. The PR body states that the shipped app keeps js-yaml 4.3.2 inside `electron-updater`, that `pm2` is declared in `packages/core/package.json` and imported nowhere under `packages/*/src` or `build`, and Review Focus 5.

---

### Task 2: undici 8

Branch `chore/undici-8`.

**Files:**
- Create: `packages/core/test/integration/proxy/system-proxy-fetch.test.mjs`
- Modify: `packages/core/package.json`, `packages/cli/package.json` (the `undici` range)
- Modify: `package-lock.json` (by npm)
- Modify: `packages/core/src/proxy/system-proxy-fetch.ts:1` and `:213`
- Modify: `packages/core/src/gateway/core-runtime/supervisor.ts`, in `gatewayFetchPreloadScript` near lines 594 to 603
- Modify: `packages/core/test/integration/gateway/october-issues-wire.test.mjs`, in `codexWireFixture` near line 730
- Modify: `packages/core/test/unit/gateway/gateway-fetch-preload.test.mjs`, after lines 38 and 60, and one new test

- [ ] **Step 1: Write the proxy test** as `packages/core/test/integration/proxy/system-proxy-fetch.test.mjs`:

```js
import assert from "node:assert/strict";
import { createServer } from "node:http";
import net from "node:net";
import test from "node:test";
import { loadAppConfig } from "@llmr/core/config/config.ts";
import { replacePersistedAppConfig } from "@llmr/core/config/config-repository.ts";
import { fetchWithSystemProxy } from "@llmr/core/proxy/system-proxy-fetch.ts";

test("a request to an outside host goes through the configured upstream proxy", async (t) => {
  const seen = [];
  // One loopback server is both the proxy and, through a CONNECT tunnel back to itself, the outside host.
  const proxy = createServer((req, res) => {
    seen.push(`${req.method} ${req.headers.host} ${req.url}`);
    res.end(`via proxy ${req.headers.host}`);
  });
  proxy.on("connect", (req, client, head) => {
    seen.push(`CONNECT ${req.url}`);
    const tunnel = net.connect(proxy.address().port, "127.0.0.1", () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      tunnel.write(head);
      tunnel.pipe(client);
      client.pipe(tunnel);
    });
    tunnel.on("error", () => client.destroy());
    client.on("error", () => tunnel.destroy());
  });
  await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => proxy.close(resolve)));
  proxy.unref();

  const config = await loadAppConfig();
  await replacePersistedAppConfig({
    ...config,
    proxy: { ...config.proxy, upstream: { custom: { password: "", port: proxy.address().port, server: "127.0.0.1", username: "" }, mode: "custom" } }
  });

  // A documentation address (RFC 5737). undici 8 names a hostname target in net.connect, and the test network guard refuses it.
  const response = await fetchWithSystemProxy("http://192.0.2.1/models");

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "via proxy 192.0.2.1");
  assert.ok(seen.some((line) => line.includes("192.0.2.1")), seen.join("\n"));
});
```

- [ ] **Step 2: Run it on undici 7.** `node build/test.mjs core && node --test .test-dist/core/test/integration/proxy/system-proxy-fetch.test.js`. Expected: PASS. The test suite runs with a temporary home, so the config it writes is not the owner's.

- [ ] **Step 3: Bump.** Set `"undici": "^8.13.1"` in `packages/core/package.json` and `packages/cli/package.json`. Run `npm install --ignore-scripts`. Expected from `npm ls undici`: 8.x under `packages/core` and `packages/cli`, the gateway's own nested 6.29.1, `node-gyp`'s 6.29.1 under `electron-builder`, and the root `node_modules/undici` still on 7.30.1 for `openai` and `@electron/get`. So `require("undici")` from the repo root still gets 7, which is why Step 6 points at `packages/core`.

- [ ] **Step 4: Run the two red checks.** The proxy test now fails with `UND_ERR_INVALID_ARG`, "invalid onRequestStart method". `node --test .test-dist/core/test/integration/gateway/october-issues-wire.test.js` after a rebuild, with `LLMR_TEST_GATEWAY_ENTRY` set as the gate gives it, fails in five tests whose names begin "Codex requests", "three concurrent Codex requests", "an upstream 401 on a Codex request" and "#1941".

- [ ] **Step 5: Wrap the proxy dispatcher.** In `packages/core/src/proxy/system-proxy-fetch.ts`, import `Dispatcher1Wrapper` from `undici` beside `ProxyAgent`, and in `proxyDispatcher` build `new Dispatcher1Wrapper(new ProxyAgent(proxyUrl))`. One `//` comment line above it. It says that Node's built-in fetch speaks the undici 7 handler API, which an undici 8 dispatcher rejects without the wrapper. The function's return type stays `Dispatcher`. Run the proxy test. Expected: PASS.

- [ ] **Step 6: Fix the wire test's redirect.** In `codexWireFixture`, the preload text takes `Agent` and `setGlobalDispatcher` from `createRequire(process.env.LLMR_TEST_GATEWAY_ENTRY)("undici")`. Change the `createRequire` argument to `${JSON.stringify(path.join(process.cwd(), "packages", "core", "package.json"))}`, so the dispatcher comes from LLMR's undici. One `//` comment line in the test source, directly above `writeFileSync(preload, …)`, saying that loading undici 8 later, which the auth hook does, replaces a global dispatcher that only an older undici set. Run the file. Expected: 24 pass.

- [ ] **Step 7: Keep HTTP/1.1 in the gateway preload.** First add to `packages/core/test/unit/gateway/gateway-fetch-preload.test.mjs`, after the two `bodyTimeout` assertions at lines 38 and 60, the first after `harness.agentOptions[0].bodyTimeout` and the second after `harness.proxyAgentOptions[0].bodyTimeout`, and then the new test:

```js
  assert.equal(harness.agentOptions[0].allowH2, false);
```

```js
  assert.equal(harness.proxyAgentOptions[0].allowH2, false);
```

```js
test("gateway fetch preload keeps a proxy without a timeout on HTTP/1.1", () => {
  const harness = executePreload({
    LLMR_UNDICI_MODULE: "mock-undici",
    CCR_UPSTREAM_PROXY_URL: "http://127.0.0.1:8888"
  });

  assert.equal(harness.agentOptions.length, 0);
  assert.equal(harness.proxyAgentOptions[0].allowH2, false);
});
```

  The new test covers a proxy with no timeout set, the common case. Without it, a version that sets `allowH2` only beside the timeouts passes (the audit's mutant). Run the file. Expected: FAIL in three tests, each `Expected values to be strictly equal`, actual `undefined`, expected `false`. Then in `gatewayFetchPreloadScript` replace the `timeoutOptions` line with

```js
    "  const dispatcherOptions = Object.assign({ allowH2: false }, hasTimeout ? { headersTimeout: Math.trunc(parsedTimeout), bodyTimeout: Math.trunc(parsedTimeout) } : {});",
```

  and use `dispatcherOptions` where the `Agent` and the `ProxyAgent` took `timeoutOptions`. One `//` comment line in the TypeScript array, not inside a string, directly above the `dispatcherOptions` string. It says that undici 8 negotiates HTTP/2 over TLS by default, and upstreams have always been reached over HTTP/1.1. In the comment block below, the sentence about majors now reads "Node 24 ships undici 7 while LLMR bundles undici 8", and its quoted error is "invalid onRequestStart method". Run the file. Expected: PASS. In the PR body, record the default `headersTimeout`, `bodyTimeout`, `connections` and `keepAliveTimeout` of an undici 7.30 and an undici 8 `Agent`, read from each version's `lib/dispatcher/client.js` (the timeouts) and `lib/dispatcher/pool.js` (`connections`), for Review Focus 3. The audit read them as equal in 7.30.1 and 8.13.1: 300 seconds, 300 seconds, no connection limit and 4 seconds.

- [ ] **Step 8: Run one `https://` request through a proxy tunnel, outside the suite.** No built `system-proxy-fetch` exists without `build:assets`, so bundle a probe. In the session's scratch directory, not in the repo, write `probe.mjs`: a loopback `https` server with a self-signed certificate whose subject alternative name is `IP:192.0.2.1`, a loopback `CONNECT` proxy that tunnels every target to that server, the proxy saved as the custom upstream the way Step 1's test does, and one `fetchWithSystemProxy("https://192.0.2.1/v1/models")`. Wrap its body in `async function main()`. The target must not be loopback, since loopback targets bypass the proxy. From the repo root:

```sh
npx esbuild <scratch>/probe.mjs --bundle --platform=node --format=cjs --target=node24 --tsconfig=tsconfig.json --external:better-sqlite3 --external:electron --loader:.runtime.cjs=text --outfile=<scratch>/probe.bundle.cjs
env -i PATH=/usr/bin:/bin NODE_PATH="$PWD/node_modules" HOME=<tmp> USERPROFILE=<tmp> LLMR_INTERNAL_HOME_DIR=<tmp> LLMR_INTERNAL_APP_DATA_DIR=<tmp>/app-data LLMR_INTERNAL_USER_DATA_DIR=<tmp>/user-data LLMR_INTERNAL_CLAUDE_CODE_MANAGED_SETTINGS_DIR=<tmp>/ccms NODE_EXTRA_CA_CERTS=<cert> "$(node -p process.execPath)" <scratch>/probe.bundle.cjs
```

  `<tmp>` is a fresh `mktemp -d`. The absolute node path is needed because a version manager's shim fails under `env -i`. Expected: status 200, the proxy logged one `CONNECT 192.0.2.1:443`, the server saw HTTP/1.1, and the config landed under `<tmp>/.llm-router` (the audit's run, also against a server that offers HTTP/2). Paste the script and its output into the PR body.

- [ ] **Step 9: Run the gate, then commit.** Core is expected at two tests above `main`'s count, with 16 skipped and no refused connection. Subject: `chore(deps): move undici to 8, wrap the proxy dispatcher for Node's fetch and keep upstream calls on HTTP/1.1`. The PR body states Review Focus 2 and 3, that a plain `http://` target through a proxy is now sent in absolute form and not through `CONNECT`, and that the e2e job is the only check that undici 8 loads in the Electron main process.

---

### Task 3: React 19

Branch `chore/react-19`.

**Files:**
- Modify: `package.json`, `packages/ui/package.json`, `docs/package.json` (`react`, `react-dom`, `@types/react`, `@types/react-dom`)
- Modify: `package-lock.json`, `docs/package-lock.json` (by npm)
- Modify: `packages/ui/src/pages/home/App.tsx:733`, `:734`, `:746`
- Modify: `packages/ui/src/pages/home/components/network-logs.tsx:1608`
- Modify: `packages/ui/src/pages/home/components/profiles.tsx:422`
- Modify: `packages/ui/src/pages/home/shared/controls.tsx:359`
- Modify: `packages/ui/src/pages/home/components/update.tsx:1`
- Test: `packages/ui/test/component/components.test.tsx:180`

- [ ] **Step 1: Bump the four packages** to `"^19.0.0"` wherever each appears in the three manifests. `packages/ui/package.json` holds two of them and the other two manifests hold four. Run `npm install --ignore-scripts` in the root, then `npm install` in `docs`. `ERESOLVE` warnings during this swap name the outgoing React 18 packages and are expected. Then `npm ci` in the root and in `docs` must each print no `ERESOLVE` line. `npm ls react react-dom` must show one version of each in both trees.

- [ ] **Step 2: Run the red checks.** `npm run typecheck`. Expected: 14 errors, 6 TS2554 and 7 TS2322 and 1 TS2503. `npm run test:ui`. Expected: 1 failure in 338, in `components.test.tsx` on `readonly=""`.

- [ ] **Step 3: Give each bare `useRef` its argument.** At the six sites, `useRef<T>()` becomes `useRef<T | undefined>(undefined)`, with `T` as it stands: `number`, `string` and `number` in `App.tsx`, `Worker` in `network-logs.tsx`, `number` in `profiles.tsx` and in `controls.tsx`. It is the form `components/ui/tooltip.tsx:75` already uses. Run `npm run typecheck`. Expected: 1 error left, TS2503 in `update.tsx`.

- [ ] **Step 4: Import the `JSX` namespace.** Add `import type { JSX } from "react";` as the first line of `packages/ui/src/pages/home/components/update.tsx`, the form `shared/motion.tsx:1` uses. Run `npm run typecheck`. Expected: exit 0.

- [ ] **Step 5: Accept the attribute's new casing.** In `packages/ui/test/component/components.test.tsx:180`, `/readonly=""/` becomes `/readonly=""/i`. React 19's server renderer writes a boolean attribute's name as the prop is written. Run `npm run test:ui`. Expected: 338 pass.

- [ ] **Step 6: Build the docs.** `npm run build` in `docs`. Expected: exit 0 and 71 pages. Then `grep -rlE "18\.3\.1" docs/dist/_astro/*.js` must print nothing, and `grep -rhoE "19\.[0-9]+\.[0-9]+" docs/dist/_astro/*.js | sort -u` must show `19.3.1` or the installed 19.x. A looser pattern also finds `18.7.3`, which is SVG path data.

- [ ] **Step 7: Prove the demos hydrate, in a browser.** In `docs`, run `npx astro preview --port 4331 --host 127.0.0.1`. It detaches by itself. Open each of `http://127.0.0.1:4331/llm-router/guides/logs-app/`, `agent-profile-app/`, `observability-app/` and `provider-app/` and wait for load. For each, `document.querySelectorAll("astro-island[ssr]").length` must be 0, which is the sign that the island hydrated, since the server's HTML already holds the buttons. The `astro-island button` count read at load must be 14, 6, 5 and 16. The count on `agent-profile-app` grows once its tutorial plays. The console must show no React error. Click Details on `observability-app` and Add provider on `provider-app`, and each must open a `[role=dialog]`. Stop the preview with `npx astro preview stop` and close every page. Put the table in the PR body.

- [ ] **Step 8: Run the gate, then commit.** Subject: `chore(deps): move React to 19 across the workspace and the docs site`. The PR body states Review Focus 1 and 4, and that no renderer has mounted on React 19 in a real window before the e2e job.

- [ ] **Step 9: GATE. The owner's look.** After the e2e job passes, the owner opens the app from the PR's build and checks a dialog, a popover, a tooltip and the Dashboard's animations. Nothing merges before that.

---

## Not in this plan

- **TypeScript 7.** The main config passes on 7.0.2. `tsconfig.codex-runtime.json` gives 7 errors in `packages/core/src/agents/codex/cli-middleware-runtime-source.runtime.cjs`, 6 TS2554 and 1 TS2810 (the lead's run). That file is edited only on purpose, and no prototype exists. It needs its own task.
- **Holding these three in Renovate** until their PRs merge. It is the owner's choice. Without a hold Renovate opens its own PR for each on Monday, and two of the three fail CI as they stand.
- **`pm2`.** It is declared in `packages/core/package.json` and nothing under `packages/*/src` or `build` imports it (read by the js-yaml prototype's builder). Whether to remove it is a separate question.
- **The test network guard's false refusal** of a hostname target that resolves to loopback through a proxy. Task 2's test avoids it with an IP address.
- **`lucide-astro`** in `docs` is deprecated for `@lucide/astro`.

## Self-review

- **Coverage.** Each of the three updates has one task. Every source edit a prototype made is a step. The four findings with no task are under "Not in this plan".
- **What rests on a run.** Every expected count and error in the steps was seen by a prototype's builder, and the final counts by the lead on the three combined. The audit then ran every step. Written after it: the version assertion of Task 1 Step 1, whose expression the lead ran alone and not inside the test, and the two `grep` commands of Task 3 Step 6 in that exact form, run by nobody.
- **Line numbers** are from `main` at `8f1725f1`. A builder finds each site by the text beside it.
- **Not checked.** Any of the three in the packaged app or a real window. undici 8 against a real proxy or a real provider. The docs site after a deploy. Electron 45's bundled Node version against undici 8's floor of 22.19.
