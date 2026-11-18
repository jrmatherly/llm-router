# Gateway fork spec

LLM Router (LLMR) runs its requests through the `@the-next-ai/ai-gateway` package. This spec records the decision to own that package's build, the research behind the design, and what remains for the owner to decide. The plan that implements it is [`plans/completed/2026-11-18-gateway-fork.md`](../../plans/completed/2026-11-18-gateway-fork.md).

**Status, 2026-11-18: shipped.** LLMR `main` installs the fork's [`v1.0.22-llmr.2`](https://github.com/jrmatherly/llmr-gateway/releases/tag/v1.0.22-llmr.2) since [PR 110](https://github.com/jrmatherly/llm-router/pull/110) (`4a3e82d7`). The plan's status notes carry the evidence for each acceptance item. "The problem today" describes the state before this work.

## Goal

Every install of LLMR (`npm ci` on a laptop, CI, the Docker image, a desktop release) runs the same gateway bytes, built from a repository the project controls, with the gateway fixes LLMR needs as ordinary commits in that repository.

## The problem today

Each line is marked **measured** (run or read on 2026-11-18) or **recorded** (taken from the upstream review log and not re-run).

- `npm ci` installs `@the-next-ai/ai-gateway` 1.0.21 from npm, published 2026-09-08 (measured: `package-lock.json`, `npm view`).
- CI, the Docker image and releases do not ship that copy. The composite action `.github/actions/prepare-release-gateway` checks out `The-NeXT-AI/ai-gateway` at `0a2c0abd`, builds it, and each job installs the tarball over the npm copy with `npm install --no-save` (measured: the action and the three workflows).
- `0a2c0abd` is the tip of the upstream branch `feat/v1.0.22`. It is two commits ahead of upstream `main` and two behind (measured: `gh api .../compare`).
- The build from `0a2c0abd` also reports version `1.0.21`, so the version cannot tell the two builds apart (recorded).
- LLMR never compares gateway versions. It detects router-plugin support from three marker strings in the gateway's `dist/index.js` (measured: `routerPluginSupportMarkers` in `supervisor.ts`, and no semver use in `packages/core/src` or `build/`). A prerelease version string is therefore safe.
- The Docker image is assembled from two stages that can hold different gateways today. The build stage installs the tarball before bundling. The runtime stage copies `node_modules` from a `production-deps` stage that runs `npm ci` from the lockfile, which is the npm copy (measured: `Dockerfile`). Which copy a running container loads was not checked. With one locked gateway the question goes away.
- Local test runs and CI therefore test different gateways. Two wire tests fail locally and pass in CI for this reason (recorded in the 2026-11-18 handoff).
- Upstream is quiet. Its last push was 2026-10-09 and its last merged pull request 2026-09-17. The fixes LLMR needs are open and unreviewed there (measured: `gh repo view`, `gh pr list`).
- The gateway has two defects that LLMR's tests pin as 13 expected failures in `packages/core/test/integration/gateway/credential-and-model-routing.test.mjs` (measured: a run of that file reports 13 `# EXPECTED FAILURE` lines).
  - **Cut streams.** When a provider's stream breaks after its first chunk, the gateway child closes the socket with no terminal error frame. Five cases, all "via gateway child in public mode", which is what a default install runs.
  - **Safeguards.** Through a virtual model the gateway rebuilds the Anthropic request from an allowlist and drops `safeguards`, unknown request fields and `safeguard_results`. Eight cases.

## Decisions

| ID | Decision | Made by |
|---|---|---|
| G-1 | LLMR owns its gateway build. Fork `The-NeXT-AI/ai-gateway` under a new repository name, publish a tarball from a release workflow there, and point LLMR's dependency at that tarball. Gateway fixes are commits in the fork, never `.patch` files. This settles row 29 of the upstream review. | Jason, 2026-11-17 |
| G-2 | The audit program runs first, then this fork, then the upstream row ports. | Jason, 2026-11-17 |
| G-3 | The fork is `jrmatherly/llmr-gateway`, public, with Actions enabled. `jrmatherly/ai-gateway` is taken by an unrelated fork of an Azure sample (measured). | Jason, 2026-11-18 |
| G-13 | The fork takes the safeguards patch as written (option A in "The safeguards rejection"). A request that carries `safeguards` on a virtual model with internal tools is answered with HTTP 400. | Jason, 2026-11-18 |

