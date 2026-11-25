# Windows Faults from the First Windows Test Run Implementation Plan

> **Status, 2026-11-25 (UTC): Tasks 1 to 5 are built and merged as PR 161 (`a3c6864d`), cut from `main` after PR 159 merged with the Windows entry allowed to fail. Tasks 6 to 12 are built and merged as PR 162 (`f5c1d9eb`), where the Windows entry passed in full and Task 12 made it block again.** The plan was written, audited and corrected before the build. Still open with the owner from the table at the end: questions 3 to 7, 9 and 11. Question 2, the routing guide's `api.env` example, was fixed in PR 162. Five investigations confirmed each fault on a GitHub `windows-2025` runner and prototyped a fix there. Their notes are outside the repo, in `private/research/2026-11-25-windows-faults/`. The plan author read every file and symbol named below at `origin/ci/package-suites-matrix` `6e9837c7` and ran none of the new tests. The text was audited on another model on 2026-11-25 by building the tasks on macOS in throwaway worktrees at the same commit. The two audits found 4 Blockers, 22 Corrections and 19 Notes. Each was checked against the code again and is in this text. One more Windows run, 45662096506, settled the two Blockers that only Windows could settle. They are the percent rule of Task 1 and the launcher path form of Task 3. What is still proven only by read or is inferred is listed under "Not verified". That covers every Windows-only test of this plan, since the audits ran on macOS and those tests only skipped there, the first-step runs of Tasks 7 and 8, the launch-path wait of Task 9 and the status-poll change of Task 10.

> **Delivery.** [`2026-11-25-delivery-order.md`](../2026-11-25-delivery-order.md) has no row for this plan yet. Its decisions 1 to 8 apply. No task waits for a VM check, and tasks that share files land as one branch with one commit per task. Its question 12, how draft PR 159 lands, is not answered. The Order section below covers both answers.

> **Some detail is kept out of this file.** The repository is public, and this file describes each change by what the code does. Some test inputs and background for Tasks 1 to 4 are in `private/plans/2026-11-25-windows-faults-private-detail.md`, which git ignores. Read it before you build Tasks 1 to 4. Do not copy its sentences into a commit, a PR, a test name or a release note.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person who runs LLM Router on Windows gets what a person on macOS gets. A prompt reaches a batch-file agent CLI intact. An npm-installed CLI is found. The window does not freeze while LLM Router looks for desktop apps. Environment names are matched the way Windows matches them. The Windows job of the Tests workflow then passes, and can block a release.

**Architecture:** Twelve tasks in two PRs. The first PR adds one TypeScript module that finds a command through `PATH` and `PATHEXT` and builds the launch for it, gives the Codex runtime script its own copy of the same rules with a test that runs one table through both, fixes the profile launcher's command line, and makes the environment filter, `api.env` and the environment merge treat names without regard to letter case on Windows. The second PR uses the module at the callers that start a CLI by name, takes the blocking child processes out of app discovery and out of a 2 second timer, and gives one raw trace test a clock it controls.

**Tech Stack:** TypeScript, Node 24.22.3, `node:test` with `node:assert/strict`, esbuild test bundles (`build/test.mjs`), GitHub Actions `windows-2025`, `cmd.exe`, npm's `cmd-shim` output.

**Spec:** The five research files, `1-cmd-escape.md` to `5-raw-trace.md`, with their evidence folders and prototype patches. A prototype patch is evidence and a starting point. Read it against the code before you use a line of it. `5-raw-trace-prototype.patch` does not apply with `git apply` (run, macOS, audit), and Task 11 says what to do with it. The two audits are `private/audits/2026-11-25-audit-windows-faults-a.md` and `-b.md`. The run that settled the percent rule and the path form is saved as `6-percent-and-path-probe.txt` in the research folder, with its script beside it.

**Evidence status.** Each claim below carries one of four labels: run (Windows), run (macOS), read, inferred. A label from the research was not upgraded. "Run (macOS, audit)" means an audit built the task in a throwaway worktree and ran the test or the mutation there, against a stand-in where the task depends on another task's module. "Read by a subagent" means a fetch agent quoted a web page and the investigator did not open it.

- The percent rule and the launcher path form: run (Windows), Actions run 45662096506, Windows 10.0.26100, Node 24.22.3, inert inputs only.

- Fault 2 (OpenCode version): run (Windows), Actions run 45650512829.
- Fault 3 (app discovery): run (Windows), runs 45650772681, 45651456248 and 45652380219.
- Fault 5 (raw trace test): run (Windows), runs 45650415813, 45651149128 and 45651555996, and run (macOS).
- Faults 1 and 4: run (Windows). Their run ids are in the private file.
- The prototypes for faults 1, 3, 4 and 5 passed on Windows as throwaway branches, since deleted. No prototype built the shared module of Task 1 in the shape this plan gives it. Fault 2's prototype is the nearest, and it refused unusual arguments where this plan escapes them.

**Where the code contradicts a research file.** Checked at `6e9837c7`.

- `4-env-case.md` counts 17 call sites of `withoutLlmrSecretEnv`. There are 16 (read, `grep` over `packages/*/src`). Twelve spread it under other layers and four pass it whole.
- `4-env-case.md` names the runtime function `claudeCodeWorkCommand`. It is `claudeCommand` (read).
- `4-env-case.md` lists a profile launch's `plan.env` as user-authored. Every `env` that `buildProfileLaunchPlan` returns holds names LLM Router chose (read, `launch-core.ts`). The same file misses two merges that do carry a profile's own `env`: `launchOpenCodeAppProfile` in `agents/opencode/app-launch.ts` and `claudeAppLaunchEnv` in `agents/claude-app/launch.ts` (read). Task 5 moves every spread, so the list matters only for the PR text.
- `2-opencode-version.md` lists `spawnAgentCli` as checked and not at fault. `1-cmd-escape.md` ran it on Windows and found two faults in it. The second file is right (run, Windows). The first looked only at whether a command is found.
- `2-opencode-version.md` calls the runtime's resolver the only `PATHEXT` resolver in the product. `3-appinfo-block.md`'s prototype adds a second walk of `PATH` in app discovery. Task 9 takes its directory and extension lists from Task 1's module so the rule for reading `Path` lives in one place.
- The two files disagree on a batch file whose own path holds `%`. File 2 refuses it (run, Windows, the refusal). File 1 escapes the path with one caret and never ran such a path. Run 45662096506 settled it. With one caret before each metacharacter, a batch file in a directory named `pct%OS%dir` started and every argument arrived (run, Windows). The refusal is not needed.

**Where an audit contradicts the research or the first draft of this plan.** Each is corrected in the task it belongs to.

- Audit A said the caret form of a batch file's path had run only on paths with no space. The research's own run holds two rows for a directory named `sp ace (x86) & co`, both intact on the prototype (read, `run-45651966903.txt`), and run 45662096506 ran that directory again with four argument rows in two shapes (run, Windows). The caret form stays.
- Audit A inferred that a percent form with a modifier is expanded after the first draft's escaping. Run 45662096506 confirmed it for some forms and refuted it for others (run, Windows). The private file says which. Task 1 has the rule that came out of it.
- `ProfileLaunchSpawnCommand` has no user outside `launch-core.ts`. `ToolhubBackend` does not exist, and the class is `StdioMcpClient`. No test drives a Claude Code turn today. `tests/architecture/child-env.test.mjs` already exists. All four are read.

## Decisions this plan rests on

Made by the session that ordered this plan or by the plan author. Each is open to change in review.

- **Session.** The fixes are built on a branch cut from `ci/package-suites-matrix`, so every commit gets a Windows run from the `platforms` job.
- **Session.** One shared resolver in TypeScript. The Codex runtime script ships as text and cannot import it, so it keeps a copy. A test runs one table through both.
- **Session.** A fault the research marked inferred gets a task whose first step is the Windows test that confirms or refutes it. Tasks 7 and 8.
- **Session.** No compatibility path and no migration code. The routing guide's `api.env("LLMR_ROUTING_POLICY_TOKEN")` example is a question for the owner, not a task.
- **Plan author.** The shared module lands in the first PR, not the second. `profileLaunchSpawnCommand` needs its batch-file launch, and three copies of that escaping would be one too many.
- **Plan author.** Two PRs, although Tasks 7 and 10 meet Tasks 3 and 5 in `tool-discovery.ts`, `toolhub-mcp.ts` and `launch-service.ts`, and decision 3 would make that one PR. The first PR holds the two tasks with private detail, and it should not wait for the review of seven more commits. The second PR is built on the first.
- **Plan author.** A batch file that npm did not write gets best-effort escaping, and a line break in an argument is refused with an error. The other choice is under "Open with the owner".
- **Plan author.** The tests in the public tree assert that each argument arrives intact, with inert text. The private file says why that is enough.
- **Plan author.** `mergeChildEnv` replaces every spread of `withoutLlmrSecretEnv()`, not only the ones with a user's layer, and an architecture test bans the spread.
- **Plan author.** The 2 second monitor leaves an entry alone when its probe fails or times out. Today a failed probe removes the entry.
- **Plan author.** The Appx package list is loaded off the event loop and reloaded when a lookup finds it older than 30 seconds. The prototype loaded it once per process.
- **Plan author.** The names in the Interfaces blocks.
- **Correction pass, from run 45662096506.** The characters that get a caret are the runtime's list plus `:`. The other proven choice, the `%%cd:~,%` form that Rust's standard library writes, is not used, because it leans on the `cd` dynamic variable and on command extensions being on.
- **Correction pass, from audit B.** An app launch waits for the package list and `getAppInfo` does not. The window's status poll does not probe an entry that has a monitor. Both are under "Open with the owner" with the smaller choice named.

## Global Constraints

- No outside users. No compatibility path and no migration code. Never weigh upstream parity. English only.
- Double quotes, semicolons, two-space indent. Object keys and type members alphabetized where the surrounding file does it. `type` aliases. No comments except a non-obvious why.
- Tests are `node:test` with `node:assert/strict`, named by behaviour. Core tests are `*.test.mjs`. A test that can only run on Windows carries `{ skip: process.platform !== "win32" }` and is paired with one that runs everywhere, through an injected host or a stubbed `process.platform`, where the code allows it.
- One test file: `node build/test.mjs <pkg> && node --test .test-dist/<pkg>/test/<unit|integration|component|architecture>/<path>.test.js`. Never pass `--scope`. Keep the `&&`, or check the build's exit code. A failed build leaves the old `.test-dist` in place, and `node --test` then reports a pass on stale files (run, macOS, audit).
- A "run" in a step means the builder ran it. A result the audits ran on macOS is not a Windows result. Every `{ skip: process.platform !== "win32" }` test in this plan has only ever skipped.
- Read a file with Read before you change it, so its path-scoped rule loads. `mcp-subprocess.md` applies to Tasks 5 and 7: run `npm run build:assets` after touching `packages/core/src/mcp/`, then `git checkout -- packages/core/models.json packages/ui/src/generated`.
- `cli-middleware-runtime-source.runtime.cjs` ships as text. Biome does not lint it, and `npm run typecheck` checks it without strict mode. Tasks 2, 5 and 8 edit it on purpose. Nothing else does.
- The architecture suite does not run on the Windows job. A test that must run on Windows lives in a package suite.
- A Windows result comes from the `platforms` job of the PR's own Tests run. Never push a probe branch that prints an input from the private file. Workflow logs of a public repository are public.
- Before each PR: `npm run typecheck`, `npm run lint`, `npm run test:architecture`, `npm run test:core`, `npm run test:cli`, and a green Windows entry of the `platforms` job for the PR's last commit.
- The repository is public. Describe a change by what the code does.
- Merging needs the owner's word, once per PR.
- Never start LLM Router outside the test runner. Never read or write the real `~/.codex`, `~/.claude`, `~/.claude.json` or `~/.llm-router`.

## Review Focus

Each line names a condition no task's first test covers. The test that pins it is in the step named at the end.

