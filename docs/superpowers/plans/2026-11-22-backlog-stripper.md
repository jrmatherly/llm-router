# Backlog: Codex Config Stripper Implementation Plan

> **Status, 2026-11-22: draft, not ready to build.** A second-model audit found Blockers in this plan, and none has been checked in the code or corrected here. Do not build from it until its fix round is done. The audit lives outside the repo.

> **Delivery, 2026-11-25.** [`2026-11-25-delivery-order.md`](2026-11-25-delivery-order.md) groups this plan's unbuilt tasks into batches with other plans' tasks and sets the order. It overrides this plan's lines on branches, on one PR per task, and on waiting for a VM check: the owner's VM pass comes once, at the end.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Codex user whose `config.toml` holds unusual but valid TOML, or their own provider table under the id LLM Router uses, can switch a profile on and off and still have a file Codex loads, with every setting and key of theirs in it.

**Architecture:** One statement-level scanner in `packages/core/src/profiles/codex-config-strip.ts` replaces every line pattern that reads or removes part of a Codex config. A statement is a key with all the lines of its value, a table header, a comment or a blank line. On top of it, a provider table counts as LLM Router's only by something LLM Router alone writes (its marker pair or its profile token), and a saved original is treated as the user's file. Six tasks, six PRs, in order.

**Tech Stack:** TypeScript, `node:test` with `node:assert/strict`, `smol-toml` as a dev dependency in tests only (from the harness plan).

**Spec:** [`docs/superpowers/research/2026-11-22-open-items-validation.md`](../research/2026-11-22-open-items-validation.md), rows S-0 to S-15. Read the S table and X-1, X-3 and X-5 before a task.

**Runs after** [`2026-11-22-backlog-harness.md`](2026-11-22-backlog-harness.md), whose TOML task supplies the parse helper. **Runs before** [`2026-11-22-backlog-restore.md`](2026-11-22-backlog-restore.md), which shares `packages/core/src/profiles/service.ts`. "Ground shared with the restore plan" below lists what this plan touches there.

**Evidence status.** Rows marked run in the spec were run by the research pass through the real apply and restore paths. No fix in this plan was prototyped, so no size given here is measured. The plan author read every function, type, test and fixture named below at `main` `eb84a3ba`. One thing was run for this plan: a failing `node:test` test marked `todo` leaves the exit code at 0 on Node 24.22.3. Where a step rests on reading alone it says "read, not run", and it starts with the check that confirms it.

## Decisions this plan rests on

- **B-4.** `smol-toml` is a dev dependency. Tests assert that every Codex file LLM Router writes parses. Nothing ships to users, and there is no runtime parse guard.
- **V-7 and V-17 of the v8 plan stand.** A restore removes only what LLM Router wrote. A root key goes only while it holds the value LLM Router wrote. LLM Router keeps no copy of its own token. A safety copy goes to LLM Router's own folder, token blanked, last three per file.
- **X-1.** Codex 0.134.0 and later do not read a `[profiles.<name>]` table in `config.toml`. S-1, S-3 and S-5 concern a legacy file. They are fixed where the scanner fixes them, and their own steps are small.
- **X-3.** The ids `openai`, `ollama` and `lmstudio` are reserved in Codex. This plan keeps a user's own `model_provider` line for such an id (S-11). Whether an apply should refuse such an id is under "Open with the owner".
- **X-5.** A bare key and a quoted key are the same key. A value can span lines, and a line inside it can start with `[`. A line end is LF or CRLF.
- **Task 4e of the v8 plan** is the model for S-13: content is LLM Router's by a value only LLM Router writes, not by a name the user can also choose.

## Global Constraints

- The fork has no consumers. No compatibility path and no migration code.
- Never weigh upstream parity.
- LLM Router never writes `~/.claude.json` and never deletes or migrates `~/.claude/.claude.json`.
- Double quotes, semicolons, two-space indent. Object keys and type members alphabetized where the surrounding file does it. `type` aliases. No comments except a non-obvious why.
- Tests are `node:test` with `node:assert/strict`, named by behaviour. Core tests are `*.test.mjs`. UI tests are `*.test.ts` or `*.test.tsx`.
- One test file: `node build/test.mjs <pkg> && node --test .test-dist/<pkg>/test/<unit|integration|component>/<path>.test.js`. Do not pass `--scope`.
- Read a file with Read before you change it, so its path-scoped rule under `.claude/rules/` loads.
- `npm run build:assets` and `npm run test:e2e` rewrite `packages/core/models.json` and `packages/ui/src/generated`. Restore them with `git checkout -- packages/core/models.json packages/ui/src/generated`.
- Before each PR: `npm run typecheck`, `npm run lint`, `npm run test:architecture` and `npm run test:core`.
- No test, script or doc in this repo names a real provider host or holds a key. Fixture hosts end in `.example.test`.
- A push or tag on `jrmatherly/llmr-gateway` needs the owner's word each time. No task here touches the fork.
- Merging needs the owner's word, once per PR.
- No two PRs of this plan run at the same time. Start each from `main` after the one before it has merged.
- A PR is green before it merges. A test that is red on purpose is kept as described under "How a red test stays on `main`".
- The repository is public. Describe a change by what the code does.

## How a red test stays on `main`

Task 1 writes the tests for S-1, S-2 and S-6 before any fix exists. Each is first run plain, and its failure is pasted into the PR description. That run is the proof that the parse check catches these inputs. Each is then committed with the `node:test` option `{ todo: "<row>, fixed in Task <n>" }` beside the existing `skip` option. A `todo` test runs and reports its failure, and the run still exits 0 (run on Node 24.22.3 for this plan). The task that fixes the row removes the `todo` option as its first step and watches the test fail, then fixes it. After Task 3 no test in the two Codex test files carries `todo`.

## Review Focus

Each line names a condition no single row's test covers. The test that pins it sits in the step named at the end.

1. Any file put through the scanner comes back unchanged when its statements are joined, with LF or CRLF line ends, with no final line end, and with a value left open by a typo. Task 2, Step 1, test `joining the statements of a file gives the file back`.
2. A table header written with spaces, a quoted name or a trailing comment (`[ model_providers . "llm-router" ] # x`) is the same table to every reader and remover. Task 2, Step 1, test `a header is the same table however it is spelled`.
3. A user with their own `[model_providers.llm-router]` table changes the profile's model and applies a second time before restoring. The file still comes back byte for byte, and their key is on disk after each step. Task 4, Step 1, the `reapply` case.
4. A Codex config with CRLF line ends and a root value that spans lines parses after the apply and after an edited restore. Task 3, Step 1, the CRLF case of the S-2 test.
5. A `written.json` record saved before Task 5 has no `modelProviderLine`. A restore with such a record still removes LLM Router's `model_provider` line and puts the user's back. Task 5, Step 1, test `a record with no model_provider line falls back to the provider id`.

## Rows this plan closes

| Row | Task | Note |
|---|---|---|
| S-0 | none | Context (X-1) |
| S-1 | 2 | Red case written in Task 1 |
| S-2 | 3 | Red case written in Task 1. Task 2 fixes the restore half |
| S-3 | 6 | |
| S-5 | 3 | For consistency only: the mover and the remover take the same tables |
| S-6 | 3 | Red case written in Task 1. Task 2 fixes the strip half |
| S-7 | 5 | Low |
| S-8 | 1 | Tests only |
| S-9 | 5 | After S-11, which changes what a snapshot strip removes |
| S-10 | 2 | The put-back line only. Blank lines LLM Router wrote keep their LF |
| S-11 | 4 | |
| S-12 | 3 | Both halves, see "Where this plan departs from the research" |
| S-13 | 4 | The one row with a permanent loss |
| S-14 | 2 and 3 | `managedConfiguredModel` in Task 2, the other three in Task 3 |
| S-15 | 6 | |

## Where this plan departs from the research