The design choices below are the session's, made on 2026-11-18 from the research. Each can be overruled before the plan runs.

| ID | Choice | Why |
|---|---|---|
| G-4 | The fork keeps the npm package name `@the-next-ai/ai-gateway`. | LLMR resolves the gateway by that name in `build/esbuild.config.mjs`, `packages/core/src/gateway/internal/shared.ts`, the root `overrides` block and two architecture tests. Keeping the name means none of them change. Rejected: a new package name, which edits about ten files and changes nothing a user sees. |
| G-5 | Fork versions are `1.0.22-llmr.N` and tags are `v1.0.22-llmr.N`. | The version then identifies the bytes. `1.0.22` is the upstream branch the fork starts from. |
| G-6 | The fork's own work lives on a new default branch `llmr`, created at `0a2c0abd`. The fork's `main` stays a mirror of upstream `main`. The first release, `1.0.22-llmr.1`, adds only the version bump and the workflow change. | `0a2c0abd` and upstream `main` have diverged, so moving `main` would need a force push. LLMR's first pull request then swaps the delivery path without changing gateway source, since CI already runs `0a2c0abd`. A failure in it is a packaging failure, not a behaviour change. |
| G-7 | The two fixes come from the patch files upstream `claude-code-router` carries in `build/patches/`: `ai-gateway-stream-terminal-error.patch`, then `ai-gateway-native-safeguards.patch`. Each becomes one commit in the fork with attribution in the message. The second release is `1.0.22-llmr.2`. | Both are written against `0a2c0abd` and apply to it in that order (measured: `git apply --check`, then `git apply`). The stream patch includes the gateway's PR 39. Both are MIT licensed. Rejected: the gateway's PR 31, which conflicts with `0a2c0abd` in `src/gateway/handler.ts` and `src/gateway/routes.test.ts` (measured: `git merge`). The review log named PR 31 as a fix, but the pinned commit already carries a virtual-model streaming fix and none of the 13 cases is about it. |
| G-8 | The fork's release workflow runs on a `v*` tag. It checks that the tag matches `package.json`, runs install, both typechecks, the tests and the build, packs the tarball, and attaches it with a `sha256` file to a GitHub release. Upstream's `release.yml`, which publishes to npm, is deleted. | A GitHub release asset needs no npm account or token. A fork of a public repository is public, so `npm ci` downloads the asset without credentials. |
| G-9 | In `packages/core/package.json` and `packages/cli/package.json` the dependency becomes the release asset URL. `package-lock.json` records the URL and the tarball's `sha512` integrity. | npm 11.19.1 installs and locks a tarball URL dependency, follows a `github.com` redirect to do it, and `npm ci` fails with `EINTEGRITY` when the bytes do not match the lockfile (all three measured in scratch projects). A replaced release asset therefore fails the install. |
| G-10 | LLMR deletes the `prepare-release-gateway` action, the `gateway` jobs, every "download and install gateway" step in the three workflows, and the architecture assertions that pin them. One new architecture test pins the new rule. The opt-in local-checkout path stays: the Dockerfile's conditional tarball step, `build/docker-local-gateway.mjs`, `docker/local-ai-gateway/` and the `LLMR_DOCKER_GATEWAY_SOURCE_DIR` docs. | CI gets one install path, and the rule and its check change together. The local-checkout path is a documented developer feature with its own architecture tests, used by the image, Compose and smoke scripts (measured: `grep`). It does nothing unless a developer sets the variable, and it is how a fork change can be tried in an image before a release. |
| G-11 | Dependabot ignores `@the-next-ai/ai-gateway` in the root npm entry. A gateway bump is a manual edit of the URL in the two manifests followed by `npm install`. | What Dependabot does with a tarball URL dependency is not documented in anything this research found. The ignore entry makes the outcome the same either way. |
| G-12 | The 13 `gatewayDefect` markers and the helper are deleted in the pull request that moves LLMR to `1.0.22-llmr.2`. | They are the acceptance test. With the marker gone, a case that still fails turns CI red. |

