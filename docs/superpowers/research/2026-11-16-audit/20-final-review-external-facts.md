# Final review: external facts

Unedited report from one read-only pass on 2026-11-16, at commit `136ad730`. It is input to [the audit remediation spec](../../specs/2026-11-16-audit-remediation.md), not a decision record. Its confirmed findings were applied to the plans before they were committed. Paths under `<session scratchpad>` no longer exist.

---

1. Verdict: external facts are mostly sound. I found two findings that will cause rework (one install that fails today, one Dependabot entry that cannot do what its text implies) and one minor.

**Findings**

1. **desktop-hardening, DH-2 Task 2 Step 1** | causes rework | `npm install --save-dev tldts@^7.5.4 -w @llm-router/electron` fails on this machine until 2026-11-22.
   - Evidence: `npm view tldts time` gives 7.5.4 published 2026-11-15T09:00Z. With `min-release-age=7` the install returned `No matching version found for tldts@^7.5.4 with a date before 11/9/2026`. The index lists only `better-sqlite3` and `electron` as "before EU-1 and EU-2" cooldown items, so this one is unlisted.
   - Fix: change the command and the manifest range to `tldts@^7.4.28` (7.4.28 was published 2026-11-12, so it is installable on 2026-11-19; the 7.4.19 I installed in scratch works today). Or keep `^7.5.4` and add "installable from 2026-11-22; wait or get Jason's approval for `--min-release-age=0`". Add `tldts` with its date to the index cooldown line. The plan's API claims about `tldts` are correct (see section 4).

2. **release-safety, Task 4.1 Step 4 and RS-5 Step 1** | causes rework | The `docker` Dependabot entry for `/` will not touch the `Dockerfile`'s `ARG NODE_IMAGE=...@sha256` digests. This settles the open question as no, from source and not from a run.
   - Evidence: the parser in `dependabot-core` (`docker/lib/dependabot/docker/file_parser.rb`) only reads lines matching `^FROM\s+...`. The image name must match `NAME_COMPONENT = [a-z\d]+...` (`docker/lib/dependabot/shared/shared_file_parser.rb:18-30`). The repo's `Dockerfile:4,20,29` are `FROM ${NODE_IMAGE}` and `${RUNTIME_NODE_IMAGE}`. `$` does not match, and `ARG` lines are never parsed. The `Dockerfile` therefore yields zero dependencies. Source read, not run.
   - The plan's RS-5 Step 1 read-back ("a Docker PR that bumps the digest in `Dockerfile:1-2`") can never succeed. The plan's "if either updater finds nothing, record it as a new finding" rule would still apply, so it is not wrong, only predictable.
   - Fix: replace the "Two things are unverified" paragraph with "The `docker` updater reads only literal `FROM image:tag@sha256` lines. The `Dockerfile` uses `FROM ${NODE_IMAGE}`, so this entry finds nothing until the digest sits in a literal `FROM` line. The owner decides whether to restructure, per D-6-style decision. Keep the entry or drop it." Also note the digest is shared by `tests/architecture/dockerfile.test.mjs:12`, which reads the `ARG` lines.

3. **release-safety, Task 4.1 table** | minor | The `docker-compose` entry covers only `/docker/claude-apps-gateway`. The root `docker-compose.yml` uses `build:` and `image: llm-router:local`, so nothing to bump there. No change is needed. I mention it only so nobody adds a second entry.

**3. Unverified (cannot settle from primary sources today)**
- Whether `chrome.action.openPopup()` works when called from a service worker after a content-script message. The Chrome docs (127+ for all extensions) do not state a gesture rule. The plan's Task 3 Step 2 measures it with both branches covered.
- What `Origin` an extension service-worker `fetch` (POST, JSON) sends, and whether a preflight occurs. My reading is that Chrome sends `chrome-extension://<id>` and skips the preflight for host-permission origins, but I found no doc. DH Task 3 Step 1 measures it and has fallbacks.
- `better-sqlite3@13.2.0` prebuild layout (eight `<platform>-<arch>.node` files). `npm pack` is blocked until 2026-11-21 by the cooldown. `npm view` confirms no install script, `gypfile: false`, `node-addon-api ^8.0.0` and `engines.node >=22`.
- Whether the actions nested in `upload-pages-artifact` are SHA-pinned. The plan already flags this and RS-5 Step 3 has a rollback.
- Windows CRLF on checkout. The plan flags it. `.gitattributes` `*.runtime.cjs text eol=lf` is valid.