- **The scanner is built on `scanTomlLines`, not in place of it.** `scanTomlLines` already knows which lines start inside a value and already treats a value left open at the end of the file as no value at all. Its two unit tests and that rule stay. After Task 3 it has two callers, `scanTomlStatements` and `firstCodexTableIndex`, both in its own file.
- **The scanner work is two PRs, split by file.** Task 2 changes every reader in `codex-config-strip.ts`. Task 3 moves the six line helpers out of `service.ts`, rebuilds them on statements and deletes the originals. Task 3 is the PR that leaves no line-pattern reader, and its last step is the grep that proves it.
- **Both halves of S-12 land in Task 3.** `isManagedCodexConfigContent` is a line-pattern reader too (`includes` and a multiline regex). Leaving it for Task 4 would leave Task 3 with one reader behind. Task 3 moves it onto statements with its rule unchanged. Task 4 then changes the rule.
- **The statement type gains `value` and drops nothing.** Six call sites compare a root key's value with a recorded line, and the scanner already knows where a line's comment starts.
- **S-10 does not use the replaced line's ending.** The line a put-back replaces is LLM Router's, and the writer ends its lines with LF. The put-back line takes the snapshot's line ending instead (`CodexDisplacedConfig.eol`).
- **The provider-table rule is one rule for the live file and for a snapshot.** The research proposed changing `isManagedCodexConfigContent` and the strip's header match together. This plan does that. Four unit fixtures that plant a bare `[model_providers.llm-router]` table as LLM Router's gain a token line (Task 4, Step 3).
- **S-15 is fixed in `backupFilePath`.** `backupContent` and `backupCurrentFile` name their files the same way and overwrite the same way.

## Ground shared with the restore plan

Functions in `packages/core/src/profiles/service.ts` that this plan changes, moves or deletes:

| Function | Task | What happens |
|---|---|---|
| `removeManagedMarkerLines`, `removeRootTomlKeys`, `rootTomlAssignment`, `removeManagedConfiguredModelLine`, `legacyCodexProfileTableBody`, `removeCodexProfileTable`, `isManagedCodexConfigContent`, `tomlKey` | 3 | Leave `service.ts`. Their replacements are exported from `codex-config-strip.ts` (`tomlKey` from `apply-support.ts`) |
| `buildCodexConfigToml`, `buildSeparateCodexProfileToml`, `managedModelAssignment` | 3 | Call the replacements. `buildCodexConfigToml` also returns `modelProviderLine` in `written` (Task 5) |
| `returnCodexProfileTable`, `codexProfileFileUsersContent` | 3 | Read by statement |
| `codexManagedContent` | 4 | `stripManagedContent` becomes the snapshot strip |
| `writeGlobalCodexConfig` | 5 | Passes the stripped text to `ensureOriginalSnapshot` |
| `readCodexWrittenRecord` | 5 | Accepts the new optional field |
| `maybeWriteSeparateCodexProfileFile` | 6 | One more condition before the copy |

This plan does not change `restoreGlobalConfigFile`, `restoreGlobalConfigFileContent`, `originalSnapshotCandidate`, `restoreDisabledCodexProfile`, `restoreInactiveGlobalProfileConfigs`, `applyCodexProfile` or any Claude Code function. Task 1 adds tests that pin three conditions inside `restoreGlobalConfigFileContent` and `writeGlobalCodexConfig`. A restore-plan task that changes one of those conditions on purpose changes its test in the same PR.

In `packages/core/src/profiles/backup-files.ts` this plan changes `ensureOriginalSnapshot` (Task 5) and `backupFilePath` (Task 6), and exports `profileTokenPrefix` (Task 4).

---

### Task 1: Parse every Codex file the tests write, and pin three restore conditions (S-8)

First, because every later task proves its output with this check, and because the check has to be seen failing on S-1, S-2 and S-6 before a fix can claim to have turned it green.

No user-visible change. After this PR a Codex test fails when an apply or a restore leaves a `.toml` file that does not parse, and three conditions of PR 138 that had no test have one.

**Files:**
- Modify: `packages/core/test/integration/profiles/profile-service.test.mjs` (`withAppliedDefaultProfiles`, new tests after `plantCodexOriginal`, new tests after `awkwardProfileTables`)

**Interfaces:**
- Consumes: the parse helper from the harness plan's TOML task. This plan needs a function that takes a directory, parses every `*.toml` file under it and throws an error that names the file and carries the parser's message. It must not parse `config.toml.llmr-original` or `config.toml.llmr-backup-*`: those are copies of the user's file and are invalid when the user's file was. The code below calls it `assertCodexFilesParse(dir)`. Use the name and import path the harness plan's merged task gives.
- Produces: `withAppliedDefaultProfiles(profileIds, run, beforeApply, options = {})` with `options.parse` (default `true`). When it is true the helper calls `assertCodexFilesParse(codexDir)` once after `applyProfileConfig(config)` and once after `run` returns, before `cleanUp`. A directory that does not exist passes.
- Produces: three `todo` tests that Tasks 2 and 3 turn green, named in Step 3.

- [ ] **Step 1: Add the parse calls to `withAppliedDefaultProfiles`** as the Interfaces block says.

- [ ] **Step 2: Run the file and sort what fails.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/integration/profiles/profile-service.test.js`
Expected: PASS for every test whose fixture is valid TOML. A test whose own fixture is invalid TOML on purpose passes `{ parse: false }` as the fourth argument, and the PR description lists each one with its reason. A test that fails on a file LLM Router wrote from a valid fixture is a finding: stop and report it, do not opt it out.

- [ ] **Step 3: Write the three red cases**, after `plantCodexOriginal`. Each uses `{ skip: !process.env.LLMR_INTERNAL_HOME_DIR }` like its neighbours.

```js
test("a profile table in the user's own Codex config comes back whole after an edited restore", ..., async () => {
  for (const [name, { moved }] of Object.entries(awkwardProfileTables)) {
    const original = `model_provider = "openai"\n\n[profiles.llm-router]\n${moved}\n[projects."/tmp/own"]\ntrust_level = "untrusted"\n`;
    await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
      writeFileSync(fixture.codexConfigFile, `${readFileSync(fixture.codexConfigFile, "utf8")}\n[mcp_servers.x]\ncommand = "x"\n`);
      const result = await recoverGlobalAgentProfile("default-codex");
      assert.equal(result.status.ok, true, name);
      const restored = readFileSync(fixture.codexConfigFile, "utf8");
      assert.equal(countOf(restored, `[profiles.llm-router]\n${moved}`), 1, `${name}: ${restored}`);
      assert.match(restored, /\[mcp_servers\.x\]/, name);
    }, plantCodexOriginal(original));
  }
});

const multiLineModel = `model = ${tripleDouble}\ngpt-mine\n${tripleDouble}\n`;
test("a root key whose value spans lines survives an apply and comes back whole", ..., async () => {
  for (const eol of ["\n", "\r\n"]) {
    const original = `${multiLineModel}model_provider = "openai"\n`.replaceAll("\n", eol);
    await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
      writeFileSync(fixture.codexConfigFile, `${readFileSync(fixture.codexConfigFile, "utf8")}${eol}[mcp_servers.x]${eol}command = "x"${eol}`);
      await recoverGlobalAgentProfile("default-codex");
      const restored = readFileSync(fixture.codexConfigFile, "utf8");
      // Without its last line end: the writer ends the lines of its root block with a line feed.
      assert.equal(countOf(restored, multiLineModel.trimEnd().replaceAll("\n", eol)), 1, restored);
      assert.equal(countOf(restored, "model_provider = \"openai\""), 1, restored);
    }, plantCodexOriginal(original));
  }
});