1. The agent CLI is named without an extension and npm put an extensionless shell script beside its `.cmd`. The `.cmd` must be chosen. Task 1, Step 1.
2. The environment given to the resolver spells the path variable `Path`, or holds two spellings. The resolver reads the one a child process would get. Task 1, Step 1.
3. A shim that npm did not write, or one that passes its own flags to node. It is not started directly. It goes through `cmd.exe`. Task 1, Step 1.
4. A refusal thrown by `spawnAgentCli` inside `runCodexCliMiddleware`, two lines after `createEphemeralCodexApiKeyBootstrap`. The bootstrap writes `auth.json` when it is created (read), and nothing it wrote may be left behind. Task 2, Step 4.
5. A profile launcher started with no arguments. It must start. Today the desktop app's call fails for every `.cmd` launcher (run, Windows). Task 3, Step 1.
6. A name such as `LLMR_REMOTE_SYNC_API_KEY_FILE` in mixed case. The filter keeps it, as it keeps the uppercase form. Task 4, Step 1.
7. A route script on macOS or Linux asks for `path`. It gets nothing, as today. Task 4, Step 1.
8. A probe of an adopted app that times out under load. The entry stays. Task 10, Step 1.
9. A lookup that runs before the Appx list has loaded, and one that runs after the load failed. Neither throws, and the second starts a new load. Task 9, Step 1.
10. An argument with a percent sign and a colon, such as `at 10:30` beside `100%`. It arrives byte for byte through `cmd.exe`. Task 1, Step 1, tests 7 and 12.
11. An app launch from a process that has just started, as every `llmr <profile> app` is. When its first look finds nothing, it waits for the package list and looks again. Task 9, Step 1, test 8.
12. The window's own 2 second status call while an adopted app runs. It starts no blocking process. Task 10, Step 1, test 5.
13. A launcher in a folder whose name holds a space, parentheses and `&`. It starts. Task 3, Step 1, test 4.

## Not in this plan

- **The generated `llmr.cmd` dispatcher.** It hands a profile's arguments on with `call "<wrapper>" %*`. `100% sure` arrives as `100 sure` and `caret ^ x` as `caret ^^ x` (run, Windows). Text typed by the person, a wrong result. It needs the dispatcher rewritten, which is its own change.
- **A line break through LLM Router's own wrapper.** `llmr <profile> cli -- <text with a line break>` passes through a generated `.cmd` wrapper, and `cmd.exe` cannot carry a line break. After Task 3 it is refused with an error. Today it is cut without one (run, Windows).
- **A prompt over 32,767 characters.** That is Windows' own limit for a command line (run, Windows, `spawn ENAMETOOLONG`). Sending the prompt on stdin would lift it, per agent.
- **`windowsBatchEscapeValue`** does not handle `!` (read). The values are profile configuration.
- **`readRemoteSyncApiKey`** runs its helper with `shell: true` on Windows. The value is machine configuration (read).
- **Exact-name deletes on an environment copy**, about 15 of them, such as `delete env.ELECTRON_RUN_AS_NODE` (inferred from the sort rule that was run). They miss a spelling in another case that the user set. None is a secret. After Task 5 the fix is `mergeChildEnv(env, { NAME: undefined })`, one site at a time.
- **The gateway child's `NO_PROXY` read** in `createGatewayProcessEnv` misses an inherited `No_Proxy` (inferred).
- **The other blocking child processes** that a click starts: `findWindowsExecutablePid`, `sendProfileProcessSignal`, `ensureWindowsUserPath`, `cloneFileWithMacCp` (read). Each runs once per user action.
- **A Desktop folder redirected to OneDrive.** Task 9 reads shortcut folders from `APPDATA`, `ProgramData`, `USERPROFILE` and `PUBLIC`, so it misses one (inferred).
- **Key and session files protected by mode `0600` only**, and the two stores with no `close`. The delivery index lists them under "Windows, gaps the review named".
- **pnpm, Yarn and Bun shims.** Only npm's was run. Another tool's shim that does not match npm's text goes through `cmd.exe`, which works for everything but a line break, as long as the shim forwards with a plain `%*`.
- **A batch file that forwards with `call ... %*`.** `call` parses the line once more. Through such a file `100% sure` arrived as `100 sure`, `%OS%` as its value and `caret ^ x` as `caret ^^ x`, with every escape tried (run, Windows, 45662096506, 9 of 25 rows intact). No escape on the caller's side can fix a parse the callee adds. It is the same fault as the `llmr.cmd` dispatcher above.
- **The gateway's own start of a stdio MCP server.** The core runtime merges `{...process.env, ...server.env}` itself (read, the comment in `config-compiler.ts`), so a server's `Path` there loses to an inherited `PATH`. Task 5 does not reach the gateway's code.
- **A launched app whose launcher process has exited.** The status poll then runs the blocking probe for it, as today (inferred by audit B from `profileAppRunningWithProbe`). Task 10 covers adopted apps, which are the entries with a monitor.
- **The `StdioMcpClient` site of Task 7 has no test off Windows.** `toolhub-mcp.ts` exports nothing and runs in a child process, where a test cannot stub the platform (read).

## Conflicts with other plans

- **Batches 11, 13a and 16** change `raw-trace-sync.ts` and its test file. Task 11 adds a dependency and changes three clock reads. Whichever lands second rebases. Batch 11 changes when a source scan runs, and Task 11's test counts clock reads per scan, so after either rebase run that test 200 times at eight at a time.
- **Batch 8** (`fix/save-restore-statuses`) changes `cli.ts` and `launch-service.ts` (`getProfileOpenCommand`, `openProfileFromLlmr`). Task 5 changes one object literal in `cli.ts`. Task 9 adds one `await` in `openProfileFromLlmr`. Task 10 changes the monitor functions and `getProfileRuntimeStatus` in `launch-service.ts`.
- **Batches 6 to 10b** change `profiles/service.ts`. No task here does.
- **Draft PR 159** changed `app-info-paths.test.mjs`, `local-agent-provider-opencode-freetier.test.mjs` and `model-catalog-startup.test.mjs`. Tasks 6 and 9 rely on those versions.

## Order

| Order | Task | PR | Why here |
|---|---|---|---|
| 1 | Task 1 | A | Tasks 2, 3, 6, 7 and 9 use its module or its table of cases. |
| 2 | Task 2 | A | The runtime copy, checked against Task 1 by the parity test. |
| 3 | Task 3 | A | Uses Task 1's batch-file launch. |
| 4 | Task 4 | A | Independent of Tasks 1 to 3. Same PR because it carries private detail. |
| 5 | Task 5 | A | Builds on Task 4's file. |
| 6 | Task 6 | B | First caller of Task 1's module outside PR A. |
| 7 | Task 7 | B | Changes the two `spawn` calls whose `env` line Task 5 changed. |
| 8 | Task 8 | B | Changes the runtime script after Task 2. |
| 9 | Task 9 | B | Uses Task 1's search path. |
| 10 | Task 10 | B | Changes `launch-service.ts` after Tasks 3 and 5. |
| 11 | Task 11 | B | Independent. Here so PR B ends with every Windows test green. |
| 12 | Task 12 | B | Last. It makes the Windows job block a release, where that still needs a change. |

PR A is branch `fix/windows-launch-and-env`. PR B is branch `fix/windows-platform-faults`, cut from PR A's tip. After PR A the Windows job still fails three tests, which Tasks 6, 9 and 11 fix. That is expected, and PR A's text says so.

**What a commit can and cannot do about the Windows entry.** The ruleset on `main` (25837404, "main: tests must pass") requires three checks: `🧪 Unit and architecture`, `🎭 End to end` and `🐳 Docker smoke` (run, `gh api repos/{owner}/{repo}/rules/branches/main`). The two `platforms` entries, `🧪 Unit (Windows)` and `🧪 Unit (Intel Mac)`, are not in that list. So a red Windows entry does not stop a merge. It does stop a release, because `scripts/release.mjs` refuses unless the Tests run for `HEAD` concluded `success`, and one failed matrix entry fails the run (read). A commit can keep `continue-on-error` out of the job, which `tests/architecture/workflow-permissions.test.mjs` already asserts on this branch (read). A commit cannot make a check required. That is a repository setting, and it is question 9 under "Open with the owner". Until he changes it, "nothing merges while Windows is red" is a rule for the people merging, and no setting enforces it.

**How the two PRs land depends on the owner's answer to question 12 of the delivery index.**

- **If PR 159 merges first, with the Windows entry allowed to fail.** PR A is cut from `main`. PR B is cut from PR A, then rebased on `main` when PR A has merged. Task 12 removes the allowance and puts back the architecture test's ban on `continue-on-error`.
- **If PR 159 does not merge first.** PR A is cut from `ci/package-suites-matrix` and PR B from PR A. Nothing merges until the Windows entry is green at PR B's tip. Then the three land in one sitting, PR 159, PR A, PR B, each on the owner's word. After each squash merge the next branch is rebased with `git rebase --onto main <the branch it was cut from>`. Between the first merge and the third, `main` has a red Windows entry and `npm run release` refuses. Task 12 has nothing to change in this case.

---

### Task 1: One module finds a command and builds its launch

Today the product has one resolver for `PATH` and `PATHEXT`, inside the Codex runtime script, where TypeScript cannot reach it. After this task TypeScript code has `packages/core/src/platform/command-path.ts`. It changes no caller. Tasks 3, 6, 7 and 9 are its callers.

**Evidence.** On Windows, `spawn` and `execFileSync` with a bare name find only `.com` and `.exe` (run, Windows). A `.cmd` given to them without a shell throws `EINVAL` (run, Windows). npm installs three files per bin, an extensionless shell script, a `.cmd` and a `.ps1`, and no `.exe` (run, Windows). Starting what an npm shim wraps, with an argument array and no `cmd.exe`, carried every argument the probe tried except one of 40,000 characters (run, Windows, as the prototype inside the runtime script). The same rules as a TypeScript module were not run.

**Files:**
- Create: `packages/core/src/platform/command-path.ts`
- Create: `packages/core/test/support/windows-command-cases.mjs`
- Test: create `packages/core/test/unit/platform/command-path.test.mjs`

**Interfaces:**
- Produces, in `command-path.ts`:
  - `type CommandLaunch = { args: string[]; command: string; windowsVerbatimArguments?: true };`
  - `type CommandPathHost = { isFile: (file: string) => boolean; platform: NodeJS.Platform; readText: (file: string) => string | undefined };` The default host uses `statSync`, `process.platform` and `readFileSync`. A test passes its own, so the Windows rules run on any platform. With `platform: "win32"` the module joins paths with `path.win32`.
  - `commandSearchPath(env?: NodeJS.ProcessEnv): { directories: string[]; extensions: string[] }`. It finds the path key without regard to letter case. With two spellings it takes the first in sort order, which is the one Node gives a child (run, Windows). With `env` left out it reads `process.env`. With an `env` that holds no path key, `directories` is empty, and it does not fall back to `process.env`. The runtime script falls back today (read), and Task 2 removes that so the two copies agree. `extensions` comes from `PATHEXT`, read the same way, else `.COM;.EXE;.BAT;.CMD`.
  - `resolveCommandFile(command: string, env?: NodeJS.ProcessEnv, host?: Partial<CommandPathHost>): string`. Off Windows it returns `command`. On Windows it strips one pair of surrounding quotes, then: a name with an extension is tried as it is; a bare name is tried with each extension and never without one; a name with a path separator is not searched on the path; otherwise each directory in order, and inside a directory each extension in order. The current directory is never searched. It returns `""` when nothing is found. The file it returns is the candidate it built, so a bare `pi` found through the default `PATHEXT` comes back as `pi.CMD`, whatever the case on disk.
  - `npmShimTarget(shimText: string): { runsNode: boolean; target: string } | undefined`. A pure function of the file's text. It answers only for the two texts npm writes, given under Step 1. It matches the whole text against those two templates, with only the relative target free. A file with one more line, or with another program in `SET "_prog=..."`, gives `undefined`. The prototype's pattern matched one line with the `m` flag, which would start the last line of a longer hand-written file and skip the rest (read, audit A).
  - `windowsBatchArgument(value: string): string`. The argument quoted for the C runtime, then every character of the list given a caret, twice, because a batch file that forwards `%*` parses the line a second time. The list is the runtime's `WINDOWS_CMD_META_CHARS` plus `:`, so the pattern is ``/([()\][%!^"`<>&|;, *?:])/g``. The colon is the percent rule, below.
  - `batchFileLaunch(file: string, args: string[]): CommandLaunch`. It throws `` new Error(`A line break cannot be passed to ${file} on Windows.`) `` when an argument holds `\r` or `\n`. Otherwise it returns `{ args: ["/d", "/v:off", "/s", "/c", `"${line}"`], command: process.env.ComSpec || "cmd.exe", windowsVerbatimArguments: true }`, where `line` is the file with one caret before each character of the same list and no quotes around it, then each argument through `windowsBatchArgument`, joined by spaces. So `C:\bin\hand.CMD` is written `C^:\bin\hand.CMD`.
  - `commandLaunch(command: string, args: string[], env?: NodeJS.ProcessEnv, host?: Partial<CommandPathHost>): CommandLaunch`. Off Windows, and when nothing is found, `{ args, command }`, so a missing command still fails with `ENOENT` as today. A `.com` or `.exe` is `{ args, command: file }`. A shim whose `npmShimTarget` is an existing `.exe` or `.com` starts that file. A shim that runs node starts `node.exe` beside the shim, else `resolveCommandFile("node", env)` when that is an `.exe`, with the target script as the first argument. Anything else is `batchFileLaunch(file, args)`.
  - `spawnCommandLaunch(launch: CommandLaunch, options: SpawnOptions): ChildProcess`. It calls `spawn(launch.command, launch.args, { ...options, windowsVerbatimArguments: launch.windowsVerbatimArguments })`. Callers use it so the flag cannot be left off.