**4. Checked and found sound (about 60 claims)**
- **`gh` flags** (`gh` 2.104.0 `--help`): `release create --draft --verify-tag --generate-notes --title`, `release edit --draft=false --latest`, `release upload --clobber`, `release delete --yes --cleanup-tag`, `run list --workflow --commit --json status,conclusion,url`, `secret set/list/delete --env`, and `release view --json isDraft,assets`.
- **`gh` finds a draft by tag.** `FetchRelease` in `cli/cli` `pkg/cmd/release/shared/fetch.go` has a GraphQL "draft by pending tag" lookup. The runner image has `gh` 2.103.3. This settles spec item "gh finds draft by tag" as yes.
- **electron-builder.** `gitHubPublisher.js:63-97` reuses a draft and never flips it. It skips a release published more than 2 hours ago with a warning.
- **Skipped required checks.** GitHub docs say a conditionally skipped job counts as passing, and a job skipped because a dependency failed may not block. A path-filtered workflow stays Pending. The plan's reasoning and its decision to require `📦 Build gateway` both hold.
- **REST schemas** (current OpenAPI description): `actions/permissions` PUT has `sha_pinning_required`. Environment PUT takes `deployment_branch_policy`. `deployment-branch-policies` POST `type` is `branch|tag`. Rulesets PUT and POST take the body the plan sends. `automated-security-fixes` has get, put and delete.
- **Live state matches the "Now" column.** The ruleset has the two checks and the admin bypass, `sha_pinning_required` is false, merge and rebase are allowed, and there are no environments named `release`. The five Apple secrets exist at repo level. I printed the plan's jq PUT body without sending it. It is valid and holds four checks.
- **Pins and actions.** Every SHA pin in the plan's YAML matches one already in `.github/workflows`. The `concurrency` expressions are valid. `docker/build-push-action` `load: true` with a single platform and `cache-from: type=gha` is valid.
- **Dependabot.** The compose fetcher regex `(docker-)?compose(-[\w]+)?(?>\.[\w-]+)?\.ya?ml` matches `compose.yaml`. `docker` and `docker-compose` are supported ecosystems.
- **Biome 2.6.6.** I installed it in scratch and ran the plan's `biome.json` verbatim. It loads with no error, and a bogus rule name does error, so all rule and group names are real. `preset`, per-group `preset: "none"`, `assist`, `vcs` and `files.includes` negation all work. `lint --error-on-warnings`, repeated `--only`, `--write --unsafe`, `--max-diagnostics` and `--reporter` all work. `biome ci` has `--error-on-warnings`. Repeated `--only` with `--write --unsafe` fixed my scratch file.
- **Publish dates.** `better-sqlite3@13.2.0` published 2026-11-14, so installable 2026-11-21. `electron@45.3.3` published 2026-11-16, so 2026-11-23. Biome 2.6.6 published 11-06 is installable now, 2.6.7 on 11-18, 2.6.8 on 11-22. All match the index.
- **Versions.** `electron-builder` `latest` is 26.18.0 and `v26` is 26.18.1. `electron-updater` `v26` is 6.8.12, `latest` is 6.8.11. `electron` `latest` is 45.3.3. `app-builder-lib@26.18.1` renames `electron_wer.dll` for Electron 45.
- **Electron.** In 45.0.0 typings `openAsHidden` has 0 hits, `writeText` returns `Promise<void>`, and `senderFrame` is `WebFrameMain | null` (the plan handles null). The Electron docs list macOS 13, `openAsHidden` removal and the clipboard rearchitecture under 44. No other 43 to 45 breaking change touches this repo: the preload bundle only requires `"electron"`, and the builder targets x64 only.
- **TypeScript 6.0.3 and esbuild 0.28.2** (scratch project). A `.runtime.cjs` file with a `.runtime.d.cts` declaration and `export =` imports cleanly under the root options. The `checkJs` project with `strict: false` and `allowJs` passes. The `--loader:.runtime.cjs=text` flag emits the file as a string.
- **tldts.** `getPublicSuffix` with `allowPrivateDomains` returns: `com`→`com`, `co.uk`→`co.uk`, `github.io`→`github.io`, `intranet`→`intranet`, `user.github.io`→`github.io`, `192.168.1.10`→`null`, `localhost`→`localhost`. Every test expectation in the plan holds.
- **Chrome.** `permissions.request` needs a user gesture. `optional_host_permissions` with `https://*/*` is allowed. `openPopup` needs Chrome 127 or later.
- **SDK retries.** Anthropic and OpenAI SDK sources both retry connection errors, 408, 409, 429 and 5xx, with 2 retries by default.
- **Other facts.** Auth headers `x-api-key`, `Authorization`, `api-key` and `x-goog-api-key` are real. `better-sqlite3@13.2.0` has no install script. `s.qiniu.com/AVjMVf` still redirects to `www.qiniu.com/ai/agent` with `cps_key` and five `utm_` parameters. The `Response.text()` BOM claim in CG-6 is per the Fetch spec. `node:test` `todo`, `t.mock.method` and `t.mock.timers` Date mocking are available on Node 24.22.3.

Skipped: Node `fs` rename-over-open-file behaviour on Windows (CG-3), the CSP meta directive list in DH (no experiment run), and `dialog.showMessageBox` options. Only the first two are external facts I could not exercise here. Nothing in the repo was edited. Scratch work is under `<session scratchpad>/final-review-external/`.