## Acceptance

1. On a clean checkout of LLMR `main`, `npm ci` installs a gateway whose `package.json` version is `1.0.22-llmr.2`, with no further step.
2. The 13 cases pass with no `expectFailure`, locally and in CI.
3. No workflow or action in LLMR builds or installs a gateway tarball.
4. `#1852` in `october-issues-wire` and `recent issues` in `recent-issues-wire` pass locally.
5. The Tests workflow, including its Docker smoke job, is green on the merge commit.

## Global constraints

- Node `>=24` and npm only in LLMR. The fork keeps its own `engines` line.
- LLMR code goes through a branch and a squash-merged PR. This spec and its plan are docs and commit straight to `main`.
- Never `import()` the gateway package or run it in-process in a test or script. It starts a server on `*:3000` that never exits.
- Never hand-edit `package-lock.json`. npm regenerates it.
- A rule and the check that enforces it change in the same PR.
- No compatibility shim or migration. The project has no consumers (audit decision D-9).
- Actions in the fork's workflows are pinned to a commit SHA, checkouts set `persist-credentials: false`, and the default token permission is `contents: read`. Only the release job gets `contents: write`.

## Steps only the owner can do

- Done 2026-11-18: the fork's name and the go-ahead to create it as a public repository (G-3).
- Enable Actions on the fork. GitHub disables workflows on a new fork until the owner turns them on.
- Done 2026-11-18: the safeguards choice (G-13).
- Optional: turn on immutable releases in the fork. `v1.0.22-llmr.1` is not immutable (PR 109 review, `gh release view --json isImmutable`). A replaced asset fails every `npm ci` with an integrity error, which is safe but stops all installs.
- Optional, after the first release: a tag ruleset on the fork that restricts who can create `v*` tags.

## The safeguards rejection

Researched on 2026-11-18 for the owner's decision. Each line says how it is known.

**What `safeguards` is.** In auto mode, Claude Code asks the server to check each action as part of the session's own model request. It sends a `safeguards` body field with a paired `anthropic-beta` value and reads `safeguard_results` from the response. It does this by default whenever `ANTHROPIC_BASE_URL` points at a gateway, from Claude Code v2.1.278 (Claude Code docs: `permission-modes`, "Server-side classifier review"; `llm-gateway-protocol`, "Feature pass-through"; `auto-mode-classifier-billing`). The installed 2.1.327 binary builds the field as `safeguards: [{ type, classifier_context, ... }]` and only when the server check is on (read from the binary's strings, not run).

**What a gateway is asked to do.** Forward the header and the field unchanged, and return `safeguard_results` without dropping fields or rewriting tool-use IDs (same docs). When a response completes with no review results, Claude Code falls back to its own classifier requests and, on accounts billed for them, shows a notice once. When results arrive cut short or unreadable, it denies the action, and after ten such responses it stops the turn (docs: `errors`, "The server returned no safety verdict").