- Produces, in `windows-command-cases.mjs`:
  - `npmNodeShim(relativeScript)` and `npmExeShim(relativeExe)`, the two shim texts with `\r\n` line ends.
  - `intactArguments`, the rows every launch must deliver unchanged: `plain words`, `a & b`, `a | b`, `a < b > c`, `caret ^ x`, `%PATH%`, `100% sure`, `100%`, `%`, `%%`, `x:y`, `at 10:30`, `C:\dir\file`, `!PATH!`, `wow!`, `say "hi" there`, `quote " and & % !`, `tail\"`, `tail\`, `(parens) [x]`, a tab, the empty string, text with accents, CJK and an emoji, `-p`, `/c`, and the percent rows the private file lists.
  - `shimOnlyArguments`, the rows only a direct start can carry: `line1\nline2` and a string of 9,000 characters.

**The percent rule (run, Windows, 45662096506).** `cmd.exe` replaces percent references before it reads carets, and Microsoft's `cmd` page gives no escape for a percent sign on a command line (read, `https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/cmd`, dated 2025-05-23, which says only that substitution "isn't recursive"). A caret before `%` alone is not enough. It protects a plain `%NAME%`, and it did not protect every percent form. The run sent 25 inert rows through each launch shape with three escapes and recorded the arguments the child received.

| Launch shape | Carets on the runtime's list | The same plus `:` | The other runtime's form for `%` |
|---|---|---|---|
| npm shim, started as node plus script, no `cmd.exe` | 25 of 25, no escape used | | |
| Hand-written `%*` file through `cmd.exe` | 21 of 25 | 25 of 25 | 25 of 25 |
| Wrapper of the generated shape (Task 3) through `cmd.exe` | 21 of 25 | 25 of 25 | 25 of 25 |
| npm shim sent through `cmd.exe` | 21 of 25 | 25 of 25 | 25 of 25 |
| A file that forwards nothing | receives no argument in every case | the same | the same |

The four rows that changed in the first column are percent rows of the private file, which says what they share. A lone `%`, `%%`, `100%`, `100% sure` and `%OS%` arrived intact in every column. With `:` in the list every row arrived byte for byte, including `x:y`, `at 10:30` and `C:\dir\file`. The reason it works is inferred from the result: a reference's name ends at `%` or `:`, and with a caret before both, every name a typed `%` could begin ends in a caret and names no variable. The run proves the rule for these 25 rows and three shapes. It does not prove it for every string.

The third column is the form another runtime's standard library writes for a batch argument. It also passed. It is not chosen, because it leans on the `cd` dynamic variable and on command extensions, which that runtime forces on with `/e:ON`. That runtime also refuses a batch file whose own path holds `%`, `^` or `"`. This plan does not refuse `%`, because the caret form ran with `%` in the path (below). A path that holds `^` was not run. A `"` cannot be in a Windows file name. The source and its background are in the private file.

**The batch file's own path (run, Windows, 45662096506).** One caret per listed character and no quotes started a hand-written file and a wrapper of the generated shape in three directories, `plain`, `sp ace (x86) & co` and `pct%OS%dir`, with no argument and with three argument rows, all intact, with and without `:` in the list. The file in double quotes inside the `/s /c "..."` line worked in the first two directories and failed in the third, where the name was expanded. Today's form in `launch-core.ts`, quoted with no `/s`, failed in the second and third directories with and without an argument.

- [ ] **Step 1: Write the failing tests** in `command-path.test.mjs`. The two shim texts, as npm wrote them on `windows-2025` for a package with a script bin and an `.exe` bin (run, Windows):

```text
@ECHO off
GOTO start
:find_dp0
SET dp0=%~dp0
EXIT /b
:start
SETLOCAL
CALL :find_dp0

IF EXIST "%dp0%\node.exe" (
  SET "_prog=%dp0%\node.exe"
) ELSE (
  SET "_prog=node"
  SET PATHEXT=%PATHEXT:;.JS;=;%
)

endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\node_modules\fake-cli\bin\cli.js" %*
```

```text
@ECHO off
GOTO start
:find_dp0
SET dp0=%~dp0
EXIT /b
:start
SETLOCAL
CALL :find_dp0
"%dp0%\node_modules\fake-cli\bin\tool.exe"   %*
```

  Tests that run on every platform, with a host that compares names without regard to case, as NTFS does: `{ platform: "win32", isFile: (file) => files.has(file.toLowerCase()), readText: (file) => texts.get(file.toLowerCase()) }`, over lowercased names. A case-sensitive `Set` fails these tests against a correct module, because the default `PATHEXT` is upper case and the resolver asks for `pi.CMD` (run, macOS, audit A, 5 of 10 failed). The answers keep the extension's case from `PATHEXT`.
  1. `"a bare name resolves to the file with a PATHEXT extension, not to the script beside it"`. Files `c:\bin\pi` and `c:\bin\pi.cmd`. `resolveCommandFile("pi", { Path: "C:\\bin" }, host)` is `C:\bin\pi.CMD`. Review Focus 1.
  2. `"an earlier directory wins over an earlier extension"`. `c:\a\pi.cmd` and `c:\b\pi.exe`, path `C:\a;C:\b`. The answer is `C:\a\pi.CMD`.
  3. `"the path variable is read in any letter case, and the first spelling in sort order wins"`. `{ path: "C:\\bin" }` finds the file. `{ Path: "C:\\bin", PATH: "C:\\none" }`, written in that order, returns `""`. Written the other way round the literal is already in sort order, and a module with no sort passes (run, macOS, audit A). An `env` with no path key returns `""` while `process.env` has one. Review Focus 2.
  4. `"a name with an extension or a separator is not searched for"`. `pi.exe` with only `pi.cmd` present returns `""`. `.\pi.cmd` returns itself when present and is never joined to a path directory.
  5. `"off Windows a command is returned unchanged"`, with `platform: "linux"`.
  6. `"npmShimTarget reads the two shims npm writes and nothing else"`. The first text gives `{ runsNode: true, target: "node_modules\\fake-cli\\bin\\cli.js" }`, the second `{ runsNode: false, target: "node_modules\\fake-cli\\bin\\tool.exe" }`. Each of these gives `undefined`: a file of `@echo off\r\n"node" "x.js" %*\r\n`; the first text with `--inspect` put between `"%_prog%"` and the script; the first text with `SET "_prog=bash"` in place of `SET "_prog=node"`; the second text with one more line, `SET X=1`, before its last line. Review Focus 3.
  7. `"windowsBatchArgument escapes for two parses"`. For `quote " and & % !` the result is `^^^"quote^^^ \^^^"^^^ and^^^ ^^^&^^^ ^^^%^^^ ^^^!^^^"`, the string the prototype sent (run, Windows). For `x:y` it is `^^^"x^^^:y^^^"`, and for `100%` it is `^^^"100^^^%^^^"`, the strings run 45662096506 sent (run, Windows).
  8. `"commandLaunch starts an executable, the target of an npm shim, or cmd.exe"`. Four cases with exact `deepEqual` on the result: an `.exe` on the path; a node shim with `node.exe` beside it; an exe shim; a hand-written batch file, whose `args` are `["/d", "/v:off", "/s", "/c", "\"C^:\\bin\\hand.CMD ^^^\"x^^^\"\""]` for the argument `x`. Its expected `command` is `process.env.ComSpec || "cmd.exe"`, computed in the test, since a literal differs between macOS and Windows. A fifth: nothing found returns the input.
  9. `"a line break is refused for a batch file and carried for an npm shim"`. `assert.throws` with `/line break/` for the hand-written file, and a plain result for the node shim.
  10. `"spawnCommandLaunch passes the verbatim flag on"`. `t.mock.method(childProcess, "spawn", () => ({}))`, then assert the third argument of the call.

  Tests with `{ skip: process.platform !== "win32" }`, real files in a temporary directory, the default host. The child is a script that writes `process.argv.slice(2)` as JSON to a file named in its environment.
  11. `"every argument reaches the target of an npm shim intact"`. Write the first shim text as `fake-cli.cmd` with its script under `node_modules\fake-cli\bin\cli.js`. For each row of `intactArguments` and `shimOnlyArguments`, start `commandLaunch("fake-cli", ["--flag", row], { ...process.env, Path: dir })` through `spawnCommandLaunch`, wait, and `deepEqual` the child's arguments with `["--flag", row]`.
  12. `"every argument reaches a hand-written batch file intact"`. The file is `` `@echo off\r\n"${process.execPath}" "${capture}" %*\r\n` ``, written once in a directory named `sp ace (x86) & co` and once in one named `pct%OS%dir`. In both, each row of `intactArguments` arrives intact, and so does a start with no argument. Review Focus 10.

  Run the file. Expected: the build fails with `Could not resolve "@llmr/core/platform/command-path.ts"`.

- [ ] **Step 2: Write the module.** Start from `resolveWindowsCommandFile`, `escapeWindowsCmdArgument` and `spawnAgentCli` in the runtime script and from `npmCmdShimLaunch` in `1-cmd-escape-evidence/prototype.diff`. The prototype's shim pattern is `/^(.*"%_prog%"\s+)?"%dp0%\\([^"%\r\n]+)"\s+%\*\s*$/m`, with `SET "_prog=node"` required in the text when the first group matched. Do not copy that pattern as it is. It matches one line. Anchor it to the whole of each of the two templates, as the Interfaces block says. The prototype's list of careted characters has no `:`. Add it.

  The two Windows questions the first draft left for this step are settled by run 45662096506 and need no branch here. A batch file whose path holds `%` starts with the caret form. A percent form arrives intact with `:` in the list. If test 12 fails on Windows for a row, stop and report the row and the run id. Do not change the list on your own.

- [ ] **Step 3: Run the tests.** `node build/test.mjs core && node --test .test-dist/core/test/unit/platform/command-path.test.js`. Expected: 1 to 10 pass on macOS, 11 and 12 skip. Push, and read the Windows entry of the `platforms` job for 11 and 12.