test("a quoted root key in the user's Codex config is the same key to LLM Router", ..., async () => {
  const original = "\"model_provider\" = \"openai\"\n\"model\" = \"gpt-mine\"\n";
  for (const edit of [false, true]) {
    await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
      if (edit) {
        appendUserCodexTables(fixture);
      }
      await recoverGlobalAgentProfile("default-codex");
      const restored = readFileSync(fixture.codexConfigFile, "utf8");
      assertHoldsEveryLine(restored, original);
      assert.doesNotMatch(restored, llmrCodexWrites);
      if (!edit) {
        assert.equal(restored, original);
      }
    }, plantCodexOriginal(original));
  }
});
```

`awkwardProfileTables`, `tripleDouble` and `countOf` are declared near the end of the file today. Move the three declarations above `plantCodexOriginal`, or place these tests after them. Do not copy them.

- [ ] **Step 4: Run the three and record the failures.**

Run: `node build/test.mjs core && node --test --test-name-pattern="comes back whole after an edited restore|survives an apply and comes back whole|is the same key to LLM Router" .test-dist/core/test/integration/profiles/profile-service.test.js`
Expected: all three FAIL. The first fails at `countOf` for `a nested array` and `a bracket line in a literal string`, or at the parse check after `run`. The second and third fail inside `withAppliedDefaultProfiles` at the parse check after the apply. Paste the three failure messages into the PR description. If one passes, stop: the row it covers does not reproduce, and the plan is wrong about it.

- [ ] **Step 5: Mark the three `todo`.** Add `todo: "S-1, fixed in Task 2"` to the first and `todo: "S-2, fixed in Task 3"` and `todo: "S-6, fixed in Task 3"` to the others, in the same options object as `skip`.

- [ ] **Step 6: Write the three S-8 tests.** Their outcomes are read from the code, not run. Each has a mutation that must turn it red. If a test fails on unchanged `main`, the reading was wrong: stop and report what `main` did.

```js
test("a managed Codex config that a strip leaves unchanged gets the saved original back, and a copy of what it held", ..., async () => {
  const replaced = `notes = ${tripleDouble}\n[model_providers.llm-router]\n${tripleDouble}\n`;
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    writeFileSync(fixture.codexConfigFile, replaced);
    const result = await recoverGlobalAgentProfile("default-codex");
    assert.equal(result.status.ok, true, result.status.message);
    assert.equal(readFileSync(fixture.codexConfigFile, "utf8"), "model_provider = \"openai\"\n");
    const copies = safetyCopies(fixture.codexConfigFile);
    assert.equal(copies.length, 1);
    assert.equal(readFileSync(copies[0], "utf8"), replaced);
  }, plantCodexOriginal("model_provider = \"openai\"\n"));
});

test("an apply backs up a Codex config of the user's that differs from the saved original, as it is", ..., async () => {
  const comments = "# just a note\n";
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    const backups = codexBackups(fixture.codexDir);
    assert.equal(backups.length, 1);
    assert.equal(readFileSync(path.join(fixture.codexDir, backups[0]), "utf8"), comments);
    await recoverGlobalAgentProfile("default-codex");
    assert.equal(readFileSync(fixture.codexConfigFile, "utf8"), comments);
  }, ({ codexDir }) => {
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(path.join(codexDir, "config.toml.llmr-original"), "model = \"old\"\n");
    writeFileSync(path.join(codexDir, "config.toml"), comments);
  });
});
```

The third test is for the `keepLiveFile` guard in `findSnapshot`, which only the Claude Code sweep passes. Write it beside `profile service does not strip the global settings file while a router-scoped Claude profile is enabled`, with `withScratchRuntimeHome`:

```js
test("while a router-scoped Claude profile is enabled, a takeover copy among the backups is still read as the snapshot", () => {
  withScratchRuntimeHome((settingsFile) => {
    writeFileSync(`${settingsFile}.llmr-original-missing`, "");
    writeFileSync(settingsFile, `${JSON.stringify({ env: { CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: "1" } }, null, 2)}\n`);
    restoreInactiveGlobalProfileConfigs([/* the enabled "llmr"-scope profile object of the neighbouring test */]);
    assert.equal(existsSync(settingsFile), true);
  }, { takeoverBackup: false });
});
```

Before the call, plant one backup `settings.json.llmr-backup-2099-01-01T00-00-00-000Z` holding `{ "permissions": { "allow": ["Bash(ls)"] }, "env": { "ANTHROPIC_BASE_URL": "http://127.0.0.1:9999", "ANTHROPIC_API_BASE_URL": "http://127.0.0.1:9999", "CLAUDE_AGENT_API_BASE_URL": "http://127.0.0.1:9999" } }`. Those are the three names in `claudeCodeGatewayEnvKeys`. By reading, the guard lets that backup through as the snapshot, so the file stays and holds `permissions`. Without the guard the backup is skipped and the managed file is removed. Add `assert.deepEqual(JSON.parse(readFileSync(settingsFile, "utf8")).permissions, { allow: ["Bash(ls)"] })` once Step 7 confirms it.

- [ ] **Step 7: Run the three, then break each condition once.**

Run: the single-file command with `--test-name-pattern="strip leaves unchanged|differs from the saved original|still read as the snapshot"`.
Expected: PASS on unchanged source. Then, one at a time, and each put back after:
  - In `restoreGlobalConfigFileContent`, return `{ changed: false, file, missingBackup: false, restored: false }` right after `saveConfigSafetyCopy(file, current)` when `stripped === undefined`. The first test fails.
  - In `writeGlobalCodexConfig`, change `matchers.stripManagedContent?.(previous) ?? previous` to `matchers.stripManagedContent?.(previous)`. The second test fails.
  - In `findSnapshot`, delete `&& !options.keepLiveFile`. The third test fails.

- [ ] **Step 8: Run the gates.** `npm run test:core`, `npm run typecheck`, `npm run lint`, `npm run test:architecture`. Expected: PASS, with three tests reported as `todo`.

- [ ] **Step 9: Commit.** `test(profiles): parse every Codex file the tests write, and pin three restore conditions`

---

### Task 2: Read a Codex config by statement (S-1, S-10, the strip half of S-6, part of S-14)

Second, because Tasks 3 to 5 are written on the statement type this task produces.

A user whose original `config.toml` has a `[profiles.<id>]` table with a nested array or a multi-line string gets that table back whole after an edited restore, where today the restored file stops inside the value and does not parse. A root line put back into a CRLF file ends in CRLF. A strip sees `"model_provider" = ...` as the key it is.

**Files:**
- Modify: `packages/core/src/profiles/codex-config-strip.ts`
- Modify: `packages/core/src/profiles/apply-support.ts` (gains `tomlKey`)
- Modify: `packages/core/src/profiles/service.ts` (imports `tomlKey`, deletes its own copy)
- Test: `packages/core/test/unit/profiles/codex-config-strip.test.mjs`, `packages/core/test/integration/profiles/profile-service.test.mjs`

**Interfaces:**
- Consumes: `withAppliedDefaultProfiles` with the parse check, and the `todo` test for S-1, from Task 1.
- Produces, in `apply-support.ts`: `export function tomlKey(value: string): string`, moved unchanged from `service.ts`.
- Produces, in `codex-config-strip.ts`:

```ts
export type TomlStatement = {
  eol: "" | "\n" | "\r\n";
  header?: string;
  key?: string;
  kind: "assignment" | "blank" | "comment" | "header";
  lines: string[];
  table: string;
  value?: string;
};

export function scanTomlStatements(content: string): TomlStatement[];
export function removeTablesOutsideValues(content: string, isRemoved: (header: string) => boolean): string;
```

  The rules `scanTomlStatements` encodes:
  - It walks `scanTomlLines(content)`. A line with `inValue` true joins the statement before it. So an assignment owns every line of its value, and a file whose last value is left open yields one statement per line, as today.
  - `lines` are raw, line ends included. Joining every statement's `lines` gives `content` back.
  - `eol` is the line end of the statement's last line, `""` for a last line with none.
  - `kind` is `"blank"` for a line of white space, `"comment"` for one whose first character after white space is `#`, `"header"` for one whose first character after white space is `[`, and `"assignment"` for any other. A line with no readable key is an assignment with no `key`.
  - `header` and `key` are normalised paths: each segment is unquoted, then written with `tomlKey`, and segments are joined with `.`. White space around a dot and a trailing comment are dropped. `[ model_providers . "llm-router" ] # x` and `[model_providers.llm-router]` both give `model_providers.llm-router`. `[profiles."b.c"]` gives `profiles."b.c"`. `[[fallbacks]]` gives `fallbacks`: no caller tells an array of tables from a table.
  - `table` is the `header` of the nearest header statement above, `""` before the first.
  - `value` is the first line's text after the `=`, with the comment cut where `scanTomlLine` says it starts, trimmed. For `model  =  "x"  # mine` it is `"x"`.