**What LLMR does today.** A direct model passes the field through. A virtual model drops `safeguards`, unknown request fields and `safeguard_results`, and keeps the beta header (recorded: the review log's PR 88 entry, measured in CI). So a Claude Code session on any Fusion model gets the documented fallback: its own classifier, no error. LLMR sets none of the auto mode variables for a profile (measured: `grep` finds `CLAUDE_CODE_AUTO_MODE_SERVER` only in the generated option list).

**What the patch changes.** Read from the patch file:

- Every unknown top-level field of an Anthropic request and response now survives a virtual model, `safeguards` and `safeguard_results` included. This is the fix for the eight cases.
- One new check in `src/gateway/handler.ts` returns HTTP 400 when the request is Anthropic format, its body has a `safeguards` key, and the virtual model has at least one internal tool. The message is "Server safeguards require client-owned tool execution. Select the native provider model or a virtual model without internal gateway tools." The patch's test shows that neither the tool nor the upstream is called.

**Who the 400 reaches.** A new Fusion model in LLMR's UI starts with the built-in vision tool (measured: `createVirtualModelDraft` in `packages/ui/src/pages/home/shared/virtual-models.ts` sets `toolsText` to it). Vision, web search, image and video generation and a custom MCP tool are what Fusion exists for (the Fusion docs page). So the check covers the ordinary Fusion model, not a corner case. It fires for Claude Code v2.1.278 or later, in auto mode, routed to such a model.

**What Claude Code does with that 400.** The user docs list no retry for a rejected `safeguards` field. The gateway guidance built into the 2.1.327 binary does: "If you or your upstream can't, answer `400 invalid_request_error` with a message that names `safeguards`: the client retries without them and runs the check itself with ordinary requests" (read from the binary's strings). A third party tested that on Claude Code 2.1.323 against a local stub and saw the retry without the beta value and the field (LogosOSS/Logos issue 161, comment of 2026-11-13). The patch's response is not in that form. `sendCountedBadRequest` answers `{"error": {"message": ...}}` with no `type` (read from `src/gateway/handler.ts` at the patched commit). The message does name `safeguards`. The stub experiment below shows that Claude Code accepts that body too.

**Why the patch rejects.** Its README gives the reason: with internal tools the gateway runs a tool loop of several upstream calls, and the server's verdicts are tied to tool-use IDs in one response. A verdict from one call cannot be trusted for another. Not passing `safeguards` through a tool loop is sound. Rejecting the request is one way to do that. Dropping the field is the other, and it is what the gateway does today.

**Options.**

| | Option | What a Claude Code user in auto mode sees on a Fusion model with a tool | Cost |
|---|---|---|---|
| A | Take the patch as written. | One 400 on the session's first request, then Claude Code stops sending the pair for that session and uses its own classifier (measured). LLMR's request log records that one failed request per session. | Nothing extra in the fork. The upstream never sees the beta value without its field in that session. |
| B | Take the patch, and replace the rejection with dropping `safeguards` for a virtual model that has internal tools. | The same as today: the documented fallback to Claude Code's own classifier. Server review starts working on Fusion models without tools and stays working on direct models. | One more commit in the fork, about ten lines and a rewritten test. The beta header is still forwarded without its field, as today. |
| C | Leave the safeguards patch out. Ship only the stream fix. | The same as today everywhere. | The eight cases stay expected failures, and server review never works through any virtual model. |

**Measured on 2026-11-18** with Claude Code 2.1.327 in `-p` auto mode, a fresh config directory, and a local stub of the Messages API (`research/2026-11-18-gateway-fork/`, where the README has the request logs):

| Stub behaviour | What Claude Code sent | Its log line |
|---|---|---|
| 400 with the specified body | Request 1 with the pair, answered 400. Every later request without the beta value and without the field. | "it is not sent again this session and auto mode decides with the local classifier" |
| 400 with the patch's own body (`{"error": {"message": ...}}`) | The same: one 400, then neither. | The same line. |
| 200 with no results (what a virtual model does today, and option B) | Request 1 with the pair. Later requests keep the beta value and drop the field. | "the platform gave no classification for this request (server_no_result) ... classifies locally for the rest of this session and stops sending the classifier context" |

Three things follow.

- Option A works with the patch exactly as written. It costs one rejected request per session, not one per request.
- After a fallback, Claude Code itself sends the beta value without the field. So a provider seeing the lone beta value is the client's own normal behaviour, not something option B introduces.
- In all three runs Claude Code printed: "An upcoming release removes this fallback. In sessions like this one, each checked action will then be asked about or denied." The binary carries the matching text for `CLAUDE_CODE_AUTO_MODE_SERVER=0`: "Claude Code no longer has a check of its own to use instead."

**Decided: A, the patch as written (G-13).** A and B end in the same place for the user, so the smaller change wins. A adds no commit of our own on top of upstream's patch, its one 400 per session is the rejection Claude Code is built to receive, and it keeps the provider from seeing the pair half-sent. B would need a custom commit to reach the same result.

**What this means beyond the fork.** Once Claude Code removes the local fallback, auto mode will work through LLMR only where a real verdict comes back: a direct Anthropic model, or a virtual model without internal tools on an Anthropic provider, which is the path this patch opens. On every other route each checked action will be asked about or denied, whatever the gateway does with the field. The only gateway-side answer for those routes is to produce verdicts itself, as one gateway already does (incoai/splash issue 589). That is a product decision for a later spec, not part of this one.

**What other gateways and providers show** (public issue reports, read on 2026-11-18).

- Anthropic with the field and the beta value answers 200 with `safeguard_results`. With the field and no beta value it answers 400 `safeguards: Extra inputs are not permitted` (PayPerQ/ppq-enclave-proxy issue 475, the maintainer's probe, 2026-11-16). That gateway now drops the field for every non-Anthropic route.
- The beta value is `dangerous-tool-use-2026-09-03` (the binary's strings, and farion1231/cc-switch issue 8072).
- z.ai's Anthropic-format endpoint receives the pair straight from Claude Code and the session falls back with the billing notice; nothing fails (zai-org/feedback issue 785, Claude Code 2.1.278). cc-switch reports the same for its Anthropic-format pass-through to third-party models and tells users to set `CLAUDE_CODE_AUTO_MODE_SERVER=0` for those providers (cc-switch issue 7625).
- A session that cannot fetch feature flags, for example with `DISABLE_TELEMETRY=1` or `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, has no local classifier to fall back to. Every checked action then needs approval, whether the gateway drops the field or rejects it. Only `CLAUDE_CODE_AUTO_MODE_SERVER=0` restores the local classifier (LogosOSS/Logos issue 161, reproduced there on 2.1.323; the Claude Code docs say such sessions ask the server by default from v2.1.282). LLMR sets neither variable (measured: `grep`), so this depends on the user's own environment.

**A short-lived follow-up in LLMR.** LLMR writes each Claude Code profile's environment and knows its route. Setting `CLAUDE_CODE_AUTO_MODE_SERVER=0` for a profile whose route cannot return verdicts removes the notice and the wasted first request today, and cc-switch shipped that remedy. The measured notice says the local classifier it relies on is being removed, so this buys time only. Not planned here.

**Not verified.**

- What Anthropic answers when the beta value arrives without the `safeguards` field. Claude Code sends exactly that after a fallback (measured above), so a rejection would break its own fallback. Still not probed against Anthropic directly; one request with a real key settles it.
- What a strict non-Anthropic provider does with a forwarded `safeguards` field. If it answers 400, the measured retry applies. Direct models already forward the field today.
- Interactive sessions. The runs above were `-p`. The binary has one branch where a rejected request "is not sent again", for sessions whose tools may run on a tools host; it was not reached here.
- When the fallback is removed. The notice gives no version or date.

## Deferred, with reasons

- **Merging upstream `main` into the fork.** Two commits, the gateway's PR 29 (reasoning text emitted as a summary). The merge is clean before and after the two fixes (measured). It changes behaviour LLMR has not tested, so it belongs with the upstream row ports.
- **The gateway's other open pull requests** (28, 30, 31, 35, 36, 41, 42, 43). None is needed for acceptance.
- **Build provenance attestation on the release asset.** The lockfile integrity already pins the bytes.
- **Renaming the package.** See G-4.

## Not verified by anyone

- Verified since, 2026-11-18: the two patches make all 13 cases pass (plan Task 3, Step 4).
- Verified since, 2026-11-18: the fork's full test suite passes at `0a2c0abd` (plan Task 1).
- How a later npm major treats tarball URL dependencies. npm 11.19.1 has an `allow-remote` setting that defaults to `all` (measured: `npm config ls -l`). One secondary source says npm 12 turns remote fetches off by default. The check is `npm config get allow-remote` on the new major before LLMR adopts it. A project `.npmrc` line would settle it then.
- Whether Dependabot would have opened pull requests for the URL dependency. G-11 makes the answer irrelevant.