- [ ] **Step 4: Mutations.** Each must fail the named test. The first four ran on macOS against the audit's build of this module (run, macOS, audit A). Making the bare-name extension list `["", ...extensions]` fails test 1. Dropping the second `.replace` in `windowsBatchArgument` fails tests 7 and 8, and test 12 on Windows. Dropping the line-break check fails test 9. Dropping the `npmShimTarget` branch of `commandLaunch` fails tests 8 and 9, and test 11 on Windows for the two `shimOnlyArguments` rows. The next four are new with the corrections and were not run. Dropping the `.sort()` from the key lookup fails test 3. Dropping `:` from the list fails tests 7 and 8, and test 12 on Windows. Dropping the `SET "_prog=node"` check, or matching one line in place of the whole text, fails test 6. Falling back to `process.env` for a missing path key fails test 3.

- [ ] **Step 5: Commit.** `feat(platform): find a command through PATH and PATHEXT and build its launch`

---

### Task 2: A prompt reaches a batch-file agent CLI intact

Today, on Windows, an argument with certain characters does not reach an agent CLI that is a batch file intact, an argument with a line break is cut at the line break with exit code 0, and a command line over 8,191 characters fails (run, Windows). The CI failure is `#1851 Pi dispatch consumes only the profile selector and preserves the prompt`. After this task every argument reaches an npm-installed agent CLI as it was given, and a hand-written batch file gets every argument except one with a line break, which fails with an error.

Read the private file's section for this task first.

**Files:**
- Modify: `packages/core/src/agents/codex/cli-middleware-runtime-source.runtime.cjs` (`spawnAgentCli`, `resolveWindowsCommandFile`, `escapeWindowsCmdArgument`, and two new functions beside them)
- Test: `packages/core/test/integration/agents/codex-cli-middleware-runtime.test.mjs`

**Interfaces:**
- Consumes: Task 1's module and `windows-command-cases.mjs`, in the test only.
- Changes, in the runtime script, each to the rule Task 1 gives its twin:
  - `resolveWindowsCommandFile(command, env)`. A bare name is tried with the `PATHEXT` extensions only. The path and `PATHEXT` keys are found without regard to letter case, first in sort order. With an `env` that holds no path key it searches nothing, where today it falls back to `process.env.PATH` (read).
  - `WINDOWS_CMD_META_CHARS` gains `:`, the percent rule of Task 1. `escapeWindowsCmdCommand` uses the same constant, so the batch file's path gets it too.
  - `escapeWindowsCmdArgument(value)`. The caret pass runs twice.
  - `spawnAgentCli(command, args, options)`. After the `.com` and `.exe` branch it asks `npmShimLaunch`. With an answer it calls `childProcess.spawn(answer.command, answer.args.concat(args), options)`. Without one it throws `new Error("A line break cannot be passed to " + (commandFile || command) + " on Windows.")` when an argument holds one, and otherwise builds the `cmd.exe` line as today, with `/v:off` added after `/d`.
- Produces, in the runtime script: `npmShimTarget(shimText)`, the same pure function as Task 1's, and `npmShimLaunch(commandFile, env)`, which returns `{ command, args }` or `null`.
- Not changed: the six callers of `spawnAgentCli` (`runPiCliWrapper`, `runClaudeCodeCliWrapper`, `runCodexCliMiddleware`, `runDirectCodexCli`, `runCodexBotCli`, `runOpenCodeBotCli`). The two bot callers already catch a throw and report it (read). The four wrappers are `async`, so a throw becomes a rejection that `main().catch` prints with exit code 1 (read).

- [ ] **Step 1: Write the failing parity test.** In `codex-cli-middleware-runtime.test.mjs`, change `evaluateRuntimeFunction(name, dependencies, configDir)` to take a fourth parameter, a `globals` object merged over its own `path`, `pathToFileURL`, `fs` and `CONFIG_DIR`, whose keys become the parameters of the evaluated function. Today the four names are fixed (read). Two things the helper cannot do by itself (run, macOS, audit A). It extracts `function NAME(` only, so the constant `WINDOWS_CMD_META_CHARS` is not in scope and `escapeWindowsCmdArgument` throws a `ReferenceError`. Pass the pattern in `globals`, read from the script's text with a regular expression so the test follows the script. And any helper the resolver calls, such as a key finder, must be listed in `dependencies`. The research's probe loaded `spawnAgentCli` from the script's text on Windows (run, Windows). Then:

  `"the runtime script and command-path.ts answer the same for every case"`. Evaluate the runtime's `resolveWindowsCommandFile` with `path.win32`, an `fs` whose `statSync` knows a fixed set of files without regard to case, and a `process` whose `env` holds a `PATH` that would find the file. For each resolver case of Task 1's tests 1 to 4, including the two-spelling literal in the order test 3 gives and the `env` with no path key, assert it equals `resolveCommandFile` with the matching host. Evaluate `escapeWindowsCmdArgument` and assert it equals `windowsBatchArgument` for every row of `intactArguments`. Evaluate `npmShimTarget` and `deepEqual` it with Task 1's for every text of Task 1's test 6.

  Run it. Expected: FAIL. The runtime resolves `pi` to `C:\bin\pi`, escapes once, and has no `npmShimTarget`. The audit built this test with the two additions above. It failed on today's runtime and passed after the change (run, macOS, audit A).

  What this test does not compare: `npmShimLaunch` (the node beside the shim, the check that the target exists), the line-break rule, `/v:off`, and the caret form of the batch file's path. A drift in those shows only on Windows, in `#1851`.

- [ ] **Step 2: Extend `#1851` for Windows.** Keep the hand-written `pi.cmd` loop. For the hand-written file, add every row of `intactArguments` as a prompt after `--`. Add a second fake, written from `npmNodeShim`, and run every row of `intactArguments` and `shimOnlyArguments` through it. Add one run with `LLMR_REAL_PI_BIN: "pi"` and the shim's directory first on the path. Add one run of a prompt with a line break through the hand-written file, and assert a non-zero status and `/line break/` in `stderr`. On other platforms the existing `sh` fake takes the same rows.

  Add the rows the private file lists for this test, in the inert form it gives.

  Expected on Windows before Step 3: the existing row `quote " and & % !` fails with exit code 1, as PR 159's run shows.

- [ ] **Step 3: Change the runtime script.** As the Interfaces block says. `1-cmd-escape-evidence/prototype.diff` holds a version of each change that ran on Windows. It does not have `/v:off`, the case-insensitive key read, the `:` in the careted list, the whole-text shim match, or the pure `npmShimTarget` split out of the launch function.

- [ ] **Step 4: Clean up the bootstrap on a refusal.** `createEphemeralCodexApiKeyBootstrap` writes and renames `auth.json` when it is called, and `runCodexCliMiddleware` calls it two lines before `spawnAgentCli` (read). A refusal thrown there leaves the placeholder `auth.json` behind. Wrap the spawn so a throw runs `cleanupAuthBootstrap` before it propagates. Add a test with `{ skip: process.platform !== "win32" }`, because the refusal happens only on Windows. It plants a line break in an argument for a hand-written batch-file Codex and asserts the file is gone. It was not run. Review Focus 4.

- [ ] **Step 5: Run the tests.** `node build/test.mjs core && node --test .test-dist/core/test/integration/agents/codex-cli-middleware-runtime.test.js`, then `npm run typecheck`. Push and read the Windows entry. On macOS, `#1851` with every `intactArguments` row and the private rows passes through the `sh` fake (run, macOS, audit A).

- [ ] **Step 6: Mutations.** With the `npmShimLaunch` branch removed from `spawnAgentCli`, the two `shimOnlyArguments` rows of `#1851` fail on Windows. With one caret pass, the parity test fails everywhere and `#1851` fails on Windows (the parity half run, macOS, audit A). With `""` back in the bare-name extensions, the parity test fails (run, macOS, audit A). With the line-break throw removed, the line-break run of `#1851` fails on Windows. With `:` out of `WINDOWS_CMD_META_CHARS`, the parity test fails everywhere. With the sort out of the key lookup, the parity test fails on the two-spelling case. Before the corrections to Task 1's tests 3 and 6, that mutation and the removal of the `SET "_prog=node"` check both left every test green (run, macOS, audit A). With `cleanupAuthBootstrap` out of the wrap, Step 4's test fails on Windows.

- [ ] **Step 7: Commit.** `fix(agents): deliver every argument to a batch-file agent CLI on Windows`

---

### Task 3: Arguments reach a profile launcher intact

Today `llmr <profile> cli -- "two words"` on Windows hands the agent `two` and `words`, a name between percent signs is replaced by that variable's value, and an argument with a quote ends in "launcher not found" (run, Windows). The desktop app's own open of a CLI profile fails for every `.cmd` launcher, with or without arguments (run, Windows, for the spawn shape; that the desktop app reaches it is read). A launcher in a folder whose name holds parentheses and `&` beside a space does not start at all today (run, Windows, 45662096506). A name with a space alone was not run. After this task each argument arrives as typed, the launcher starts from such a folder, and a line break is refused with an error.

Read the private file's section for this task first.

**Files:**
- Modify: `packages/core/src/profiles/launch-core.ts` (`profileLaunchSpawnCommand`, the `ProfileLaunchSpawnCommand` type)
- Modify: `packages/core/src/profiles/launch-service.ts` (`openProfileFromLlmr`, `startCodexAppBotWorker`), `packages/cli/src/cli.ts` (the profile launch)
- Test: create `packages/core/test/unit/profiles/profile-launch-command.test.mjs`

**Interfaces:**
- Consumes: `batchFileLaunch`, `spawnCommandLaunch` and `CommandLaunch` from Task 1.
- Changes: `profileLaunchSpawnCommand(plan): CommandLaunch`. For a `.cmd` or `.bat` on Windows it returns `batchFileLaunch(plan.command, plan.args)`. Otherwise `{ args: plan.args, command: plan.command }`, as today. `ProfileLaunchSpawnCommand` is deleted. Only `launch-core.ts` names it, as this function's return type (read, `git grep`), and the three callers infer the type. `launch-core.ts` still imports nothing from `node:child_process` directly. It now reaches it through `command-path.ts`, and nothing forbids that (read, `build/esbuild.config.mjs`, audit A).
- Changes: the three callers start the child with `spawnCommandLaunch(launch, options)` and no longer pass `windowsVerbatimArguments` themselves.
- The launcher's path takes the caret form `batchFileLaunch` gives it, with no quotes. Audit A asked whether that form starts a launcher in a folder with a space, since today's code quotes the path. It does. Run 45662096506 started a wrapper of the generated shape in `sp ace (x86) & co` and in `pct%OS%dir` with the caret form, with no argument and with three argument rows, all intact. Keeping today's quoted form with no `/s` failed in both folders, and the quoted form inside `/s /c "..."` failed in the second (run, Windows). The audit built this change and its three unit tests on macOS, and `npm run typecheck` passed with the callers moved (run, macOS, audit A).

- [ ] **Step 1: Write the failing tests.**
  1. On every platform, with `process.platform` stubbed to `win32` the way `app-info-paths.test.mjs` does it: `"a batch-file launcher gets each argument escaped and the whole line quoted"`. For `{ args: ["two words", "%PATH%"], command: "C:\\cfg\\bin\\w.cmd" }` assert the exact result of `batchFileLaunch` for the same input, and that `args[2]` is `/s`. That comparison cannot fail when `batchFileLaunch` itself changes, so add one literal: for `{ args: ["two words"], command: "C:\\cfg\\bin\\w.cmd" }`, `args[4]` is `"C^:\cfg\bin\w.cmd ^^^"two^^^ words^^^""`, written out in the test. Expected: FAIL, the arguments are joined with a space and there is no `/s`.
  2. Same stub: `"a line break in an argument is refused"`. Expected: FAIL, nothing throws.
  3. Without the stub: `"a launcher that is not a batch file is started as it is"`. Passes today.
  4. `{ skip: process.platform !== "win32" }`: `"a generated wrapper receives what was typed"`. Write a wrapper whose last line is `` `"${process.execPath}" "${capture}" %*` ``, the shape `nodeRuntimeCmdExecLines` writes (read), in a directory named `sp ace (x86) & co`, so the launcher path's own escaping runs. Review Focus 13. Start it with `spawnCommandLaunch(profileLaunchSpawnCommand({ args: [row], command: wrapper }), { stdio: "ignore" })` for each row of `intactArguments`, and once with no arguments. Assert the child's arguments. Review Focus 5 is the run with no arguments.

  Add the rows the private file lists for this test, in the inert form it gives.