- Changes: `CodexDisplacedConfig` gains `eol?: "\r\n"`, set only when the snapshot's first statement ends in CRLF. A snapshot with line feeds reads as it does today, so the existing `deepEqual` assertions on it stand. Each root value is the whole statement's text without its last line end.
- Changes: `removeTablesOutsideValues` hands its predicate the normalised path, not the header's text. `removeTomlTable`, `removeCodexProviderTable` and `removeCodexMcpServerTable` keep their signatures and become calls to it. A comment block set off by a blank line above the next header now survives all three, as it already does in the strip.
- Every other export of the file keeps its signature.

- [ ] **Step 1: Write the failing unit tests** in `codex-config-strip.test.mjs`.

```js
test("joining the statements of a file gives the file back", () => {
  const join = (content) => scanTomlStatements(content).flatMap(({ lines }) => lines).join("");
  for (const content of [...Object.values(userFiles), usersOriginal, afterCodexMcpAdd, "a = 1", "a = [\n", "a = 1\r\nb = '''\r\nx\r\n'''\r\n"]) {
    assert.equal(join(content), content);
    assert.equal(join(managed(content)), managed(content));
  }
});

test("an assignment owns every line of its value, and knows its key, table and line end", () => {
  const statements = scanTomlStatements("\"model\" = \"\"\"\nx\n\"\"\"\r\n# c\n\n[ profiles . \"b.c\" ] # mine\na.\"b\" = [\n  [1],\n]  # end\n");
  assert.deepEqual(statements.map(({ kind, key, header, table, eol, lines }) => ({ kind, key, header, table, eol, count: lines.length })), [
    { kind: "assignment", key: "model", header: undefined, table: "", eol: "\r\n", count: 3 },
    { kind: "comment", key: undefined, header: undefined, table: "", eol: "\n", count: 1 },
    { kind: "blank", key: undefined, header: undefined, table: "", eol: "\n", count: 1 },
    { kind: "header", key: undefined, header: "profiles.\"b.c\"", table: "profiles.\"b.c\"", eol: "\n", count: 1 },
    { kind: "assignment", key: "a.b", header: undefined, table: "profiles.\"b.c\"", eol: "\n", count: 3 }
  ]);
  assert.equal(scanTomlStatements("model  =  \"x\"  # mine\n")[0].value, "\"x\"");
  assert.equal(scanTomlStatements("note = \"a # b\" # c\n")[0].value, "\"a # b\"");
});

test("a header is the same table however it is spelled", () => {
  const user = "[mcp_servers.mine]\ncommand = \"my-server\"\n";
  for (const header of ["[model_providers.llm-router]", "[ model_providers . \"llm-router\" ]", "[model_providers.'llm-router'] # x"]) {
    assert.equal(removeTomlTable(`${header}\nname = "n"\n\n${user}`, "model_providers", "llm-router"), user, header);
    assert.deepEqual(readCodexDisplacedConfig(`${header.replace("model_providers", "profiles")}\nx = 1\n`, ["llm-router"]).profileTables?.length, 1, header);
  }
});

test("readCodexDisplacedConfig reads a profile table whole when a value in it has a line that starts with a bracket", () => {
  const table = "[profiles.llm-router]\nx = [\n  [1, 2],\n]\ny = 3\n";
  assert.deepEqual(readCodexDisplacedConfig(`${table}\n[projects.x]\nk = 1\n`, ["llm-router"]).profileTables, [`${table}\n`]);
});

test("readCodexDisplacedConfig reads a quoted root key and a value that spans lines", () => {
  const model = "\"model\" = \"\"\"\ngpt-mine\n\"\"\"";
  assert.deepEqual(readCodexDisplacedConfig(`${model}\r\n'model_provider' = "openai"\r\n`, ["llm-router"]), {
    eol: "\r\n",
    model,
    modelProvider: "'model_provider' = \"openai\""
  });
});

test("a strip removes LLMR's line under a quoted key, and puts a displaced line back with the snapshot's line end", () => {
  const quoted = managed("").replace("model_provider = \"llm-router\"", "\"model_provider\" = \"llm-router\"");
  assert.equal(stripManagedCodexConfigContent(quoted, ["llm-router"], { modelLine: ours }), "");
  const stripped = stripManagedCodexConfigContent(managed(""), ["llm-router"], { modelLine: ours }, { eol: "\r\n", modelProvider: "model_provider = \"openai\"" });
  assert.equal(stripped, "model_provider = \"openai\"\r\n");
});
```

Update one existing test to the new shape. In `removeTablesOutsideValues hands the predicate the header without its comment`, the expected list becomes `["a.\"b]#\"", "d"]`.

- [ ] **Step 2: Run them and watch them fail.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/profiles/codex-config-strip.test.js`
Expected: FAIL. The first two fail on `scanTomlStatements` not being exported. The bracket-line test returns `["[profiles.llm-router]\nx = [\n"]`.

- [ ] **Step 3: Remove `todo` from the S-1 test and watch it fail.** Run the single-file integration command with `--test-name-pattern="comes back whole after an edited restore"`. Expected: FAIL, as recorded in Task 1.

- [ ] **Step 4: Move `tomlKey` to `apply-support.ts`.** Export it beside `tomlQuotedKey`. Delete the copy in `service.ts` and import it there.

- [ ] **Step 5: Add `TomlStatement` and `scanTomlStatements`** to `codex-config-strip.ts`, by the rules in the Interfaces block.

- [ ] **Step 6: Rebuild every reader in the file on statements.** One rule each:
  - `removeTablesOutsideValues`: a table is a header statement and every statement after it up to the next header. The comment rule it has today stays. `removeTomlTable` removes the table whose `header` is `` `${section}.${tomlKey(name)}` ``. `removeCodexMcpServerTable` removes `mcp_servers.<name>`, its four named child tables, and with `includeChildTables` every header that starts with `mcp_servers.<name>.`.
  - `readCodexDisplacedConfig`: a root value is the first statement with `table === ""` and that `key`. A profile table is every statement from a header equal to `` `profiles.${tomlKey(id)}` `` up to the next header.
  - `stripManagedCodexConfigContent`: it decides per statement. A removed assignment goes with every line of its value. A marker and the configured-model comment are comment statements, so text inside a value is never one. A put-back line ends with `displaced.eol ?? "\n"`. An appended table is joined with that line end too.
  - `isRootKeyInsideManagedBlock` and `managedConfiguredModel`: by statement kind and `key`. `managedConfiguredModel` reads only a comment statement in the root.
  - `rootAssignmentValue`, and so `sameRootAssignment`: the `value` of the first statement of the given text.

- [ ] **Step 7: Run the unit file.** Expected: PASS, the 600-case test included.

- [ ] **Step 8: Run the S-1 test and the suite.** The S-1 test passes with no `todo`. Then `npm run test:core`. An existing assertion that now differs by a byte is a finding to explain in the PR, not a value to edit until it passes. The one expected kind is a comment block kept above a table where `removeTomlTable` or `removeCodexMcpServerTable` used to drop it.

- [ ] **Step 9: Break it twice.** Make `scanTomlStatements` start a new statement at every line and confirm the bracket-line test fails. Make the put-back line end with `"\n"` always and confirm the quoted-key test's second assertion fails. Put both back.

- [ ] **Step 10: Run the gates and commit.** `npm run typecheck`, `npm run lint`, `npm run test:architecture`. Then `fix(profiles): read a Codex config by statement, so a value that spans lines stays whole`

---

### Task 3: Write and restore a Codex config by statement, with no line-pattern reader left (S-2, S-5, S-6, S-12, rest of S-14)

Third, because it migrates the callers Task 2 did not own, and deletes the helpers the scanner replaces.

A user whose `config.toml` has a root `model` that spans lines, or root keys written in quotes, can apply a profile and still have a file Codex loads. Today the apply itself writes an invalid file in both cases. A marker line that is only text inside one of the user's strings no longer makes LLM Router take the file for its own, so the original is saved and the restore runs.

**Files:**
- Modify: `packages/core/src/profiles/codex-config-strip.ts`, `packages/core/src/profiles/service.ts`
- Test: `packages/core/test/unit/profiles/codex-config-strip.test.mjs`, `packages/core/test/integration/profiles/profile-service.test.mjs`

**Interfaces:**
- Consumes: `TomlStatement`, `scanTomlStatements`, `removeTomlTable` and `tomlKey` from Task 2. The `todo` tests for S-2 and S-6 from Task 1.
- Produces, all exported from `codex-config-strip.ts`, each replacing the `service.ts` function of the same or the noted name, which is deleted:

```ts
export function rootTomlAssignment(source: string, key: string): string | undefined;
export function removeRootTomlKeys(source: string, keys: string[]): string;
export function removeManagedMarkerLines(source: string): string;
export function removeManagedConfiguredModelLine(source: string): string;
export function codexProfileTableBody(source: string, providerId: string): string;
export function isManagedCodexConfigContent(content: string, providerId: string): boolean;
```

  - `rootTomlAssignment` returns the whole root statement with that `key`, every line of its value, without leading white space and without its last line end.
  - `removeRootTomlKeys` removes every root statement whose `key` is in `keys`.
  - `removeManagedMarkerLines` removes each comment statement whose trimmed text is in `codexManagedMarkers`. It takes no marker list: it had one caller and one list.
  - `removeManagedConfiguredModelLine` removes each root comment statement that starts with `managedConfiguredModelPrefix`.
  - `codexProfileTableBody` replaces `legacyCodexProfileTableBody`. It returns the bodies of every table whose `header` is `` `profiles.${tomlKey(providerId)}` ``, joined with a line feed and trimmed. `removeTomlTable` already removes every one, so the mover and the remover take the same tables (S-5).
  - `isManagedCodexConfigContent` keeps its rule and loses its patterns: true when a comment statement is `managedRootStart` or `managedProviderStart`, or a header statement is `` `model_providers.${tomlKey(providerId)}` ``. Task 4 changes the rule.
- Changes in `service.ts`: `removeCodexProfileTable` is deleted and its one caller calls `removeTomlTable(content, "profiles", providerId)`. `returnCodexProfileTable` tests for the header with statements and compares settings as statement texts. `codexProfileFileUsersContent` drops the first root statement with `key === "show_all_sessions"` and `value === "true"`, not a line that reads so.
- After this task `service.ts` imports neither `scanTomlLines` nor `escapeRegExp`.

- [ ] **Step 1: Write the failing tests.**

In `codex-config-strip.test.mjs`:

```js
test("rootTomlAssignment returns a root key with every line of its value, whether or not the key is quoted", () => {
  const model = "\"model\" = \"\"\"\ngpt-mine\n\"\"\"";
  assert.equal(rootTomlAssignment(`# mine\n  ${model}\nother = 1\n[t]\nmodel = "in a table"\n`, "model"), model);
  assert.equal(rootTomlAssignment("notes = \"\"\"\nmodel = \"inside\"\n\"\"\"\n", "model"), undefined);
});

test("removeRootTomlKeys removes a quoted key and every line of a value", () => {
  assert.equal(removeRootTomlKeys("\"model\" = [\n  \"a\",\n]\r\nkeep = 1\r\n'model_provider' = \"x\"\r\n", ["model", "model_provider"]), "keep = 1\r\n");
});

test("a marker or a configured-model line inside a value is text, and stays", () => {
  const notes = "notes = \"\"\"\n# BEGIN LLMR managed profile\n# LLMR configured model = \"x\"\n\"\"\"\n";
  assert.equal(removeManagedMarkerLines(`${managedRootStart}\n${notes}${managedRootEnd}\n`), notes);
  assert.equal(removeManagedConfiguredModelLine(`# LLMR configured model = "y"\n${notes}`), notes);
  assert.equal(managedConfiguredModel(notes), undefined);
  assert.equal(isManagedCodexConfigContent(notes, "llm-router"), false);
  assert.equal(isManagedCodexConfigContent("notes = \"\"\"\n[model_providers.llm-router]\n\"\"\"\n", "llm-router"), false);
  assert.equal(isManagedCodexConfigContent(managed(""), "llm-router"), true);
});

test("codexProfileTableBody takes every table of that name, as the remover does", () => {
  const source = "[profiles.llm-router]\na = 1\n\n[other]\nk = 0\n\n[profiles.\"llm-router\"]\nb = 2\n";
  assert.equal(codexProfileTableBody(source, "llm-router"), "a = 1\n\nb = 2");
  assert.equal(removeTomlTable(source, "profiles", "llm-router"), "[other]\nk = 0\n\n");
});
```

In `profile-service.test.mjs`, after the S-6 test:

```js
test("a marker line inside one of the user's strings does not make their Codex config LLM Router's", ..., async () => {
  const original = `model_provider = "openai"\nnotes = ${tripleDouble}\n# BEGIN LLMR managed profile\nkeep me\n${tripleDouble}\n`;
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    assert.equal(readFileSync(`${fixture.codexConfigFile}.llmr-original`, "utf8"), original);
    assert.equal(countOf(readFileSync(fixture.codexConfigFile, "utf8"), "# BEGIN LLMR managed profile\n"), 2);
    const result = await recoverGlobalAgentProfile("default-codex");
    assert.equal(result.status.ok, true, result.status.message);
    assert.equal(readFileSync(fixture.codexConfigFile, "utf8"), original);
    assert.deepEqual(filesHolding(fixture.codexDir, fixture.codexToken), []);
  }, plantCodexOriginal(original));
});
```

- [ ] **Step 2: Remove `todo` from the S-2 and S-6 tests.** Run the unit file and, in the integration file, `--test-name-pattern="survives an apply and comes back whole|is the same key to LLM Router|does not make their Codex config"`. Expected: the unit tests fail on missing exports, and the three integration tests fail, the first two as recorded in Task 1 and the third at the `.llmr-original` read.

- [ ] **Step 3: Add the six functions** to `codex-config-strip.ts` by the Interfaces block, and export them.

- [ ] **Step 4: Migrate `service.ts` and delete the originals.** `buildCodexConfigToml`, `buildSeparateCodexProfileToml`, `managedModelAssignment`, `maybeWriteSeparateCodexProfileFile`, `returnCodexProfileTable` and `codexProfileFileUsersContent` call the exports. Delete `removeRootTomlKeys`, `rootTomlAssignment`, `removeManagedConfiguredModelLine`, `removeCodexProfileTable`, `legacyCodexProfileTableBody`, `removeManagedMarkerLines` and `isManagedCodexConfigContent` from `service.ts`. `decideCodexRootLines` already takes its lines as text, so a `currentModelLine` of several lines needs no change there: the root block is joined with line feeds and the user's statement goes in as it is.

- [ ] **Step 5: Change the first S-8 test from Task 1.** Its replaced file, a provider header inside a string, is now the user's file and not a managed one. The restore leaves it alone. The test is renamed `a Codex config the user replaced, with LLMR's header only as text in a string, is left as they wrote it`, and its assertions become: the file equals `replaced`, and `safetyCopies` is empty. The status of that restore was read, not run, so the test does not assert it: record what it is in the PR. Say in the PR that the fall-through to the snapshot it pinned can no longer be reached for Codex, because a managed file always holds a statement the strip removes. Do not delete the branch: the restore plan owns that function.

- [ ] **Step 6: Run the tests.** The unit file passes. The three integration tests pass. Then `npm run test:core`. No test in either Codex test file carries `todo`:

Run: `grep -n "todo:" packages/core/test/integration/profiles/profile-service.test.mjs packages/core/test/unit/profiles/codex-config-strip.test.mjs`
Expected: no output.

- [ ] **Step 7: Prove no line-pattern reader is left.**

Run: `grep -nE "scanTomlLines|escapeRegExp" packages/core/src/profiles/service.ts`
Expected: no output.

Run: `grep -n "scanTomlLines(" packages/core/src/profiles/codex-config-strip.ts`
Expected: three lines, the definition and the calls in `scanTomlStatements` and `firstCodexTableIndex`.

Run: `grep -nE "new RegExp|\.split\(" packages/core/src/profiles/codex-config-strip.ts`
Expected: only the split inside `scanTomlLines`. If `escapeRegExp` has no caller left in the file, delete it.

- [ ] **Step 8: Break it twice.** Make `rootTomlAssignment` return only the statement's first line and confirm the S-2 test fails at the parse check. Make `isManagedCodexConfigContent` test with `content.includes(managedRootStart)` and confirm the marker test fails. Put both back.

- [ ] **Step 9: Run the gates and commit.** `npm run typecheck`, `npm run lint`, `npm run test:architecture`. Then `fix(profiles): write and restore a Codex config by statement, with no line-pattern reader left`

---

### Task 4: Keep a user's own provider table and `model_provider` line (S-13, S-11)

Fourth, because the rule is written on Task 3's statement-based `isManagedCodexConfigContent`, and because Task 5 strips the saved original with the snapshot strip this task adds.

A user who already has `[model_providers.llm-router]` in their `config.toml`, with their own endpoint and key, keeps it. Today LLM Router takes that file for its own, saves no original, replaces the table, and then cannot restore: the user's table and key are in no file. A user whose profile uses a provider id they also use themselves, such as `openai`, gets their `model_provider` line back after a restore.

**The rule.** A `[model_providers.<id>]` table is LLM Router's only when one of these holds:
- the statement before its header, blank lines skipped, is the comment `managedProviderStart`;
- its body has an `experimental_bearer_token` whose `value` starts with a quote and then `profileTokenPrefix`.

Any other table of that name is the user's. A file is managed when it holds LLM Router's root or provider start marker as a comment statement, or a provider table that is LLM Router's by this rule. A saved original or a backup is the user's file, so a strip of one leaves its `model_provider` line alone. Such a line with no table beside it only loads in Codex for a built-in id, so it is a choice the user made (inferred from X-3, not run against Codex).

**What the writer still does.** `buildCodexConfigToml` removes any table of that name from the live file, because two tables of one name do not load. The user's table is then only in `config.toml.llmr-original`, which is the copy this task makes sure exists, and a restore puts it back.

**Files:**
- Modify: `packages/core/src/profiles/codex-config-strip.ts`, `packages/core/src/profiles/backup-files.ts`, `packages/core/src/profiles/service.ts` (`codexManagedContent`)
- Test: `packages/core/test/integration/profiles/profile-service.test.mjs`, `packages/core/test/unit/profiles/codex-config-strip.test.mjs`

**Interfaces:**
- Consumes: `scanTomlStatements`, `isManagedCodexConfigContent` and the parse check from Tasks 1 to 3.
- Produces, in `backup-files.ts`: `export const profileTokenPrefix = "llmr-profile-";`. `profileTokenPattern` is built from it and stays private.
- Produces, in `codex-config-strip.ts`: `export function stripCodexSnapshotContent(content: string, providerIds: string[]): string | undefined`. It is `stripManagedCodexConfigContent(content, providerIds)` with one difference: a root `model_provider` line is never removed.
- Changes: `stripManagedCodexConfigContent` and `isManagedCodexConfigContent` use the rule above for a provider table. ToolHub and Context Archive tables are still removed by name, because those names are LLM Router's own.
- Changes: `CodexDisplacedConfig` gains `providerTables?: string[]`. `readCodexDisplacedConfig` fills it with each `model_providers.<id>` table of the snapshot, read the way `profileTables` are. A strip appends a displaced provider table when no header statement of that path is left in its result, exactly as it does for a profile table.
- Changes: in `codexManagedContent`, `stripManagedContent` becomes `(content) => stripCodexSnapshotContent(content, providerIds)`. `stripLiveContent` is unchanged.
- Produces, in the test file: `withAppliedDefaultProfiles` takes `options.configure?: (config) => void`, called on the config before `beforeApply`.

- [ ] **Step 1: Write the failing integration tests.** The first is the most exact test of the plan. Do not weaken an assertion in it to make it pass.

```js
const usersProviderKey = "my-own-secret";
const usersProviderOriginal = [
  "model_provider = \"llm-router\"",
  "",
  "[model_providers.llm-router]",
  "name = \"Mine\"",
  "base_url = \"https://mine.example.test/v1\"",
  `experimental_bearer_token = "${usersProviderKey}"`,
  ""
].join("\n");

test("a user's own provider table under LLM Router's id, key included, is on disk at every step and comes back byte for byte", ..., async () => {
  for (const reapply of [false, true]) {
    await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
      const original = `${fixture.codexConfigFile}.llmr-original`;
      assert.equal(readFileSync(original, "utf8"), usersProviderOriginal, "the original is saved as the user wrote it");
      const applied = readFileSync(fixture.codexConfigFile, "utf8");
      assert.equal(countOf(applied, "[model_providers.llm-router]"), 1);
      assert.equal(applied.includes(usersProviderKey), false, "LLM Router's table replaced the user's in the live file");
      assert.deepEqual(filesHolding(fixture.codexDir, usersProviderKey), [original]);
      if (reapply) {
        await applySecondCodexModel(fixture.config);
        await replacePersistedAppConfig(fixture.config);
        assert.deepEqual(filesHolding(fixture.codexDir, usersProviderKey), [original]);
        assert.deepEqual(filesBesideCodexConfigHolding(fixture), []);
      }
      const result = await recoverGlobalAgentProfile("default-codex");
      assert.equal(result.status.ok, true, result.status.message);
      assert.equal(readFileSync(fixture.codexConfigFile, "utf8"), usersProviderOriginal, String(reapply));
      assert.deepEqual(filesHolding(fixture.codexDir, fixture.codexToken), [], String(reapply));
    }, plantCodexOriginal(usersProviderOriginal));
  }
});

test("a user's own provider table comes back once, with their key, after they edited the file while LLM Router had it", ..., async () => {
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    appendUserCodexTables(fixture);
    const result = await recoverGlobalAgentProfile("default-codex");
    assert.equal(result.status.ok, true, result.status.message);
    const restored = readFileSync(fixture.codexConfigFile, "utf8");
    assertHoldsEveryLine(restored, usersProviderOriginal);
    assert.match(restored, /\[mcp_servers\.mine\]/);
    assert.deepEqual(filesHolding(fixture.codexDir, fixture.codexToken), []);
    assert.equal(restored.includes("llmr-model-catalog"), false);
  }, plantCodexOriginal(usersProviderOriginal));
});

test("a profile whose provider id is one the user also uses gives their model_provider line back", ..., async () => {
  const original = "model = \"gpt-mine\"\nmodel_provider = \"openai\"\n";
  for (const edit of [false, true]) {
    await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
      if (edit) {
        appendUserCodexTables(fixture);
      }
      await recoverGlobalAgentProfile("default-codex");
      const restored = readFileSync(fixture.codexConfigFile, "utf8");
      assertHoldsEveryLine(restored, original);
      assert.equal(restored.includes("[model_providers.openai]"), false);
      if (!edit) {
        assert.equal(restored, original);
      }
    }, plantCodexOriginal(original), { configure: (config) => { config.profile.profiles.find((profile) => profile.id === "default-codex").providerId = "openai"; } });
  }
});
```

- [ ] **Step 2: Write the failing unit tests.**