- [ ] **Step 2: Change the three files.** As the Interfaces block says. In `startCodexAppBotWorker` the profile's name is an argument, so a name with a space now arrives as one argument (read; today it is split).

- [ ] **Step 3: Run.** The new file, then `npm run test:cli` and `npm run typecheck`. Push and read the Windows entry for test 4.

- [ ] **Step 4: Mutations.** Returning `plan.args.join(" ")` in place of the escaped arguments fails test 1, and test 4 on Windows. Removing `windowsVerbatimArguments` from `spawnCommandLaunch` fails Task 1's test 10, and the no-argument run of test 4 on Windows.

- [ ] **Step 5: Commit.** `fix(profiles): deliver every argument to a profile launcher on Windows`

---

### Task 4: The environment filter and a route script's lookup match names the way Windows does

Today a route script on Windows that calls `api.env("PATH")` gets nothing, because Windows stores the name as `Path` under most parents and the script sees a case-sensitive copy (run, Windows). `SYSTEMROOT` and `COMSPEC` fail the same way. The CI failure is `route scripts cannot read LLMR's own secrets from the environment`, which asserts on `api.env("PATH")`. After this task `api.env` finds a name in any letter case on Windows, and the environment filter also matches a name in any letter case on every platform, as Windows does.

Read the private file's section for this task first.

**Files:**
- Modify: `packages/core/src/mcp/child-env.ts` (`llmrSecretEnvName`)
- Modify: `packages/core/src/routing/route-script-worker.ts` (`routeScriptEnvironment`, and `api.env` inside `routeInvocationSource`)
- Modify: `docs/src/content/docs/en/configuration/routing.md` (one sentence in the `api.env` row)
- Test: `packages/core/test/unit/mcp/mcp-child-env.test.mjs`, `packages/core/test/unit/routing/route-script-runtime.test.mjs`

**Interfaces:**
- Changes: `llmrSecretEnvName` gets the `i` flag. Its comment gains one line that says Windows reads a name without regard to letter case.
- Changes: `routeScriptEnvironment(): { foldCase: boolean; values: Record<string, string> }`. `foldCase` is `process.platform === "win32"`. With it, each key is upper-cased and the first spelling met wins. `api.env(name)` upper-cases `name` when `foldCase` is set. Off Windows nothing changes.
- Not changed: `RouteScriptRuntime` and how the worker is started. A worker's own `process.env` is a case-sensitive copy on Windows (run, Windows, and Node's documentation, read), which is why the fold is in the lookup.

- [ ] **Step 1: Write the failing tests.** Both are in `4-env-case-prototype.patch` and passed on Windows and macOS with the prototype (run).
  1. In `mcp-child-env.test.mjs`: `"the filter matches a name in any letter case"`. Pass `withoutLlmrSecretEnv` an object with the names in the private file's list and with `Llmr_Remote_Sync_Api_Key_File` and `Path`. Assert only the last two are left. Review Focus 6. Expected: FAIL on every platform.
  2. In `route-script-runtime.test.mjs`: `"api.env matches a name without regard to letter case only on Windows"`. A script returns `[typeof api.env("PATH"), typeof api.env("path"), typeof api.env("Path")]`. Assert three `"string"` on Windows and `["string", "undefined", "undefined"]` elsewhere. Review Focus 7. Expected: passes on macOS and Linux today and FAIL on Windows, where the first or the last is `"undefined"`.

- [ ] **Step 2: Make the two changes** from the prototype patch, without its `mergeChildEnv`, which is Task 5.

- [ ] **Step 3: The docs sentence.** In the `api.env(name)` row of the routing guide, add that on Windows the name is matched without regard to letter case. Change nothing else there. The row's promise and the guide's policy example are under "Open with the owner".

- [ ] **Step 4: Run.** Both test files, then push and read the Windows entry. `route scripts cannot read LLMR's own secrets from the environment` passes there unchanged.

- [ ] **Step 5: Mutations.** Without the `i` flag, test 1 fails on every platform (run, macOS, audit A). Without the upper-casing of `name` in `api.env`, test 2 fails on Windows. With `foldCase` always `true`, test 2 fails on macOS and Linux (run, macOS, audit A).

- [ ] **Step 6: Commit.** `fix(env): match environment names without regard to letter case where Windows does`

---

### Task 5: A later environment layer replaces an earlier spelling of the same name

Today, on Windows, a profile or an MCP server whose `env` sets `Path` loses to an inherited `PATH`, without a message. Node gives a child only the spelling that sorts first (run, Windows). After this task the last layer that names a variable is the one the child gets, whatever the letter case.

**Files:**
- Modify: `packages/core/src/mcp/child-env.ts`
- Modify, one object literal each: `packages/cli/src/cli.ts`; in `packages/core/src`, `agents/codex/app-launch.ts`, `agents/claude-app/launch.ts` (`claudeAppLaunchEnv`), `agents/opencode/app-launch.ts`, `agents/bot-gateway/qr-login-service.ts`, `mcp/tool-discovery.ts`, `mcp/toolhub-mcp.ts`, `gateway/core-runtime/supervisor.ts` (`createGatewayProcessEnv`), and four in `profiles/launch-service.ts` (`openProfileFromLlmr`, `claudeAppBotWorkerEnv`, the OpenCode bot worker, `startCodexAppBotWorker`)
- Modify: `cli-middleware-runtime-source.runtime.cjs` (`claudeCommand`, and a copy of the merge beside `withoutKeys`)
- Test: `packages/core/test/unit/mcp/mcp-child-env.test.mjs`, `packages/core/test/integration/agents/codex-cli-middleware-runtime.test.mjs`, and modify `tests/architecture/child-env.test.mjs`. That file exists. Its one assertion fails with the message "spread withoutLlmrSecretEnv() into a child's env, not process.env" (read), advice this task bans. The message becomes "pass withoutLlmrSecretEnv() to mergeChildEnv, not process.env", and the new test goes in the same file. No new architecture file.

**Interfaces:**
- Produces, in `child-env.ts`: `mergeChildEnv(...layers: Array<Record<string, string | undefined>>): NodeJS.ProcessEnv`. Later layers win. On Windows a name replaces any earlier spelling of it. Off Windows it is a plain spread. The body is in `4-env-case-prototype.patch` and ran on Windows.
- Changes: each of the twelve `{ ...withoutLlmrSecretEnv(), ...rest }` literals becomes `mergeChildEnv(withoutLlmrSecretEnv(), { ...rest })`, with a user's layer (`profile.env`, `server.env`, a settings file's env) as its own argument so it is merged by name. Where the caller has already built one object that holds the user's layer, as `appEnv` in `claudeAppLaunchEnv` and in the Codex app launch, pass that object whole as the second layer and do not split it. `mergeChildEnv` folds inside a layer in insertion order, so the last spelling in it wins (read, the prototype's body). The four callers that pass `withoutLlmrSecretEnv()` whole do not change. The twelve literals are in nine files (run, macOS, `grep`). The runtime script does not call the filter (read), so the ban below does not read it.
- Produces, in the runtime script: `mergeChildEnv(...layers)`, the same function. `claudeCommand` calls it with `process.env`, `settingsEnv` and its three `CODEX_*` names.

- [ ] **Step 1: Write the failing tests.**
  1. `mcp-child-env.test.mjs`, from the prototype patch: `"mergeChildEnv lets a later layer replace a variable, without regard to letter case only on Windows"`. `mergeChildEnv({ PATH: "inherited", Other: "kept" }, { Path: "override" })` is `{ Other: "kept", Path: "override" }` on Windows and keeps both keys elsewhere. Expected: the build fails, no such export.
  2. Same file, with `process.platform` stubbed to `win32`, so the Windows branch runs everywhere: three layers that spell one name three ways leave one key, the last.
  3. Same file, `{ skip: process.platform !== "win32" }`: `"a child started with a merged environment sees the override"`. Start `process.execPath` with `-p "process.env.LLMR_MERGE_PROBE"` and `mergeChildEnv({ ...process.env, LLMR_MERGE_PROBE: "inherited" }, { llmr_merge_probe: "override" })`. Assert the output is `override`. Expected with a plain spread: `inherited`.
  4. In the runtime test file, one more block in Task 2's parity test: the runtime's `mergeChildEnv`, evaluated with a `process` whose `platform` is `win32` passed through the `globals` parameter Task 2 added, `deepEqual` the TypeScript one under the stub, for the inputs of tests 1 and 2.
  5. In `tests/architecture/child-env.test.mjs`: `"no source file spreads the filtered environment under other layers"`. Count the matches of `/\.\.\.\s*withoutLlmrSecretEnv\s*\(|Object\.assign\([^)]*withoutLlmrSecretEnv\s*\(/g` in every `.ts` and `.tsx` file under `packages/*/src` and assert the total is 0. Expected: FAIL, 12 matches in 9 files (run, macOS, audit A). The plain text `...withoutLlmrSecretEnv(` misses a space after the dots and an `Object.assign`. The pattern still misses a copy held in a variable and spread later, and an aliased import. Say so in the test's message.

- [ ] **Step 2: Add the helper and move the twelve call sites.** In `createGatewayProcessEnv` the code after the literal deletes and sets keys on the result. It stays as it is.

- [ ] **Step 3: Add the runtime copy and use it in `claudeCommand`.**

- [ ] **Step 4: Run.** The three test files, `npm run test:architecture`, `npm run typecheck`, `npm run test:core`, `npm run test:cli`. Then `npm run build:assets` for the MCP bundle check, and restore the two generated paths.

- [ ] **Step 5: Mutations.** Without the `delete merged[previous]` line, test 2 fails on every platform (run, macOS, audit A), and tests 1 and 3 fail on Windows. Test 1 takes the plain-spread branch off Windows, so it passes there without the line. With one call site back to a spread, test 5 fails.

- [ ] **Step 6: Commit.** `fix(env): let a later environment layer replace an earlier spelling on Windows`

---

### Task 6: An npm-installed OpenCode or Kimi CLI is found

Today a Windows user who installed OpenCode through npm sends `opencode/1.18.31`, the pinned fallback, whatever version is installed (run, Windows, 45650512829). `execFileSync("opencode")` cannot start `opencode.cmd`, and the `catch` hides it. The CI failure is `OpenCode free-tier user agent reads the installed CLI version`. Kimi's version read has the same shape and would miss a `kimi.cmd` (read). No Kimi install that needs it is known, since Kimi's installer places an executable (read by the research, from Kimi's docs).

**Files:**
- Modify: `packages/core/src/agents/local-providers/opencode-freetier.ts` (`readInstalledOpenCodeUserAgent`), `packages/core/src/agents/local-providers/kimi.ts` (`kimiCliVersion`)
- Test: `packages/core/test/unit/agents/local-agent-provider-opencode-freetier.test.mjs` (unchanged, it is the failing test). Add two tests to `packages/core/test/unit/agents/local-agent-provider-kimi.test.mjs`.

**Interfaces:**
- Consumes: `commandLaunch` from Task 1.
- Changes: both functions build `const env = withoutLlmrSecretEnv()` once, call `commandLaunch(command, ["--version"], env)`, and run the result with `spawnSync(launch.command, launch.args, { encoding: "utf8", env, stdio: ["ignore", "pipe", "ignore"], timeout, windowsVerbatimArguments: launch.windowsVerbatimArguments })`. `spawnSync`, because the types of `execFileSync`'s options do not carry the flag (read, `@types/node`). A result with an `error` or a status other than 0 is treated as the `catch` treats a throw today. The `try` stays, since `commandLaunch` can throw. The timeouts and the fallbacks stay.

- [ ] **Step 1: See the failing test.** PR 159's Windows run shows `OpenCode free-tier user agent reads the installed CLI version` failing with the fallback version. Its fake is `@echo opencode version 7.8.9`, a hand-written `.cmd`, so it takes the `cmd.exe` branch.

- [ ] **Step 2: Write the two Kimi tests**, both inside the file's `withKimiHome` helper. `kimiIdentityHeaders` writes a `device_id` under the Kimi home, which is `~/.kimi-code` unless `KIMI_CODE_HOME` is set, and the helper sets it (read). Kimi caches nothing, since `kimiIdentityHeaders` calls `kimiCliVersion` each time (read). Kimi keeps its whole trimmed `--version` output, so the fake must not echo its own command line.
  1. `{ skip: process.platform !== "win32" }`: `"the Kimi version is read from a batch-file CLI"`. Write `kimi.cmd` holding exactly `@echo 1.2.3\r\n` in the Kimi home, set `LLMR_KIMI_BIN` to its full path, delete `KIMI_CODE_VERSION`, which `withKimiHome` sets, and assert `kimiIdentityHeaders()["User-Agent"]` is `kimi-code-cli/1.2.3`. Expected: FAIL on Windows, the version is `unknown`. Written that way it skips on macOS (run, macOS, audit B).
  2. On every platform: `"the Kimi version read goes through cmd.exe for a batch file, under a stubbed platform"`. The same file and environment, `process.platform` stubbed to `win32`, `childProcess.spawnSync` mocked to answer `1.2.3`. The full path has a separator and an extension, so the default host's `statSync` finds it on macOS. Assert the first call's command ends in `cmd.exe` and its options carry `windowsVerbatimArguments: true`. Expected before Step 3: FAIL, `spawnSync` is not called.

- [ ] **Step 3: Change the two functions.**

- [ ] **Step 4: Run.** Both test files on macOS. The OpenCode test passes there before and after, and Kimi's test 2 fails before and passes after (run, macOS, audit B, against a stand-in for Task 1's module). Push and read the Windows entry.