```js
const usersTable = "[model_providers.llm-router]\nname = \"Mine\"\nexperimental_bearer_token = \"my-own-secret\"\n";

test("a provider table with no marker above it and no LLMR token is the user's", () => {
  assert.equal(isManagedCodexConfigContent(usersTable, "llm-router"), false);
  assert.equal(strip(usersTable), undefined);
  assert.equal(stripCodexSnapshotContent(`model_provider = "llm-router"\n\n${usersTable}`, ["llm-router"]), undefined);
  assert.equal(isManagedCodexConfigContent(usersTable.replace("my-own-secret", "llmr-profile-TEST"), "llm-router"), true);
  assert.equal(isManagedCodexConfigContent(`${managedProviderStart}\n\n${usersTable}`, "llm-router"), true);
});

test("a snapshot strip keeps the model_provider line and still removes what only LLMR writes", () => {
  const snapshot = `model_provider = "llm-router"\nmodel_catalog_json = "/tmp/codex-home/llmr-model-catalog.json"\n\n[mcp_servers.llmr-toolhub]\ncommand = "node"\n`;
  assert.equal(stripCodexSnapshotContent(snapshot, ["llm-router"]), "model_provider = \"llm-router\"\n");
});

test("a displaced provider table is appended once, and not when the file still has one of that name", () => {
  const displaced = readCodexDisplacedConfig(usersTable, ["llm-router"]);
  assert.deepEqual(displaced.providerTables, [usersTable]);
  assert.equal(stripManagedCodexConfigContent(managed(""), ["llm-router"], { modelLine: ours }, displaced), usersTable);
  const kept = managed("").replace(`${managedProviderStart}\n`, "").replace("llmr-profile-TEST", "another-key");
  assert.equal(countOf(stripManagedCodexConfigContent(kept, ["llm-router"], { modelLine: ours }, displaced), "[model_providers.llm-router]"), 1);
});
```

Add `const countOf = (text, part) => text.split(part).length - 1;` to the unit file.

- [ ] **Step 3: Give LLM Router's token to the unit fixtures that plant a bare table as LLM Router's.** In each of these tests, every `[model_providers.llm-router]` table, however its header is spelled, gains the line `experimental_bearer_token = "llmr-profile-TEST"`, and the expected text is unchanged: `LLMR's tables are removed however their header is written` (its three provider headers only), `a removed table ends at an array-of-tables header and keeps the comment above it`, `a comment at the end of LLMR's table goes with the table` (the token is only in a comment there today), and `removing LLMR's tables from between the user's keeps their spacing and their comments`.

- [ ] **Step 4: Run and watch them fail.** Unit file, then the integration file with `--test-name-pattern="own provider table|also uses"`. Expected: the first integration test fails at reading `config.toml.llmr-original`, which does not exist. The third fails at `assertHoldsEveryLine` for `model_provider = "openai"`.

- [ ] **Step 5: Export `profileTokenPrefix`** from `backup-files.ts` and build `profileTokenPattern` from it.

- [ ] **Step 6: Apply the rule** in `isManagedCodexConfigContent` and in the strip's provider-table predicate, through one shared private function in `codex-config-strip.ts`, so the two cannot disagree. Add `stripCodexSnapshotContent` and `providerTables`. Point `codexManagedContent` at the snapshot strip.

- [ ] **Step 7: Run the tests.** The new ones pass. `restoring a Codex config whose LLMR markers were deleted by hand still removes LLMR's provider` still passes: that file keeps LLM Router's token. Then `npm run test:core`. An integration fixture that plants a bare table of that name as LLM Router's gets the token line too, and the PR lists each one.

- [ ] **Step 8: Break it three times.** Make the rule match by header name alone and confirm the first integration test fails. Make `stripCodexSnapshotContent` remove the `model_provider` line and confirm the first and third fail. Drop `providerTables` from the strip and confirm the second fails. Put all three back.

- [ ] **Step 9: State the limits in the PR, run the gates, commit.** Limits: a child table of the user's provider, such as `[model_providers.llm-router.http_headers]`, is not removed by the writer today and stays in the live file beside LLM Router's table (read, not run, and not changed here). A live file where someone removed LLM Router's marker and changed its token keeps that table after a restore, because nothing in it is LLM Router's any more. A displaced provider table comes back at the end of an edited file, not where it was. Then `npm run typecheck`, `npm run lint`, `npm run test:architecture`, and `fix(profiles): keep a user's own Codex provider table and model_provider line`

---

### Task 5: Keep no profile token in a saved original, and remove only the `model_provider` line LLM Router wrote (S-9, S-7)

Fifth, because the first snapshot is written through Task 4's snapshot strip. Written through today's strip, it would lose the user's `model_provider` line (S-11).

A `config.toml` that LLM Router does not take for its own, but that still holds a ToolHub table from an earlier takeover, is saved as the original today with the old profile token in it, and that copy outlives the restore. After this task the original is saved without LLM Router's content. A `model_provider` line left from another provider id is removed only when it is the line LLM Router recorded writing.

**Files:**
- Modify: `packages/core/src/profiles/backup-files.ts` (`ensureOriginalSnapshot`), `packages/core/src/profiles/service.ts` (`writeGlobalCodexConfig`, `buildCodexConfigToml`, `readCodexWrittenRecord`), `packages/core/src/profiles/codex-config-strip.ts` (`CodexWrittenRecord`, `CodexWrittenLines`, the strip)
- Test: `packages/core/test/unit/profiles/backup-files.test.mjs`, `packages/core/test/unit/profiles/codex-config-strip.test.mjs`, `packages/core/test/integration/profiles/profile-service.test.mjs`

**Interfaces:**
- Consumes: `stripCodexSnapshotContent` through `matchers.stripManagedContent`, from Task 4.
- Changes: `ensureOriginalSnapshot(file: string, previous: string | undefined, mode?: number, content?: string): void`. With `content`, the original is written with that text. Without it, the file is copied as today. Every other caller passes three arguments and is unchanged.
- Changes: `CodexWrittenRecord` gains `modelProviderLine?: string`, and `CodexWrittenLines` picks it too. `buildCodexConfigToml` returns it in `written` as the `model_provider` line it wrote. `readCodexWrittenRecord` accepts it as an optional line.
- Changes: in a strip with `written.modelProviderLine` set, a root `model_provider` line is LLM Router's when `sameRootAssignment` matches it against that line. With no such field the test is today's, the provider ids. `stripCodexSnapshotContent` is unaffected.

- [ ] **Step 1: Write the failing tests.**

In `backup-files.test.mjs`:

```js
test("ensureOriginalSnapshot writes the given text in place of a copy of the file", (t) => {
  // same temp-dir setup as "ensureOriginalSnapshot writes once and never refreshes"
  writeFileSync(file, "raw\n");
  ensureOriginalSnapshot(file, "raw\n", 0o600, "stripped\n");
  assert.equal(readFileSync(`${file}.llmr-original`, "utf8"), "stripped\n");
  ensureOriginalSnapshot(file, "raw\n", 0o600, "later\n");
  assert.equal(readFileSync(`${file}.llmr-original`, "utf8"), "stripped\n");
});
```

In `codex-config-strip.test.mjs`:

```js
test("a model_provider line goes only when it is the one LLMR recorded, whatever the provider id is now", () => {
  const content = "model_provider = \"old-id\"\n\n[mcp_servers.mine]\ncommand = \"x\"\n";
  const displaced = { modelProvider: "model_provider = \"openai\"" };
  assert.equal(
    stripManagedCodexConfigContent(content, ["new-id"], { modelProviderLine: "model_provider = \"old-id\"" }, displaced),
    "model_provider = \"openai\"\n\n[mcp_servers.mine]\ncommand = \"x\"\n"
  );
  assert.equal(stripManagedCodexConfigContent(content, ["new-id"], { modelProviderLine: "model_provider = \"new-id\"" }, displaced), undefined);
});

test("a record with no model_provider line falls back to the provider id", () => {
  assert.equal(stripManagedCodexConfigContent(managed(""), ["llm-router"], { modelLine: ours }, { modelProvider: "model_provider = \"openai\"" }), "model_provider = \"openai\"\n");
});
```

In `profile-service.test.mjs`:

```js
test("a saved Codex original holds no profile token from an earlier takeover", ..., async () => {
  const oldToken = "llmr-profile-oldtokenvalue";
  const original = [
    "model_provider = \"openai\"",
    "",
    "# BEGIN LLMR managed ToolHub MCP",
    "[mcp_servers.llmr-toolhub]",
    "command = \"node\"",
    "",
    "[mcp_servers.llmr-toolhub.env]",
    `TOOLHUB_OPENAI_API_KEY = "${oldToken}"`,
    "# END LLMR managed ToolHub MCP",
    ""
  ].join("\n");
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    assert.deepEqual(filesHolding(fixture.codexDir, oldToken), []);
    assert.equal(readFileSync(`${fixture.codexConfigFile}.llmr-original`, "utf8"), "model_provider = \"openai\"\n");
    const result = await recoverGlobalAgentProfile("default-codex");
    assert.equal(result.status.ok, true, result.status.message);
    assert.equal(readFileSync(fixture.codexConfigFile, "utf8"), "model_provider = \"openai\"\n");
    assert.deepEqual(filesHolding(fixture.codexDir, oldToken), []);
  }, plantCodexOriginal(original));
});
```

Extend the existing test `an apply records which Codex lines LLMR wrote, and every restore outcome clears the record` with `assert.equal(record.modelProviderLine, "model_provider = \"llm-router\"", name);`.

- [ ] **Step 2: Run and watch them fail.** Expected: the `backup-files` test reads `raw\n`. The first strip test returns `undefined` for its first assertion. The integration test finds the token in `config.toml.llmr-original`. The fallback test passes today and is there to fail under a wrong build.

- [ ] **Step 3: Add the fourth parameter to `ensureOriginalSnapshot`** and pass it from `writeGlobalCodexConfig` as `previous === undefined ? undefined : matchers.stripManagedContent?.(previous) ?? previous`. A file the strip does not change is written as it is, so Task 4's byte-for-byte test still holds.

- [ ] **Step 4: Record and use `modelProviderLine`** as the Interfaces block says.

- [ ] **Step 5: Run the tests.** The new ones pass. Task 4's three integration tests still pass. Then `npm run test:core`.

- [ ] **Step 6: Break it twice.** Pass no fourth argument in `writeGlobalCodexConfig` and confirm the integration test fails. Ignore `written.modelProviderLine` in the strip and confirm the first strip test fails. Put both back.

- [ ] **Step 7: Run the gates and commit.** `npm run typecheck`, `npm run lint`, `npm run test:architecture`. Then `fix(profiles): keep no profile token in a saved Codex original, and remove only the model_provider line LLMR wrote`

---

### Task 6: Keep the copy of a user's first profile settings, and never overwrite a copy (S-3, S-15)

Last, because it depends on nothing above and concerns a legacy table (X-1) and a collision nobody has observed.

A user whose script re-adds the same `[profiles.<id>]` table to `config.toml` before every apply loses the only copy of the settings they first had in the profile file, after the fourth apply. After this task a table equal to what the profile file already holds makes no new copy. Two copies or backups of one file made in the same millisecond get two names.

**Files:**
- Modify: `packages/core/src/profiles/service.ts` (`maybeWriteSeparateCodexProfileFile`), `packages/core/src/profiles/backup-files.ts` (`backupFilePath`)
- Test: `packages/core/test/integration/profiles/profile-service.test.mjs`, `packages/core/test/unit/profiles/backup-files.test.mjs`

**Interfaces:**
- Changes: `maybeWriteSeparateCodexProfileFile` saves a copy only when the user's content of the existing profile file is not empty and differs from `moved`.
- Changes: `backupFilePath(file: string): string` returns a path that does not exist. When the timestamped name is taken it appends `-1`, then `-2`, and so on. `backupFiles` matches by prefix and sorts by name, so a suffixed name is found and sorts after the plain one.

- [ ] **Step 1: Write the failing tests.**

In `profile-service.test.mjs`:

```js
test("a profile table added again and again does not push out the copy of the user's first profile settings", ..., async () => {
  await withAppliedDefaultProfiles(["default-codex"], async ({ codexConfigFile, codexDir, config }) => {
    const profileFile = path.join(codexDir, "llm-router.config.toml");
    writeFileSync(profileFile, `${readFileSync(profileFile, "utf8")}approval_policy = "never"  # S0 mine\n`);
    for (let round = 0; round < 4; round += 1) {
      writeFileSync(codexConfigFile, `${readFileSync(codexConfigFile, "utf8")}\n[profiles.llm-router]\nsandbox_mode = "read-only"\n`);
      await applyProfileConfig(config);
    }
    const copies = safetyCopies(profileFile);
    assert.equal(copies.length, 1);
    assert.match(readFileSync(copies[0], "utf8"), /# S0 mine/);
  });
});
```

In `backup-files.test.mjs`:

```js
test("two copies of one file in the same millisecond are both kept", posixOnly, (t) => {
  // same temp-dir setup as "saveRemovedConfigCopy keeps the newest three copies, private, with no profile token"
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-21T00:00:00.000Z") });
  const first = saveRemovedConfigCopy(stateDir, file, "one\n");
  const second = saveRemovedConfigCopy(stateDir, file, "two\n");
  assert.notEqual(first, second);
  assert.equal(readFileSync(first, "utf8"), "one\n");
  assert.equal(readFileSync(second, "utf8"), "two\n");
  assert.deepEqual(backupFiles(path.join(stateDir, path.basename(file))), [first, second]);
});
```

- [ ] **Step 2: Run and watch them fail.** Expected: the first finds three copies, none with `S0`. The second fails at `notEqual`.

- [ ] **Step 3: Add the condition** in `maybeWriteSeparateCodexProfileFile`: read `codexProfileFileUsersContent(existing, values.providerId)` once, and copy only when it is not empty and not equal to `moved`.

- [ ] **Step 4: Make `backupFilePath` return a free name**, with `existsSync`.

- [ ] **Step 5: Run the tests.** Both pass. `backupFilePath names a timestamped backup beside the file` and `a profile table the user adds to a Codex config replaces their settings in LLMR's profile file whole, and the earlier ones are kept as a copy` still pass. Then `npm run test:core`.

- [ ] **Step 6: Run the gates and commit.** `npm run typecheck`, `npm run lint`, `npm run test:architecture`. Then `fix(profiles): keep the copy of a user's first profile settings, and never overwrite a copy`

---

## Not planned here

- **`config.toml.llmr-original` stays beside the file after a successful Codex restore** (run by the research pass). After Task 5 it holds no profile token. Whether it should go is a restore question and is left to the restore plan.
- **A child table of the user's provider stays in the live file under LLM Router's table** (read while planning, not run). `removeTomlTable` removes one header, so `[model_providers.<id>.http_headers]` of the user's is still there while the profile applies. It is not in the S table. It needs a run first.
- **Blank lines LLM Router wrote into a CRLF file keep their LF** after a restore. TOML allows mixed line ends, and S-10 as recorded is the put-back line.

## Open with the owner

**1. Should an apply refuse a Codex profile whose provider id is `openai`, `ollama` or `lmstudio`?**

X-3 says Codex reserves those ids and does not let a config override them. If that holds, LLM Router's `[model_providers.openai]` table has no effect, and a profile with that id sends Codex to the built-in provider while LLM Router reports the profile as applied (inferred from X-3, which was read through a summarising fetch, and not run against Codex). Nothing in the S table depends on the answer: Task 4 keeps the user's own `model_provider` line whichever way this goes.

- (a) Refuse. `applyCodexProfile` returns a status that is not ok and names the three ids, and the profile editor rejects them. Recommended, after one run against a real Codex confirms that the override is ignored.
- (b) Leave it and say so in the docs page for Codex profiles.
- (c) Do nothing until someone reports it. No UI path sets the id to a reserved one by default: the default is `llm-router`.

No task of this plan waits on it. If the owner picks (a), it becomes Task 7, and its first step is the run against Codex.