- [ ] **Step 5: Mutations.** Starting `command` in place of `launch.command` in `kimiCliVersion` fails Kimi's test 2 on every platform (run, macOS, audit B). The same change in `readInstalledOpenCodeUserAgent` fails the OpenCode test on Windows only.

- [ ] **Step 6: Commit.** `fix(providers): read the version of a CLI that npm installed on Windows`

---

### Task 7: A stdio MCP server configured by command name starts on Windows

The Settings page's own example configures a stdio MCP server with `"command": "npx"` (read, `settings.tsx`). On Windows `npx` is `npx.cmd`, and both places that start such a server call `spawn(server.command, server.args)` with no shell. That this fails with `ENOENT` is inferred from fault 2's runs. It was not run.

**Files:**
- Modify: `packages/core/src/mcp/tool-discovery.ts` (`listStdioMcpServerTools`), `packages/core/src/mcp/toolhub-mcp.ts` (`StdioMcpClient.ensureChild`)
- Test: `packages/core/test/unit/mcp/stdio-discovery.test.mjs`

**Interfaces:**
- Consumes: `commandLaunch` and `spawnCommandLaunch` from Task 1, `mergeChildEnv` from Task 5.
- Changes: both sites build the merged `env` first, then `spawnCommandLaunch(commandLaunch(server.command, server.args ?? [], env), { cwd, env, stdio, windowsHide })`.

- [ ] **Step 1: The probe.** `{ skip: process.platform !== "win32" }`: `"a stdio server named by a command on the path is started"`. In a temporary directory write `fake-mcp.cmd` from `npmNodeShim("node_modules\\fake-mcp\\server.mjs")`, with `packages/core/test/support/stub-mcp-server.mjs` copied to that path. The stub uses `import`, and the `.mjs` name keeps the test from leaning on Node's syntax detection. Call `listMcpServerTools({ args: [], command: "fake-mcp", env: { Path: <dir + ";" + the inherited path> }, name: "fake", stdioMessageMode: "newline-json", transport: "stdio" })`. Assert one tool, `stub_tool`. Push this commit alone and read the Windows entry.

  - **If it fails with `ENOENT`**, the fault is confirmed. Go on.
  - **If it passes**, the fault is refuted. Keep the test, change no source, and record the run id in this plan's status line. The task is then this one commit.
  - **If it fails with any other error**, such as `EINVAL` or a timeout, the fault is not the one this task fixes. Stop and report the error and the run id.

- [ ] **Step 2: Change the two sites.** A server that is an `.exe`, or any server off Windows, starts as today. A hand-written batch file gets its arguments through `cmd.exe`, and a line break in one throws. In `listStdioMcpServerTools` the throw must reject the promise. In `StdioMcpClient.ensureChild` a throw rejects `ensureInitialized`, so `listTools` and `callTool` reject with it. `ensureChild` is also called from `write`, inside the `request` promise's executor, where a throw rejects that request (read).

  Check `listStdioMcpServerTools` with a test that stubs `process.platform`: `"a line break for a batch-file stdio server rejects the discovery, under a stubbed platform"`. Write `hand.cmd` with `@echo off\r\n` in a temporary directory, stub `win32`, and `assert.rejects(listMcpServerTools({ args: ["line1\nline2"], command: <its full path>, env: {}, name: "fake", stdioMessageMode: "newline-json", transport: "stdio" }), /line break/)`. It failed without the change and passed with it (run, macOS, audit B). `StdioMcpClient` cannot be checked that way. `toolhub-mcp.ts` exports nothing and runs as a child process, where a test cannot stub the platform (read). Its site is read, not tested, and the PR says so.

- [ ] **Step 3: Run.** The test file, `npm run test:core`, `npm run build:assets`, restore the generated paths. Push and read the Windows entry.

- [ ] **Step 4: Mutation.** With `spawn(server.command, server.args, ...)` back in `listStdioMcpServerTools`, Step 1's test fails on Windows.

- [ ] **Step 5: Commit.** `fix(mcp): start a stdio server that is a batch file on Windows`

---

### Task 8: The Claude bot starts an npm-installed Claude Code

`ClaudeCodeAppServer.runTurn` in the runtime script starts Claude Code with `childProcess.spawn(command.command, ...)`, and the default command is the bare name `claude` (read). With Claude Code installed through npm that name is `claude.cmd`, which `spawn` cannot start (Node's rule, run on Windows; this call site, read). The prompt goes on stdin there, so no prompt text is on the command line.

**Files:**
- Modify: `cli-middleware-runtime-source.runtime.cjs` (`runTurn` of `ClaudeCodeAppServer`)
- Test: `packages/core/test/integration/agents/codex-cli-middleware-runtime.test.mjs`

- [ ] **Step 1: The probe.** No test drives a Claude Code turn today. The only test that names `LLMR_CLAUDE_CODE_BIN` is a profile apply test in `profile-service.test.mjs`, and this file's Claude Code app-server test covers `model/list` only (read). Add to `codex-cli-middleware-runtime.test.mjs`, which needs `createInterface` from `node:readline`: `"Claude Code app-server runs a turn against the CLI it names"`.

  The fake script is `node_modules/fake-claude/cli.js` in a temporary directory. On each stdin line it returns when `type === "control_request"`, and otherwise writes `{"type":"result","subtype":"success","is_error":false,"result":"fake reply"}` and exits 0. Off Windows the command is a `#!/bin/sh` file that `exec`s `process.execPath` on the script. On Windows it is `fake-claude.cmd` from `npmNodeShim("node_modules\\fake-claude\\cli.js")`, and `LLMR_CLAUDE_CODE_BIN` is the bare `fake-claude` with the directory first on `Path`. Spawn the runtime with `app-server`, `HOME` set to the temporary directory and `LLMR_CODEX_REMOTE_FRONTEND_MODE: "claude-code"`. Send `thread/start` with `{ cwd: dir }`, send `turn/start` with the returned `result.thread.id`, end stdin, and wait up to 15 seconds for the `turn/completed` notification. Assert its `params.turn.status` is `"completed"`, with the turn in the assertion message. Written that way it passed on macOS before and after Step 2 (run, macOS, audit B). Push and read the Windows entry.

  - **If the status on Windows is `"failed"`** with a spawn error in its `error`, the fault is confirmed. Go on.
  - **If it is `"completed"`**, the fault is refuted. Keep the test and change no source.

- [ ] **Step 2: Change the call** to `spawnAgentCli(command.command, command.args, { cwd, env, stdio, detached })`, with the same options. After Task 2, `spawnAgentCli` can throw for a line break, and a throw in `runTurn` would skip the `childSpawnError` handling, so no `turn/completed` would be written and the bot would never reply (read, audit B). Wrap the call, set `childSpawnError` from a throw, and let the existing failed-turn path report it. `claudeCommand`'s arguments are flags, a model, an effort, a session id and `LLMR_CLAUDE_CODE_EXTRA_ARGS` split on white space, so none should hold a line break (inferred). The wrap is for the case that inference misses.

- [ ] **Step 3: Run, then the mutation.** Check the build's exit code, since this test imports Task 1's support file. Putting `childProcess.spawn` back fails Step 1's test on Windows.

- [ ] **Step 4: Commit.** `fix(agents): start a batch-file Claude Code from the Claude bot on Windows`

---

### Task 9: App discovery starts no blocking process when no app is installed

Today, on Windows with none of ChatGPT, OpenCode and WorkBuddy installed, each `getAppInfo` call that misses its 30 second cache runs 29 child processes one after another with `spawnSync`. That took 4.8 to 5.8 seconds on an idle runner and 18.8 to 23.3 seconds in the failing CI runs, and the process answers nothing in that time (run, Windows). In the desktop app that process is the Electron main process (read). It happens when the home page mounts and on a Settings open more than 30 seconds later (read). The CI failure is `web management server is ready before the catalog CDN answers`, which fails once the block passes 10 seconds. The prototype brought the three lookups to 625 ms on the first call and about 255 ms after, with no synchronous spawn (run, Windows, 45652380219).

**Files:**
- Modify: `packages/core/src/platform/windows-app-discovery.ts` (`windowsWhereCandidates`, `windowsShortcutTargetCandidates`, `windowsAppxPackageInstallLocations`)
- Modify, one lookup each: `packages/core/src/agents/claude-app/launch.ts` (`launchClaudeAppProfile`), `packages/core/src/agents/codex/app-launch.ts` (`launchCodexCompatibleAppProfile`), `packages/core/src/profiles/launch-service.ts` (`openProfileFromLlmr`, before the OpenCode branch)
- Test: `packages/core/test/unit/agents/app-info-paths.test.mjs`

**Interfaces:**
- Consumes: `commandSearchPath` from Task 1.
- Changes, with no change to any signature a caller uses:
  - `windowsWhereCandidates(names)` reads each directory of `commandSearchPath().directories` once with `readdirSync` and keeps the entries whose lowercased name is one of `names`, bare or with one of the extensions. No `where.exe`. `where.exe` also searched the current directory before the path, by its documented order (read by the research). The new walk does not, which matches Task 1. The PR says so.
  - `windowsShortcutTargetCandidates(options)` lists `.lnk` files itself, with `readdirSync(root, { recursive: true })` over the Start Menu `Programs` folders under `APPDATA` and `ProgramData` and the `Desktop` folders under `USERPROFILE` and `PUBLIC`. With no file name that matches it returns `[]` and starts nothing. With matches it runs PowerShell once, to read those files' targets, with `timeout: 5_000`.
  - `windowsAppxPackageInstallLocations(packageKeywords)` answers from a list held in the module, filtered with `nameContainsKeyword` over each package's name, full name and install location. That is what the PowerShell `-match` did (read; the prototype's answers equalled the script's for three real packages, run, Windows).
- Produces: `prefetchWindowsAppxPackages(): Promise<void>`, exported. Off Windows it resolves at once. On Windows it runs `Get-AppxPackage` once through `execFile` with `timeout: 15_000` and stores name, full name and install location per package. It never rejects. Module state is `appxPackages: { loadedAt: number; packages: string[][] } | undefined` and `appxLoad: Promise<void> | undefined`. A load in flight is shared. When a load ends, `appxLoad` is cleared, on success as well as on failure. A success replaces `appxPackages` and its `loadedAt`. A failure keeps the previous list, so the next call starts another load. A lookup starts a load when `appxPackages` is missing or its `loadedAt` is more than 30 seconds old, does not wait for it, and answers from the list it has. The prototype holds the load as `appxLoad ??= ...` and clears it only on an error, so there a load that succeeded can never run again (read).
- Produces: `resetWindowsAppxPackagesForTest(): void`.
- Changes: **the launch paths wait for the package list.** The discovery serves five apps: ChatGPT/Codex, ZCode and WorkBuddy through `findInstalledCodexCompatibleAppExecutable`, OpenCode through its `platformCandidates`, and Claude App through `windowsClaudeAppCandidates` (read). `llmr <profile> app` runs `launchClaudeAppProfile` and `launchZcodeAppProfile` in a process that has just started (read, `cli.ts`). With the load started only by a lookup, every such run would look before any list exists, and an app installed only as a Store package would never be found from the command line, where today's synchronous `Get-AppxPackage` finds it. So a launch looks once, and only when it finds nothing does it wait for the list and look again. That is one exported helper in `windows-app-discovery.ts`, `findAfterAppxLoad<T extends { executable?: string }>(lookup: () => T): Promise<T>`. It returns `lookup()` when that has an executable or the platform is not Windows. Otherwise it awaits `prefetchWindowsAppxPackages()` and returns `lookup()` again. `prefetchWindowsAppxPackages()` resolves at once when a list younger than 30 seconds exists. `launchClaudeAppProfile` and `launchCodexCompatibleAppProfile`, which are already `async`, wrap their lookup in it. `openProfileFromLlmr` awaits it around `findInstalledOpenCodeAppExecutable` before the OpenCode branch calls `launchOpenCodeAppProfile`, which is synchronous and then finds the package in the list. `getAppInfoPaths` does not wait. An app in a standard folder, on the path or behind a shortcut launches with no wait. A Store-only app, and an app that is not installed, wait for one package load, 3.7 seconds on the runner (run, Windows, by the research) and 15 seconds at most. Audit B proposed an unconditional `await` at the top of each launch. The look-first form is this pass's, so an ordinary launch does not pay for the load. Neither form was built or run.

- [ ] **Step 1: Write the failing tests.** All stub `process.platform` to `win32` as the file's `#1776` test does, and mock `childProcess.spawnSync` and `childProcess.execFile`.
  1. `"with no app installed, discovery starts no blocking process"`. `fs.statSync` says nothing is a file, `fs.readdirSync` returns `[]`, `execFile` never calls back. Call the three finders `getAppInfoPaths` uses. Assert `spawnSync` was called 0 times and `execFile` once. Expected: FAIL, `spawnSync` is called for PowerShell and `where.exe`. On today's code under the stub it is called 29 times, the number the research measured on Windows (run, macOS, audit B).
  2. `"an executable on the path is found without where.exe"`. A real temporary directory holding `OpenCode.exe`, which is one of OpenCode's `exeNames` and a `whereName` plus `.exe`. Set `process.env.PATH` to that directory alone and restore it after. Assert `findInstalledOpenCodeAppExecutable().executable` is that file and `spawnSync` was not called. Expected: FAIL, the mocked `where.exe` returns nothing. Two forms of this test fail against a correct module (run, macOS, audit B). A file named `OpenCode` with no extension is dropped by `normalizeWindowsDesktopAppCandidate`, which keeps only an `exeName`. A `PATH` of the directory joined to the old value with `path.delimiter` is not split, because the Windows rule splits on `;` and macOS joins with `:`.
  3. `"the package list is filtered by name, full name and install location"`. `execFile` calls back with three tab-separated lines that match one keyword in a different field each, and a fourth with an empty install location. `await prefetchWindowsAppxPackages()`. Assert the three locations reach the candidates and the fourth does not.
  4. `"a failed package load is tried again, and a lookup before any load answers empty"`. `execFile` calls back with an error once. Assert the lookup returns `[]` both times and `execFile` was called twice. Review Focus 9.
  5. `{ skip: process.platform !== "win32" }`, no stub, with `spawnSync` wrapped to count: the three finders make 0 synchronous spawns on the runner, whose test home holds no app.
  6. `"a package list older than 30 seconds is reloaded, and the old list answers meanwhile"`, with `t.mock.timers.enable({ apis: ["Date"] })`. Load one package, advance 30,001 ms, look up. Assert the old package is still answered and `execFile` was called twice. Without this test, deleting the age check left the whole file green (run, macOS, audit B).
  7. `"a matching Start Menu shortcut is read with one PowerShell run that has a timeout"`. Under the stub, set `APPDATA` to a temporary directory and make `fs.readdirSync` return `["Apps/ChatGPT.lnk", "Apps/Other.lnk"]` for the Start Menu `Programs` root and `[]` elsewhere. Mock `spawnSync` to return `{ status: 0, stdout: "C:\\ChatGPT\\ChatGPT.exe\r\n" }`. Iterate `windowsDesktopAppCandidates` with ChatGPT's options. Assert it yields `C:\ChatGPT\ChatGPT.exe`, `spawnSync` was called once, its script names `ChatGPT.lnk` and not `Other.lnk`, and its options carry `timeout: 5000`. Without this test, returning `[]` from the shortcut function, or dropping its timeout, left the whole file green (run, macOS, audit B). The test itself was not run.
  8. `"a launch waits for the package list only when the first look finds nothing"`. Under the stub, `execFile` answers one package for `claude` after a `setImmediate`. `findInstalledClaudeAppExecutable()` called straight away has no executable. `await findAfterAppxLoad(() => findInstalledClaudeAppExecutable())` returns the package's executable. With a lookup that finds an install folder at once, `findAfterAppxLoad` returns it and `execFile` was not awaited. Review Focus 11. Not run.

- [ ] **Step 2: Change the three functions.** `3-appinfo-prototype.patch` has each. It reads the path with its own code, which becomes `commandSearchPath`, and it loads the package list once per process, which becomes the reload the Interfaces block spells out.

- [ ] **Step 3: Add `findAfterAppxLoad` and use it at the three launch sites.**

- [ ] **Step 4: Run.** The test file and `model-catalog-startup.test.mjs`, which is unchanged. Push and read the Windows entry for both.

- [ ] **Step 5: Mutations.** With a `spawnSync` of `where.exe` back, tests 1 and 2 fail, and test 5 on Windows. Without the `fields.some(...)` filter, test 3 fails. Without the line that clears a failed load, test 4 fails. Without the age check, test 6 fails. With `[]` returned from `windowsShortcutTargetCandidates`, or its `timeout` dropped, test 7 fails. With `findAfterAppxLoad` returning its first lookup, test 8 fails.

- [ ] **Step 6: Commit.** `fix(platform): look for desktop apps on Windows without blocking child processes`

**What the PR says a user can notice.** `getAppInfo` can report an app that is installed only as a Store package, with no shortcut and no execution alias, as missing when it runs before the first package load ends, which took 3.7 seconds on the runner (run, Windows). The app-info cache then holds "not found" for up to 30 seconds. That only means the profile form does not prefill the app's path (read, `App.tsx`). A launch is not affected, since it waits. Whether any of the five apps ships as a Store package without an alias was not checked. That a user cannot list `C:\Program Files\WindowsApps`, which would make the package list the only Store path, is inferred.

---

### Task 10: The monitor of an adopted profile app does not block

When the desktop app adopts a profile app that was already running, `registerExistingProfileApp` checks it every 2 seconds with `isProfileAppRunning`, which runs PowerShell `Get-CimInstance` through `spawnSync` on Windows and `ps` elsewhere (read). One run of the Windows command took 315 to 549 ms (run, Windows). So the main process stalls for that long every 2 seconds while the app runs (the cost run, the cadence read).

A second path reaches the same probe. While the window is visible the home page calls `getProfileRuntimeStatus` every 2 seconds (`startVisiblePolling(refreshRuntimeStatus, 2000)` in `App.tsx`), and that calls `cleanupExitedProfileApps`, which calls `isProfileAppRunning` on every entry. For an adopted entry that always runs the blocking probe (read). So a change to the monitor alone would help only a hidden window. This task covers both paths for an adopted app.

**Files:**
- Modify: `packages/core/src/profiles/launch-service.ts` (`registerExistingProfileApp`, `windowsProfileAppMainPid`, `posixProfileAppMainPid`, `cleanupExitedProfileApps`, `getProfileRuntimeStatus`)
- Test: `packages/core/test/unit/profiles/profile-app-process-detection.test.mjs`

**Interfaces:**
- Produces, not exported: `profileAppMainPidCommand(marker: string): { args: string[]; command: string }` and `parseProfileAppMainPid(stdout: string, marker: string): number | undefined`, taken out of the two existing functions, which keep their behaviour by calling them.
- Produces: `findProfileAppMainPid(entry): Promise<number | undefined>`, and `findProfileAppMainPidForTest`, the same function exported. It runs the same command with `execFile` and `timeout: 5_000`. It rejects when the command fails to start, exits with a code other than 0, or times out. The Windows script sets `$ErrorActionPreference = 'SilentlyContinue'`, so a failed `Get-CimInstance` query exits 0 with no output, and that resolves as no pid and reads as "gone" (read, audit B). Review Focus 8 holds for a timeout and a spawn error, not for a failed query.
- Produces: `monitorProfileApp(probe: () => Promise<number | undefined>, onGone: () => void, intervalMs = 2_000): NodeJS.Timeout`, and `monitorProfileAppForTest`, the same function exported, as the file does for `isProfileAppRunningWithProbeForTest`. A tick that finds the last probe still running does nothing. A probe that resolves with no pid calls `onGone`. A probe that rejects calls nothing.
- Changes: `registerExistingProfileApp` sets `entry.monitor = monitorProfileApp(() => findProfileAppMainPid(entry), () => cleanupProfileAppEntry(key, entry))`.
- Changes: `cleanupExitedProfileApps` takes `{ trustMonitor }`. `getProfileRuntimeStatus` passes `true`, and an entry that has a `monitor` is then left alone with no probe. Only adopted entries have a monitor (read, `entry.monitor` is set in one place), and the monitor removes the entry when its probe finds no pid, so the entry being present is the monitor's last answer. `runningProfileAppForAgent`, the other caller, runs once per user action and keeps the synchronous probe. So does every other caller of `isProfileAppRunning` (an open, a stop). Audit B proposed a `lastProbedRunning` field on the entry. Leaving the entry to its monitor needs no field and gives the same answer.
- A user can still see two things. The status can show an adopted app for up to one interval plus one probe after it has gone, and for longer while probes fail. A launched app has no monitor. When its launcher process has exited while the app lives on, the status poll still runs the blocking probe for it (inferred, audit B). That is under "Not in this plan".
- A probe still in flight when the entry is cleaned up is harmless. `clearInterval` does not stop it, and when it resolves `onGone` calls `cleanupProfileAppEntry(key, entry)`, which returns when the map no longer holds that entry, so a newer entry under the same key is not removed (read, audit B).

- [ ] **Step 1: Write the failing tests**, with `t.mock.timers` for the interval.
  1. `"an adopted app that is gone is cleaned up"`. The probe resolves `undefined`. After one tick `onGone` was called once.
  2. `"a probe that fails leaves the app registered"`. The probe rejects. `onGone` is not called. Review Focus 8.
  3. `"a slow probe is not started twice"`. The probe returns a promise the test holds. After three ticks it was called once.
  4. `"the monitor's own probe starts no blocking process"`. Mock `childProcess.spawnSync` and `childProcess.execFile`. Drive the real default probe through `findProfileAppMainPidForTest`. Assert `spawnSync` was called 0 times and `execFile` once.
  5. `"the status poll starts no blocking process for an adopted app"`. Register an adopted entry through the exported path the file already tests, mock `childProcess.spawnSync`, call `getProfileRuntimeStatus()` three times, and assert 0 calls and that the entry is still listed. Then advance the mocked timers past one interval, with `childProcess.execFile` mocked, and assert `spawnSync` still has 0 calls and `execFile` has one. Review Focus 12. If no exported path reaches `registerExistingProfileApp` without a live process, stop and report, and do not add an export for the test alone without saying so in the PR. Not run.

  Expected: the build fails, the exports do not exist. Tests 1 to 4 were built by the audit and passed with the change (run, macOS, audit B).

- [ ] **Step 2: Make the change.**

- [ ] **Step 3: Run, then the mutations.** Calling `onGone` in the rejection path fails test 2. Removing the in-flight check fails test 3. Making `findProfileAppMainPid` call the synchronous `profileAppMainPid` fails test 4. Passing `trustMonitor: false` from `getProfileRuntimeStatus` fails test 5. One mutation that tests 1 to 4 do not catch (run, macOS, audit B): wiring the synchronous probe into `registerExistingProfileApp`, as `monitorProfileApp(async () => profileAppMainPid(entry), ...)`, leaves them green. Test 5's timer half is there to catch it. Until test 5 has run, that wiring is read, not tested.

- [ ] **Step 4: Commit.** `fix(profiles): check an adopted app without blocking the process`

---

### Task 11: The raw trace test moves its own clock

No user is affected. The product is right and the test is wrong (run, Windows). `raw trace keeps an over-capacity streaming source while its files are active` writes a file and starts the synchronizer with a 30 ms grace. The first scan backdates activity to the file's modified time. On Windows that scan ran 31 to 138 ms after the write in all 158 failing runs of the probe, so the source was moved before the test's first append (run, Windows, 45650415813). With production values, a 60 second grace and files the gateway child writes in one go, nothing reaches this (read).

**Files:**
- Modify: `packages/core/src/observability/raw-trace-sync.ts` (`RawTraceSynchronizerDependencies`, `observeIncompleteSource`, `expireIncompleteSources`)
- Test: `packages/core/test/unit/observability/raw-trace-sync.test.mjs`

**Interfaces:**
- Produces: `now?: () => number` in `RawTraceSynchronizerDependencies`, and a private `now()` that returns `this.dependencies.now?.() ?? Date.now()`. It replaces `Date.now()` at three reads: the two in `observeIncompleteSource` and the one in `expireIncompleteSources`. Every other `Date.now()` in the file stays.

- [ ] **Step 1: Rewrite the test** from `5-raw-trace-prototype.patch`, by hand. Do not run `git apply` on it. It reports `corrupt patch at ... :38` (run, macOS), because probe lines were stripped from the patch and its hunk counts were not fixed. Read it as a description. Its product half is 8 lines added and 3 removed in `raw-trace-sync.ts`, at the three reads the Interfaces block names (read, audit B). The clock is frozen, the grace is the production 60 seconds, each append moves the clock by half a grace, a count of clock reads tells the test a whole scan has passed, and a last step of a full grace moves the source. The step is half a grace and not one millisecond less than a grace, because the first sighting backdates activity to a file time a millisecond or two before the frozen clock. The first cut of the prototype failed 4 of 300 for that reason (run, Windows, 45651149128). Expected before Step 3: the test fails at the first `nextScan()` with `Timed out waiting for raw trace state.`, after 2 seconds, because nothing reads the injected clock and the count of clock reads stays 0 (run, macOS, audit B). `npm run typecheck` does not see it, since `.mjs` tests are not type-checked.

- [ ] **Step 2: Add the test nothing pins today.** `"a source already quiet for a full grace when first seen is moved on the first scan"`. Write the source, start the synchronizer with `now: () => Date.now() + 2 * graceMs`, and wait for the dead letter. This is the designed behaviour that caught the old test.

- [ ] **Step 3: Add the seam.**

- [ ] **Step 4: Run.** The whole file, 20 times in a loop on macOS. Push and read the Windows entry. The prototype passed 400 of 400 at eight at a time on Windows (run, 45651555996). With the seam built by hand, the rewritten test passed 200 of 200 alone and 200 of 200 at eight at a time, and Step 2's test 200 of 200 at eight at a time (run, macOS, audit B).

- [ ] **Step 5: Mutations.** Without `existing.lastActivityAt = now`, the rewritten test fails (run, macOS, 3 of 3). Without the grace check in `expireIncompleteSources`, it fails (run, macOS). With `Date.now()` back at the expiry read, both tests fail (run, macOS, audit B). With `Math.min(now, snapshot.newestMtimeMs)` replaced by `now`, only Step 2's test fails (run, macOS, audit B). That is the mutation Step 2's test exists for.

- [ ] **Step 6: Commit.** `test(raw-trace): give the streaming source test a clock it controls`

---

### Task 12: The Windows job blocks a release

A red Windows entry stops `npm run release` and does not stop a merge. The Order section says why, and what only the owner can change.

- [ ] **Step 1: Read the Tests run of PR B's last commit.** The Windows and Intel Mac entries of the `platforms` job are green. If a test fails there that this plan does not name, stop and report it. Do not skip it.

- [ ] **Step 2: Only if PR 159 merged with the Windows entry allowed to fail.** Remove that allowance from `.github/workflows/test.yml`, and put back what `tests/architecture/workflow-permissions.test.mjs` asserted before it, that the `platforms` job holds no `continue-on-error`. Run `npm run test:architecture`. Commit: `ci(tests): make the Windows job block again`.

- [ ] **Step 3: After the merge, a docs commit on `main`.** In the delivery index, mark the "Windows, from PR 159" and "Windows, not sorted" findings as fixed with the two PR numbers, and answer question 12 with what was done.

- [ ] **Step 4: Say in PR B which of the two is true when it merges.** Either the two platform checks are in the ruleset's required list, because the owner added them, or they are not, and a red Windows entry stops only a release. A commit cannot change this. It is question 9 under "Open with the owner". Check it with `gh api repos/{owner}/{repo}/rules/branches/main`.

---

## Open with the owner

Each has a default, which is built unless he says otherwise.

| # | Question | Default |
|---|---|---|
| 1 | How PR 159 lands, question 12 of the delivery index. This plan adds a third fact to it: the fixes are two PRs of twelve commits. | The Order section covers both answers. |
| 2 | The routing guide says `api.env` reads "any environment variable visible to the LLMR process". The secret filter hides every `LLMR_*` name that holds `TOKEN`, `SECRET`, `PASSWORD` or `API_KEY`, on every platform, and the guide's own policy example reads `api.env("LLMR_ROUTING_POLICY_TOKEN")`, which that filter removes (run, macOS, against the pattern). The choices: rename the example's variable to one outside the `LLMR_` prefix and say in the row what the filter hides; keep the name and exempt it in the filter; or leave the guide. | Nothing is built. The first choice is the plan author's recommendation. |
| 3 | A batch file npm did not write. Best-effort escaping, which is known wrong for a file that turns on delayed expansion, where `!` is lost and nothing else happens (run, Windows). Or refuse any argument outside a safe character set, which rejects ordinary prompts. | Best-effort escaping. |
| 4 | Should LLM Router read the installed OpenCode version at all? `LLMR_OPENCODE_USER_AGENT` and the pinned fallback exist. Dropping the read removes a child process and Task 6's OpenCode half. | Keep the read. |
| 5 | An app installed only as a Store package is not found by a lookup that runs before the package list has loaded, and a command-line launch is always such a lookup. | A launch that finds nothing waits for the list and looks again. `getAppInfo` does not wait. The smaller choice is no wait at all, and then `llmr <profile> app` never finds a Store-only Claude App or ZCode. |
| 6 | The raw trace test knows a scan has passed by counting clock reads. A named hook, `onSourceScan`, is the other way, and was not run. | Counted reads. |
| 7 | The faults under "Not in this plan" that are wrong results on Windows: the `llmr.cmd` dispatcher, the exact-name deletes, the `NO_PROXY` read. | Listed, not built. |
| 8 | Questions about faults 1 and 4 that cannot be asked here. They are in the private file. | As that file says. |
| 9 | **Add the two platform checks to the required list.** Ruleset 25837404 on `main` requires `🧪 Unit and architecture`, `🎭 End to end` and `🐳 Docker smoke`. `🧪 Unit (Windows)` and `🧪 Unit (Intel Mac)` are not required, so a red Windows entry stops a release and not a merge. This is a repository setting that only the owner can change. No commit can. | Nothing changes. Task 12, Step 4 records which is true. |
| 10 | Task 10 also stops the window's status poll from probing an adopted app. The smaller PR changes the monitor only, and then the stall of 315 to 549 ms every 2 seconds stays while the window is visible. | Both paths, as Task 10 says. |
| 11 | The percent rule. Carets on the list plus `:`, or the `%%cd:~,%` form another runtime ships, or refusing `%` on the `cmd.exe` path, which rejects `100% sure`. The first two both passed run 45662096506. | The list plus `:`. |

## Self-review

- **Coverage.** Fault 1 is Tasks 1, 2 and 3. Fault 2 is Tasks 1 and 6, with its two inferred neighbours as Tasks 7 and 8. Fault 3 is Tasks 9 and 10. Fault 4 is Tasks 4 and 5. Fault 5 is Task 11. The five CI failures are closed by Tasks 2, 4, 6, 9 and 11.
- **Names across tasks.** `commandLaunch`, `spawnCommandLaunch`, `batchFileLaunch` and `commandSearchPath` come from Task 1 and are used by Tasks 3, 6, 7 and 9 with the signatures given there. `mergeChildEnv` comes from Task 5 and is used by Task 7. `windows-command-cases.mjs` comes from Task 1 and is used by Tasks 2, 3, 7 and 8. The `globals` parameter of `evaluateRuntimeFunction` comes from Task 2 and is used by Task 5. `prefetchWindowsAppxPackages` and `findAfterAppxLoad` come from Task 9.
- **Order.** PR A's five commits can each be tested alone. PR B needs PR A.
- **Proportion.** Not measured. Tasks 1 and 9 are the two with more than a few dozen source lines.
- **The audits.** Audit A built Tasks 1 to 4 and Task 5's helper on macOS, and with them `npm run typecheck`, `npm run lint`, `npm run test:core` and `npm run test:cli` passed. Audit B built Tasks 6 to 12 against a stand-in for Task 1's module, with the same four green. Neither build is the one a builder will write, and neither ran on Windows.

## Not verified

- Any task's code on Windows. The audits built the tasks on macOS, where every Windows-only test skips. That is Task 1's tests 11 and 12, the Windows half of `#1851`, Task 2's bootstrap test, Task 3's test 4, Task 5's test 3, Kimi's test 1, the first steps of Tasks 7 and 8, and Task 9's test 5.
- Task 1's module as a whole, on Windows. Its rules ran on Windows inside the runtime script's prototype, in fault 2's prototype, which escaped nothing, and as a stand-alone script in run 45662096506, which is not the module.
- The percent rule beyond the 25 rows and three shapes of run 45662096506. Why it works is inferred from the result. A batch file that turns on delayed expansion was not run with `:` in the list.
- A launcher path that holds `^`, and one in a folder with a space and nothing else under today's form.
- `/v:off` on the runtime script's own `cmd.exe` line. Run 45662096506 used it on every `cmd.exe` line of a stand-alone script.
- Tests written in this correction pass and never run: Task 1's mutations for the sort, the colon, the whole-text shim match and the missing path key; Task 9's tests 7 and 8; Task 10's test 5.
- The look-first wait of Task 9 and the status-poll change of Task 10. Both are designs from the correction pass, read against the code and not built.
- That an `npx` MCP server and an npm-installed Claude Code fail to start on Windows. Tasks 7 and 8 start with the run.
- Whether Claude App, ChatGPT or ZCode installs on Windows as a Store package with no execution alias.
- The real `pi`, `codex`, `opencode` and `claude` shims. The research ran a shim npm made for its own package, with a script target and an `.exe` target.
- That the Electron window freezes during the block. The stall was measured on the management server, which shares the loop. Electron's documentation says the window freezes (read).
- A user's own Windows machine, with more Start Menu entries, more Store packages and an antivirus.
- How the desktop app's own parent process spells `Path`. Inferred from the PowerShell run.
- The 30 second reload of the package list, and the monitor's rule for a failed probe, on Windows. Both are the plan author's. The audit built both on macOS under the platform stub.
- Line overlap with batches 8, 11, 13a and 16. Files and function names were compared, not lines.
- Linux for Task 11. The PR's Linux job runs it.
