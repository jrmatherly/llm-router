# Backlog: Codex Config Stripper Implementation Plan

> **Status, 2026-11-25, batch 6: Tasks 2 and 3 audited on another model at `main` `024c3262` by building both from the text in a scratch worktree, and corrected (one Blocker, seven Corrections, all applied below and each marked "batch 6 audit").** The Blocker was that the marker remover as written left the blank lines around a marker, which made a second apply add a blank line and failed an existing CRLF test. With the corrections the audit's build passed typecheck, lint, the architecture suite and `npm run test:core` (2203 tests, 0 fail) after Task 3, and every mutation the steps name failed as intended. PR 156 changed no Codex function these tasks touch (read by the audit). Tasks 4 to 6 still owe their text audit. Not checked by that audit: Windows, a real Codex, and the LF case of the Blocker.

> **Status, 2026-11-25: Task 1 audited on another model at `main` `fddb278a` with harness Task 3, and corrected (no Blocker, two Corrections in this plan). Tasks 2 to 6 still owe their text audit.** The audit built both tasks in order and reproduced every red and green this task's steps expect. What follows is the fix round's status of 2026-11-24. Every Blocker and Correction of the 2026-11-22 audit was checked at `main` `c491eb48`, most by a run of the real apply and restore paths with each Codex file parsed by Python `tomllib` (TOML 1.0) in place of `smol-toml`. Both Blockers and all seven Corrections hold, and the text below is corrected for each. The Codex functions this plan changes have not changed since the plan was drafted, so no task is already done (run, `git diff eb84a3ba..c491eb48` shows no change to `codex-config-strip.ts` and none to the Codex functions of `service.ts`). Nobody verified any planned code, since no fix was prototyped. Nor `smol-toml` itself, Windows, or Codex's own reading of any output. The changed text needs one audit on another model before batch 6 (the delivery order's rule for the scanner).

> **Delivery, 2026-11-25.** [`2026-11-25-delivery-order.md`](2026-11-25-delivery-order.md) groups this plan's unbuilt tasks into batches with other plans' tasks and sets the order. It overrides this plan's lines on branches, on one PR per task, and on waiting for a VM check: the owner's VM pass comes once, at the end.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Codex user whose `config.toml` holds unusual but valid TOML, or their own provider table under the id LLM Router uses, can switch a profile on and off and still have a file Codex loads, with every setting and key of theirs in it.

**Architecture:** One statement-level scanner in `packages/core/src/profiles/codex-config-strip.ts` replaces every line pattern that reads or removes part of a Codex config. A statement is a key with all the lines of its value, a table header, a comment or a blank line. On top of it, a provider table counts as LLM Router's only by something LLM Router alone writes (its marker pair or its profile token), and a saved original is treated as the user's file. Six tasks, one commit each, in three PRs: Task 1 in batch 3, Tasks 2 and 3 in batch 6, Tasks 4, 5 and 6 in batch 7 of the delivery order.

**Tech Stack:** TypeScript, `node:test` with `node:assert/strict`, `smol-toml` as a dev dependency in tests only (from the harness plan).

**Spec:** [`docs/superpowers/research/2026-11-22-open-items-validation.md`](../research/2026-11-22-open-items-validation.md), rows S-0 to S-15. Read the S table and X-1, X-3 and X-5 before a task.

**Runs after** [`2026-11-22-backlog-harness.md`](2026-11-22-backlog-harness.md), whose Task 3 supplies the parse helper. Task 1 is the last commit of batch 3, after harness Tasks 1 to 3. **Runs before** the restore tasks that change `packages/core/src/profiles/service.ts` ([`2026-11-22-backlog-restore.md`](2026-11-22-backlog-restore.md)). "Ground shared with the restore plan" below lists what this plan touches there.

**Evidence status.** Rows marked run in the spec were run by the research pass through the real apply and restore paths. No fix in this plan was prototyped, so no size given here is measured. The plan author read every function, type, test and fixture named below at `main` `eb84a3ba`. The fix round re-read them at `c491eb48` and ran, through a throwaway copy of `profile-service.test.mjs` that parsed every `*.toml` file of the Codex directory with Python `tomllib` after each apply and after each test body. It ran the three red cases of Task 1 as written, the three S-8 tests and their mutations, the inputs of B1, B2, C3 and C7 of the audit, and the whole existing integration file. A failing `node:test` test marked `todo` leaves the exit code at 0 on Node 24.22.3 (run). Where a step rests on reading alone it says "read, not run", and it starts with the check that confirms it.

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
- Branches and order are the delivery order's. Each batch starts from `main` after the batch before it has merged, and each task is one commit on the batch's branch.
- No VM check gates a task. A check that needs a real Codex is a line under "VM check, for the end pass" at the end of this plan.
- A PR is green before it merges. A test that is red on purpose is kept as described under "How a red test stays on `main`".
- The repository is public. Describe a change by what the code does.

## How a red test stays on `main`

Task 1 writes the tests for S-1, S-2 and S-6 before any fix exists. Each is first run plain, and its failure is pasted into the PR description. That run is the proof that the parse check catches these inputs. Each is then committed with the `node:test` option `{ todo: "<row>, fixed in Task <n>" }` beside the existing `skip` option. Task 1 also marks one existing test `todo` (B1 of the audit, Task 1 Step 2). A `todo` test runs and reports its failure, and the run still exits 0 (run on Node 24.22.3). A `todo` test that starts passing prints `# TODO` and nothing flags it (run by the audit), so the grep in Task 3 Step 6 is the only check that a `todo` was removed. The task that fixes the row removes the `todo` option as its first step and watches the test fail, then fixes it. After Task 3 no test in the two Codex test files carries `todo`.

## Review Focus

Each line names a condition no single row's test covers. The test that pins it sits in the step named at the end.

1. Any file put through the scanner comes back unchanged when its statements are joined, with LF or CRLF line ends, with no final line end, and with a value left open by a typo. Task 2, Step 1, test `joining the statements of a file gives the file back`.
2. A table header written with spaces, a quoted name or a trailing comment (`[ model_providers . "llm-router" ] # x`) is the same table to every reader and remover. Task 2, Step 1, test `a header is the same table however it is spelled`.
3. A user with their own `[model_providers.llm-router]` table changes the profile's model and applies a second time before restoring. The file still comes back byte for byte, and their key is on disk after each step. Task 4, Step 1, the `reapply` case.
4. A Codex config with CRLF line ends and a root value that spans lines parses after the apply and after an edited restore. Task 3, Step 1, the CRLF case of the S-2 test.
5. A `written.json` record saved before Task 5 has no `modelProviderLine`. A restore with such a record still removes LLM Router's `model_provider` line and puts the user's back. Task 5, Step 1, test `a record with no model_provider line falls back to the provider id`. This line goes if the owner drops the S-7 part of Task 5 ("Open with the owner", question 3).
6. A child table of the user's own provider, such as `[model_providers.llm-router.http_headers]`, is never part of LLM Router's provider while the profile applies, and comes back with its parent. Task 4, Step 1, the first test.

## Rows this plan closes

| Row | Task | Note |
|---|---|---|
| S-0 | none | Context (X-1) |
| S-1 | 2 | Red case written in Task 1 |
| S-2 | 3 | Red case written in Task 1. Task 2 fixes the restore half |
| S-3 | 6 | |
| S-5 | 3 | For consistency only. The mover and the remover take the same tables |
| S-6 | 3 | Red case written in Task 1. Task 2 fixes the strip half |
| S-7 | 5 | Low. No product path reaches the new rule (open question 3) |
| S-8 | 1 | Tests only |
| S-9 | 5 | After S-11, which changes what a snapshot strip removes |
| S-10 | 2 | The put-back line only. Blank lines LLM Router wrote keep their LF |
| S-11 | 4 | |
| S-12 | 3 | Both halves, see "Where this plan departs from the research" |
| S-13 | 4 | The one row with a permanent loss. Task 4 also covers the user's child tables of that provider (B2 of the audit) |
| S-14 | 2 and 3 | `managedConfiguredModel` in Task 2, the other three in Task 3 |
| S-15 | 6 | |

## Where this plan departs from the research

- **The scanner is built on `scanTomlLines`, not in place of it.** `scanTomlLines` already knows which lines start inside a value and already treats a value left open at the end of the file as no value at all. Its two unit tests and that rule stay. After Task 3 it has two callers, `scanTomlStatements` and `firstCodexTableIndex`, both in its own file.
- **The scanner is not replaced by a TOML parser.** A parser rejects a file that does not parse, and LLM Router must still take its token out of a file the user broke: the test `restoring a Codex config with a value the user left open still removes LLMR's provider and token` pins that and passes today (run). A parser that keeps source positions would also be a runtime dependency, where B-4 keeps the parser in tests only.
- **The scanner work is two commits on one branch, split by file.** Task 2 changes every reader in `codex-config-strip.ts`. Task 3 moves the six line helpers out of `service.ts`, rebuilds them on statements and deletes the originals. Each commit passes the suite on its own. Task 3 is the commit that leaves no line-pattern reader, and its last step is the grep that proves it.
- **Both halves of S-12 land in Task 3.** `isManagedCodexConfigContent` is a line-pattern reader too (`includes` and a multiline regex). Leaving it for Task 4 would leave Task 3 with one reader behind. Task 3 moves it onto statements with its rule unchanged. Task 4 then changes the rule.
- **The statement type gains `value` and drops nothing.** Six call sites compare a root key's value with a recorded line, and the scanner already knows where a line's comment starts.
- **S-10 does not use the replaced line's ending.** The line a put-back replaces is LLM Router's, and the writer ends its lines with LF. The put-back line takes the snapshot's line ending instead (`CodexDisplacedConfig.eol`).
- **The provider-table rule is one rule for the live file and for a snapshot.** The research proposed changing `isManagedCodexConfigContent` and the strip's header match together. This plan does that. Four unit fixtures that plant a bare `[model_providers.llm-router]` table as LLM Router's gain a token line (Task 4, Step 3).
- **S-15 is fixed in `backupFilePath`.** `backupContent` and `backupCurrentFile` name their files the same way and overwrite the same way.

## Ground shared with the restore plan

Functions in `packages/core/src/profiles/service.ts` that this plan changes, moves or deletes:

| Function | Task | What happens |
|---|---|---|
| `tomlKey` | 2 | Leaves `service.ts` for `apply-support.ts`, unchanged |
| `removeManagedMarkerLines`, `removeRootTomlKeys`, `rootTomlAssignment`, `removeManagedConfiguredModelLine`, `legacyCodexProfileTableBody`, `removeCodexProfileTable`, `isManagedCodexConfigContent` | 3 | Leave `service.ts`. Their replacements are exported from `codex-config-strip.ts` |
| `buildCodexConfigToml`, `buildSeparateCodexProfileToml`, `managedModelAssignment` | 3 | Call the replacements. The blank-line collapse goes by statement. `buildCodexConfigToml` also removes the child tables of a provider of that id (Task 4) and returns `modelProviderLine` in `written` (Task 5, S-7 part) |
| `returnCodexProfileTable`, `codexProfileFileUsersContent` | 3 | Read by statement |
| `codexManagedContent` | 4 | `stripManagedContent` becomes the snapshot strip |
| `writeGlobalCodexConfig` | 5 | Passes the stripped text to `ensureOriginalSnapshot` |
| `readCodexWrittenRecord` | 5 | Accepts the new optional field |
| `maybeWriteSeparateCodexProfileFile` | 6 | One more condition before the copy |

This plan does not change `restoreGlobalConfigFile`, `restoreGlobalConfigFileContent`, `originalSnapshotCandidate`, `restoreDisabledCodexProfile`, `restoreInactiveGlobalProfileConfigs`, `applyCodexProfile` or any Claude Code function. That is true of their text, not of what they do: Task 4's rule reaches every caller of `isManagedCodexConfigContent` and of `codexManagedContent`'s `stripManagedContent` (both listed in Task 4). Task 1 adds tests that pin three conditions inside `restoreGlobalConfigFileContent` and `writeGlobalCodexConfig`. A restore-plan task that changes one of those conditions on purpose changes its test in the same PR.

In `packages/core/src/profiles/backup-files.ts` this plan changes `ensureOriginalSnapshot` (Task 5) and `backupFilePath` (Task 6), and exports `profileTokenPrefix` (Task 4).

The restore plan's Task 5 puts Workbuddy on the Codex stripper. It consumes `isCodexFamily` from restore Task 4, which follows restore Task 1, so it lands in batch 9 and not in batch 7 beside Tasks 4 to 6 of this plan (read in the restore plan). The delivery index was corrected for it on 2026-11-25.

---

### Task 1: Parse the Codex files the profile tests leave behind, and pin three restore conditions (S-8)

**Merged, 2026-11-25: PR 158, `033c1281`, batch 3.** Three changes from its review, which Tasks 2 and 3 must follow. First, the B1 test, `a moved profile table's own model setting goes whole when its value spans lines`, carries no `todo`. Under `todo` its four assertions, which pass today, protected nothing (run: a `todo` test that fails for any reason exits 0). It passes `{ parseAfter: false }` and pins the known failure with `assert.throws(() => assertCodexFilesParse(codexDir), /llm-router\.config\.toml does not parse as TOML/)`. Second, the fixture's opt-out is `parseAfter: false` and skips only the parse after the test body. The parse after the apply always runs. Third, `tests/architecture/test-todo-markers.test.mjs` pins the exact list of `todo` reasons in the two Codex test files and counts every spelling of the word. So three tests are `todo`, not four, and a task that removes a `todo` removes its entry from that list in the same commit.

First, because every later task proves its output with this check, and because the check has to be seen failing on S-1, S-2 and S-6 before a fix can claim to have turned it green.

No user-visible change. After this PR a Codex test fails when an apply or a restore leaves a `.toml` file that does not parse, and three conditions of PR 138 that had no test have one.

**Files:**
- Modify: `packages/core/test/integration/profiles/profile-service.test.mjs` (`withAppliedDefaultProfiles`, new tests after `plantCodexOriginal`, new tests after `awkwardProfileTables`, one `todo` on an existing test)

**Interfaces:**
- Consumes: `assertCodexFilesParse(codexDir, { allowNone })` from harness Task 3, already imported by its Step 6. Add no second import. By the harness plan's text (read, not built): it parses each file directly inside `codexDir` whose name ends in `.toml`, and never `config.toml.llmr-original` or `config.toml.llmr-backup-*`. It throws an `AssertionError` naming the file and carrying the parser's message. It also throws when the directory is missing or holds no `.toml` file, unless `allowNone: true`, which returns `[]`. If the merged harness task differs, use its name and path and keep these semantics.
- Consumes: the call harness Task 3 Step 6 adds inside the `if (profileIds.includes("default-codex"))` block of `withAppliedDefaultProfiles`. This task puts it under the `options.parse` switch and does not add a second one.
- Produces: `withAppliedDefaultProfiles(profileIds, run, beforeApply, options = {})` with `options.parse` (default `true`). When it is true, the helper calls `assertCodexFilesParse(codexDir)` after `applyProfileConfig(config)` inside the `default-codex` block, and `assertCodexFilesParse(codexDir, { allowNone: true })` after `run` returns, before `cleanUp`. The after-apply call stays inside the block because 19 calls of the helper leave no `.toml` file after the apply, and 38 leave none after `run` (run, with a parse sweep of the whole file).
- Produces: three `todo` tests that Tasks 2 and 3 turn green, named in Step 3, and a `todo` on one existing test, named in Step 2.

The two tasks stay two commits on batch 3's branch. Harness Task 3 adds the dependency, the helper and the after-apply call, and this task adds the switch, the after-run call and the red tests. They could be one commit, but harness Task 3 stands alone and this one does not.

- [ ] **Step 1: Add the switch and the after-run call to `withAppliedDefaultProfiles`** as the Interfaces block says.

- [ ] **Step 2: Run the file and sort what fails.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/integration/profiles/profile-service.test.js`
Expected, from a parse sweep with `tomllib` (run). No test fails after the apply, and two fail after `run`.
  - `restoring a Codex config with a value the user left open still removes LLMR's provider and token` plants a value left open on purpose, so `config.toml` does not parse after `run` ("Unterminated string"). It passes `{ parse: false }` as the fourth argument. The PR lists it with that reason.
  - `a moved profile table's own model setting goes whole when its value spans lines` (B1 of the audit). LLM Router writes `llm-router.config.toml` as `model_provider = "llm-router"\nmodel = [\n# LLMR configured model = "Provider/model"\nkeep = 1\n` from a valid fixture, and it does not parse ("Invalid value (at line 4, column 1)"). The cause is `rootTomlAssignment` in `service.ts`, which returns only the first line of the user's `model`, and `managedModelAssignment`, which keeps that line. The test passes today only because it counts lines that start with `model =`. It is the S-2 fault in the profile file. Add `todo: "S-2 in the profile file, fixed in Task 3"` to its options, beside `skip`. Do not opt it out of the parse check.
Any other test that fails on a file LLM Router wrote from a valid fixture is a finding. Stop and report it, and do not opt it out.

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
      // Without its last line end, which the writer gives as a line feed in its root block.
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

`tripleDouble`, `tripleSingle`, `awkwardProfileTables` and `countOf` are declared near the end of the file today, and `awkwardProfileTables` reads `tripleSingle` when the file loads. Move the four declarations, in that order, above `plantCodexOriginal`. Do not copy them. The test bundle turns them into `var`, so a missed one gives no error, only an `undefined` inside a fixture (audit, run: two existing tests fail).

- [ ] **Step 4: Run the three and record the failures.**

Run: `node build/test.mjs core && node --test --test-name-pattern="comes back whole after an edited restore|survives an apply and comes back whole|is the same key to LLM Router" .test-dist/core/test/integration/profiles/profile-service.test.js`
Expected: all three FAIL, as the fix round ran them with `tomllib`. The first fails at `countOf` for `a nested array` and `a bracket line in a literal string` (count 0, and the restored file does not parse), while the restore reports ok. The second fails at the parse check after the apply ("Unterminated string"), with LF and with CRLF. The third fails at the parse check after the apply ("Cannot overwrite a value"). Paste the three failure messages into the PR description. If one passes, stop. The row it covers does not reproduce, and the plan is wrong about it.

- [ ] **Step 5: Mark the three `todo`.** Add `todo: "S-1, fixed in Task 2"` to the first and `todo: "S-2, fixed in Task 3"` and `todo: "S-6, fixed in Task 3"` to the others, in the same options object as `skip`.

- [ ] **Step 6: Write the three S-8 tests.** The fix round ran each on `main` and under its mutation in Step 7 (run). If a test fails on unchanged `main`, stop and report what `main` did.

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
  const gateway = (url) => ({ ANTHROPIC_API_BASE_URL: url, ANTHROPIC_BASE_URL: url, CLAUDE_AGENT_API_BASE_URL: url });
  withScratchRuntimeHome((settingsFile) => {
    writeFileSync(`${settingsFile}.llmr-original-missing`, "");
    writeFileSync(`${settingsFile}.llmr-backup-2099-01-01T00-00-00-000Z`, `${JSON.stringify({ env: gateway("http://127.0.0.1:9999"), permissions: { allow: ["Bash(ls)"] } }, null, 2)}\n`);
    writeFileSync(settingsFile, `${JSON.stringify({ env: gateway("http://127.0.0.1:3456") }, null, 2)}\n`);
    restoreInactiveGlobalProfileConfigs([{
      agent: "claude-code",
      enabled: true,
      env: {},
      id: "claude-code-2",
      model: "Provider/model",
      name: "Claude Code",
      scope: "llmr",
      settingsFile: "~/.claude/settings.json",
      smallFastModel: "",
      surface: "auto"
    }]);
    assert.equal(existsSync(settingsFile), true);
    assert.deepEqual(JSON.parse(readFileSync(settingsFile, "utf8")).permissions, { allow: ["Bash(ls)"] });
  }, { takeoverBackup: false });
});
```

The three env names are `claudeCodeGatewayEnvKeys`, so the live file is managed and the backup is a takeover copy. The profile object is the one of the neighbouring test. Run on `main`, the file is written back as `{ env: {}, permissions: { allow: ["Bash(ls)"] } }`. Under the third mutation of Step 7 the file is removed (run). A live file of `{ env: { CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: "1" } }`, as the draft had it, is left unchanged with and without the guard, so it pins nothing (run, C2 of the audit).

- [ ] **Step 7: Run the three, then break each condition once.**

Run: the single-file command with `--test-name-pattern="strip leaves unchanged|differs from the saved original|still read as the snapshot"`.
Expected: PASS on unchanged source. Then, one at a time, and each put back after (each run by the fix round on a copy of the compiled bundle):
  - In `restoreGlobalConfigFileContent`, in the block that starts `if (options.stripBeforeSnapshot && current !== undefined && !isAsWritten(`, return `{ changed: false, file, missingBackup: false, restored: false }` right after its `saveConfigSafetyCopy(file, current)` when `stripped === undefined`. The first test fails: the replaced file stays.
  - In `writeGlobalCodexConfig`, change `matchers.stripManagedContent?.(previous) ?? previous` to `matchers.stripManagedContent?.(previous)`. The second test fails: no backup is made.
  - In `findSnapshot`, delete `&& !options.keepLiveFile`. The third test fails: the file is removed.

- [ ] **Step 8: Run the gates.** `npm run test:core`, `npm run typecheck`, `npm run lint`, `npm run test:architecture`. Expected: PASS, with four tests reported as `todo`.

- [ ] **Step 9: Commit.** `test(profiles): parse every Codex file the tests write, and pin three restore conditions`

---

### Task 2: Read a Codex config by statement (S-1, S-10, the strip half of S-6, part of S-14)

**Changed by PR 158.** Step 3 also removes `"S-1, fixed in Task 2"` from the list in `tests/architecture/test-todo-markers.test.mjs`. Without that the architecture suite fails.

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
  - `header` and `key` are normalised paths: each segment is unquoted, then written with `tomlKey`, and segments are joined with `.`. White space around a dot and a trailing comment are dropped. `[ model_providers . "llm-router" ] # x` and `[model_providers.llm-router]` both give `model_providers.llm-router`. `[profiles."b.c"]` gives `profiles."b.c"`. `[[fallbacks]]` gives `fallbacks`, because no caller tells an array of tables from a table.
  - Unquoting drops the quotes of a basic or a literal string and decodes no escape. A key written with an escape, such as `"llm-router"`, is another key to LLM Router. That is a stated limit, not a case to test.
  - A table defined without a header, as `[model_providers]` with `llm-router = { ... }` under it or a root `model_providers.llm-router.name = ...`, has no header statement of that path. The scanner does not treat it as that table (C7 of the audit, "Open with the owner", question 2).
  - `table` is the `header` of the nearest header statement above, `""` before the first. A header with no readable path, such as `[a b]`, gives its own trimmed text as `table`, so the keys under it are never taken for root keys (batch 6 audit).
  - `value` is the first line's text after the `=`, with the comment cut where `scanTomlLine` says it starts, trimmed. For `model  =  "x"  # mine` it is `"x"`.
- Changes: `CodexDisplacedConfig` gains `eol?: "\r\n"`, set only when the snapshot's first statement ends in CRLF. A file whose first line ends in LF and whose later lines end in CRLF gets LF put-backs, which TOML allows. A snapshot with line feeds reads as it does today, so the existing `deepEqual` assertions on it stand. Each root value is the whole statement's text without its last line end.
- Changes: `removeTablesOutsideValues` hands its predicate the normalised path, not the header's text. `removeTomlTable`, `removeCodexProviderTable` and `removeCodexMcpServerTable` keep their signatures and become calls to it. A comment block set off by a blank line above the next header now survives all three, as it already does in the strip.
- Every other export of the file keeps its signature.

- [ ] **Step 1: Write the failing unit tests** in `codex-config-strip.test.mjs`. Add `scanTomlStatements` to the file's import from `@llmr/core/profiles/codex-config-strip.ts`. Put the tests at the end of the file, because they use `usersOriginal` and `afterCodexMcpAdd`, which are declared late (batch 6 audit).

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

The build bundles every core test, so a missing export stops it with `No matching export ... for import "scanTomlStatements"` and no test runs, the integration run of Step 3 included (batch 6 audit, run). First add `export function scanTomlStatements(): never { throw new Error("not built"); }` to `codex-config-strip.ts`. Step 5 replaces it.

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/profiles/codex-config-strip.test.js`
Expected: FAIL. The first two fail with `not built`. The bracket-line test returns `["[profiles.llm-router]\nx = [\n"]`.

- [ ] **Step 3: Remove `todo` from the S-1 test and watch it fail.** Run the single-file integration command with `--test-name-pattern="comes back whole after an edited restore"`. Expected: FAIL, as recorded in Task 1.

- [ ] **Step 4: Move `tomlKey` to `apply-support.ts`.** Export it beside `tomlQuotedKey`. Delete the copy in `service.ts` and import it there.

- [ ] **Step 5: Add `TomlStatement` and `scanTomlStatements`** to `codex-config-strip.ts`, by the rules in the Interfaces block.

- [ ] **Step 6: Rebuild every reader in the file on statements.** One rule each:
  - `removeTablesOutsideValues`: a table is a header statement and every statement after it up to the next header. The comment rule it has today stays. `removeTomlTable` removes the table whose `header` is `` `${section}.${tomlKey(name)}` ``. `removeCodexMcpServerTable` removes `mcp_servers.<name>`, its three named child tables (`env`, `http_headers`, `env_http_headers`), and with `includeChildTables` every header that starts with `mcp_servers.<name>.`.
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

**Changed by PR 158.** The B1 test has no `todo` to remove. Where this task says its `todo` goes, remove its `assert.throws` on the parse and its `{ parseAfter: false }` option, which fail once the profile file parses. Step 2 also removes the S-2 and S-6 entries from `tests/architecture/test-todo-markers.test.mjs`, which leaves that list empty. The grep of Step 6 still holds.

Third, because it migrates the callers Task 2 did not own, and deletes the helpers the scanner replaces.

A user whose `config.toml` has a root `model` that spans lines, or root keys written in quotes, can apply a profile and still have a file Codex loads. Today the apply itself writes an invalid file in both cases (run). The same holds for a `model` that spans lines in a profile table moved into the profile file (B1, run). A run of blank lines inside one of the user's multi-line strings is no longer shortened (C3 of the audit, run). Today `a\n\n\n\nb` in a `"""` string comes out as `a\n\n\nb` and stays so after an edited restore. A marker line that is only text inside one of the user's strings no longer makes LLM Router take the file for its own, so the original is saved and the restore runs.

**Files:**
- Modify: `packages/core/src/profiles/codex-config-strip.ts`, `packages/core/src/profiles/service.ts`
- Test: `packages/core/test/unit/profiles/codex-config-strip.test.mjs`, `packages/core/test/integration/profiles/profile-service.test.mjs`

**Interfaces:**
- Consumes: `TomlStatement`, `scanTomlStatements`, `removeTomlTable` and `tomlKey` from Task 2. The `todo` tests for S-2 and S-6, and the `todo` on the B1 test, from Task 1.
- Produces, all exported from `codex-config-strip.ts`, each replacing the `service.ts` function of the same or the noted name, which is deleted:

```ts
export function rootTomlAssignment(source: string, key: string): string | undefined;
export function removeRootTomlKeys(source: string, keys: string[]): string;
export function removeManagedMarkerLines(source: string): string;
export function removeManagedConfiguredModelLine(source: string): string;
export function codexProfileTableBody(source: string, providerId: string): string;
export function isManagedCodexConfigContent(content: string, providerId: string): boolean;
export function collapseBlankStatements(content: string): string;
```

  - `rootTomlAssignment` returns the whole root statement with that `key`, every line of its value, without leading white space and without its last line end.
  - `removeRootTomlKeys` removes every root statement whose `key` is in `keys`.
  - `removeManagedMarkerLines` removes each comment statement whose trimmed text is in `codexManagedMarkers`, and every blank statement directly above or below one, as the regex does today (its `^\s*` and trailing `\s*` take those lines). Without the blank lines, an apply over a file LLM Router wrote adds a blank line above its provider block, and `a Codex config saved with Windows line endings after LLMR wrote it stays loadable through the next apply and a restore` fails at "four more applies leave the file as the first one did" (batch 6 audit, run). It takes no marker list: it had one caller and one list.
  - `removeManagedConfiguredModelLine` removes each root comment statement that starts with `managedConfiguredModelPrefix`.
  - `codexProfileTableBody` replaces `legacyCodexProfileTableBody`. It takes the body statements of every table whose `header` is `` `profiles.${tomlKey(providerId)}` ``, in file order, takes their lines, drops each line's own line end without a `split`, joins the lines with a line feed and trims the result, as `legacyCodexProfileTableBody` does today for one table. `removeTomlTable` already removes every one, so the mover and the remover take the same tables (S-5).
  - `collapseBlankStatements` drops a blank statement when the two statements before it are blank too, so a run of blank lines outside a value is two at most, which is what the `\n{4,}` replace gives today. Unlike that replace it also shortens a run of CRLF blank lines and of lines that hold only spaces (batch 6 audit, inferred). A line inside a value is never a blank statement, so a string keeps its lines. It replaces `.replace(/\n{4,}/g, "\n\n\n")` in `buildCodexConfigToml` and `buildSeparateCodexProfileToml`.
  - `isManagedCodexConfigContent` keeps its rule and loses its patterns: true when a comment statement is `managedRootStart` or `managedProviderStart`, or a header statement is `` `model_providers.${tomlKey(providerId)}` ``. Task 4 changes the rule.
- Changes in `service.ts`: `managedModelAssignment` keeps its rule. With the user's `model` statement whole from `rootTomlAssignment`, a moved table's `model` that spans lines is kept whole while the configured model is unchanged, as a one-line `model` is today. `removeCodexProfileTable` is deleted and its one caller calls `removeTomlTable(content, "profiles", providerId)`. `returnCodexProfileTable` tests for the header with statements and compares settings as statement texts. `codexProfileFileUsersContent` drops the first root statement with `key === "show_all_sessions"` and `value === "true"`, not a line that reads so.
- After this task `service.ts` imports neither `scanTomlLines` nor `escapeRegExp`, and it drops `tomlQuotedKey` and `codexManagedMarkers` from its imports, which lint otherwise reports as unused (batch 6 audit).
- Four behaviours change with the move to statements and no test pins them. State each in the PR (batch 6 audit, read): `rootTomlAssignment` keeps white space at the end of the statement's last line; `managedConfiguredModel` reads its comment only in the root, where it read it anywhere; `returnCodexProfileTable` no longer counts a moved table with a multi-line value as left behind every time, so that case stops making a safety copy on each apply; `codexProfileFileUsersContent` drops only a root `show_all_sessions = true`, where the pattern dropped the first such line anywhere.

- [ ] **Step 1: Write the failing tests.**

In `codex-config-strip.test.mjs`, add to the import `rootTomlAssignment`, `removeRootTomlKeys`, `removeManagedMarkerLines`, `removeManagedConfiguredModelLine`, `managedConfiguredModel`, `isManagedCodexConfigContent`, `codexProfileTableBody` and `collapseBlankStatements`, whichever the file does not import yet (batch 6 audit). Then:

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

test("collapseBlankStatements shortens a run of blank lines outside a value and leaves a string alone", () => {
  const notes = "notes = \"\"\"\na\n\n\n\n\nb\n\"\"\"\n";
  assert.equal(collapseBlankStatements(`a = 1\n\n\n\n\n${notes}`), `a = 1\n\n\n${notes}`);
});
```

In `profile-service.test.mjs`, rewrite the B1 test. Its name becomes `a moved profile table's own model setting that spans lines comes into the profile file whole`, and its `todo` goes. After the apply `countOf(profile, "model = [\n  \"not-a-model\",\n]")` is 1, the number of its lines that match `/^model\s*=/` is 1 (a `countOf` of `model =` gives 2, because the configured-model comment holds that text: batch 6 audit, run), `keep = 1` is a line of it, and the parse check passes. It pins the rule of `managedModelAssignment`, which keeps the user's `model` while the configured model is unchanged.

In `profile-service.test.mjs`, after the S-6 test, beside the marker test below:

```js
test("a run of blank lines inside one of the user's strings is kept by an apply and an edited restore", ..., async () => {
  const notes = `notes = ${tripleDouble}\na\n\n\n\nb\n${tripleDouble}`;
  await withAppliedDefaultProfiles(["default-codex"], async (fixture) => {
    assert.equal(countOf(readFileSync(fixture.codexConfigFile, "utf8"), notes), 1);
    appendUserCodexTables(fixture);
    await recoverGlobalAgentProfile("default-codex");
    assert.equal(countOf(readFileSync(fixture.codexConfigFile, "utf8"), notes), 1);
  }, plantCodexOriginal(`model_provider = "openai"\n${notes}\n`));
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

- [ ] **Step 2: Remove `todo` from the S-2 and S-6 tests.** As in Task 2 Step 2, the build stops on a missing export, so first add one throwing stub per new export of the Interfaces block. Step 3 replaces them (batch 6 audit, run). Run the unit file and, in the integration file, `--test-name-pattern="survives an apply and comes back whole|is the same key to LLM Router|does not make their Codex config|comes into the profile file whole|blank lines inside one of the user's strings"`. Expected: the unit tests fail with `not built`. The S-2 and S-6 tests fail as recorded in Task 1. The marker test fails at the `.llmr-original` read (the audit ran its input: no original is saved). The B1 test fails at its `countOf` of the array. The blank-line test fails at its first `countOf` (run on that input).

- [ ] **Step 3: Add the seven functions** to `codex-config-strip.ts` by the Interfaces block, and export them.

- [ ] **Step 4: Migrate `service.ts` and delete the originals.** `buildCodexConfigToml`, `buildSeparateCodexProfileToml`, `managedModelAssignment`, `maybeWriteSeparateCodexProfileFile`, `returnCodexProfileTable` and `codexProfileFileUsersContent` call the exports. `buildCodexConfigToml` and `buildSeparateCodexProfileToml` call `collapseBlankStatements` in place of their `\n{4,}` replace. Delete `removeRootTomlKeys`, `rootTomlAssignment`, `removeManagedConfiguredModelLine`, `removeCodexProfileTable`, `legacyCodexProfileTableBody`, `removeManagedMarkerLines` and `isManagedCodexConfigContent` from `service.ts`. `decideCodexRootLines` already takes its lines as text, so a `currentModelLine` of several lines needs no change there: the root block is joined with line feeds and the user's statement goes in as it is.

- [ ] **Step 5: Change the first S-8 test from Task 1.** Its replaced file, a provider header inside a string, is now the user's file and not a managed one. The restore leaves it alone. The test is renamed `a Codex config the user replaced, with LLMR's header only as text in a string, is left as they wrote it`, and its assertions become: the file equals `replaced`, and `safetyCopies` is empty. By reading, the restore now takes the unmanaged branch, the strip finds nothing of LLM Router's and returns `undefined`, and the result is unchanged and not restored. A run of that same return value (the first mutation of Task 1 Step 7) reported ok with the message `Codex profile is disabled. LLMR found nothing to restore in <file> and left it unchanged.`, so expect that, inferred. The test does not assert the status. Record it in the PR. Say in the PR that the fall-through to the snapshot it pinned can no longer be reached for Codex, because a managed file always holds a statement the strip removes (inferred). Do not delete the branch, which the restore plan owns.

- [ ] **Step 6: Run the tests.** The unit file passes. The three integration tests pass. Then `npm run test:core`. No test in either Codex test file carries `todo`:

Run: `grep -n "todo:" packages/core/test/integration/profiles/profile-service.test.mjs packages/core/test/unit/profiles/codex-config-strip.test.mjs`
Expected: no output.

- [ ] **Step 7: Prove no line-pattern reader is left.**

Run: `grep -nE "scanTomlLines|escapeRegExp" packages/core/src/profiles/service.ts`
Expected: no output.

Run: `grep -n "scanTomlLines(" packages/core/src/profiles/codex-config-strip.ts`
Expected: three lines, the definition and the calls in `scanTomlStatements` and `firstCodexTableIndex`.

Run: `grep -nE "new RegExp|\.split\(|\.replace\(/|\.test\(|\.exec\(|\.match\(|/\^" packages/core/src/profiles/codex-config-strip.ts`
Expected: only these survivors, each named in the PR. The split inside `scanTomlLines`. `firstCodexTableIndex`'s `/^\s*\[/gm` and its `exec` loop, which skip a match that starts inside a value. The strip's trailing `.replace(/\n{2,}$/, "\n")`, which acts on the end of the file only. The scanner's own tests on one header's brackets or on one key segment, inside `scanTomlStatements` and its helpers: they read a single header or segment and never a file (batch 6 audit, where the build had three). `escapeRegExp`'s own `replace` if it still has a caller, and delete `escapeRegExp` if it has none (the audit's build left it none). Any other hit is a line-pattern reader left behind.

Run: `grep -nF '\n{4,}' packages/core/src/profiles/service.ts`
Expected: no output. Then read `returnCodexProfileTable` and `codexProfileFileUsersContent` once more: neither holds a regex or a split. `trimLeadingBlankLines` in `apply-support.ts` stays: it acts on the start of the text only, where no value can be open.

- [ ] **Step 8: Break it three times.** Make `rootTomlAssignment` return only the statement's first line and confirm the S-2 test fails at the parse check and the B1 test at its `countOf` of the array. Make `isManagedCodexConfigContent` test with `content.includes(managedRootStart)` and confirm the marker test fails. Put the `\n{4,}` replace back in `buildCodexConfigToml` and confirm the blank-line test fails. Put all three back.

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

**Child tables (B2 of the audit, run).** Today the writer removes only the `[model_providers.<id>]` header's table. A user's `[model_providers.llm-router.http_headers]` stays in the live file right above LLM Router's provider table, so while the profile applies Codex sends the user's header values to LLM Router's gateway. After the restore only the child table is left, and the user's parent table and key are in no file. LLM Router writes no child table of its provider (read in `buildCodexConfigToml`), so every `model_providers.<id>.<name>` table is the user's. After this task the writer removes each table whose path is `model_providers.<id>` or starts with `model_providers.<id>.`, and the displaced provider tables a restore puts back are read the same way.

**Files:**
- Modify: `packages/core/src/profiles/codex-config-strip.ts`, `packages/core/src/profiles/backup-files.ts`, `packages/core/src/profiles/service.ts` (`codexManagedContent`)
- Test: `packages/core/test/integration/profiles/profile-service.test.mjs`, `packages/core/test/unit/profiles/codex-config-strip.test.mjs`

**Interfaces:**
- Consumes: `scanTomlStatements`, `isManagedCodexConfigContent` and the parse check from Tasks 1 to 3.
- Produces, in `backup-files.ts`: `export const profileTokenPrefix = "llmr-profile-";`. `profileTokenPattern` is built from it and stays private.
- Produces, in `codex-config-strip.ts`: `export function stripCodexSnapshotContent(content: string, providerIds: string[]): string | undefined`. It is `stripManagedCodexConfigContent(content, providerIds)` with one difference: a root `model_provider` line is never removed.
- Changes: `stripManagedCodexConfigContent` and `isManagedCodexConfigContent` use the rule above for a provider table. ToolHub and Context Archive tables are still removed by name, because those names are LLM Router's own.
- Changes: `buildCodexConfigToml` calls `removeTablesOutsideValues` with a predicate that is true for a header equal to `model_providers.<tomlKey(providerId)>` or starting with that path and a dot, in place of `removeCodexProviderTable`.
- Changes: `CodexDisplacedConfig` gains `providerTables?: string[]`. `readCodexDisplacedConfig` fills it with each table of the snapshot whose path is `model_providers.<id>` or starts with `model_providers.<id>.`, read the way `profileTables` are. A strip appends each displaced provider table whose header path is not left in its result, exactly as it does for a profile table.
- Changes: in `codexManagedContent`, `stripManagedContent` becomes `(content) => stripCodexSnapshotContent(content, providerIds)`. `stripLiveContent` is unchanged. That matcher has five uses, and each now keeps a `model_provider` line (read). `originalSnapshotCandidate` strips a non-managed snapshot with it, and with no original it skips a backup it changes. `saveNewestUserBackupCopy` keeps a backup it leaves something in. `writeGlobalCodexConfig` uses it as `kept` for a previous file that is not managed and, with no original, as the snapshot's skip test. Each of them reads a backup or a file LLM Router does not take for its own, which is the user's file under this task's rule, so keeping their `model_provider` line is intended. A backup made while LLM Router had the file still holds LLM Router's marked provider table, so with no original it is still changed by the strip and still skipped (inferred).
- Changes, with no edit of their text: every caller of `isManagedCodexConfigContent` (read). `applyCodexProfile` uses it for `sourceManaged`, which sets `managedWithoutRecord` and the record's `edited`, and for the `isManagedContent` of `writeFileWithBackup` on a Workbuddy or a generated-scope Codex file, which steers backup pruning. The Workbuddy loop of `restoreInactiveGlobalProfileConfigs` uses it to choose a snapshot. A Workbuddy file always gets an original at its first write, because `writeFileWithBackup` calls `ensureOriginalSnapshot` whatever the content (read). So the effect on Workbuddy is at the restore: an original that holds the user's own provider table is skipped as managed today and is accepted after this task (inferred, not run). State it in the PR. Restore Task 5 rebuilds the Workbuddy restore on the Codex stripper later.
- Produces, in the test file: `withAppliedDefaultProfiles` takes `options.configure?: (config) => void`, called on the config before `beforeApply`.

- [ ] **Step 1: Write the failing integration tests.** The first is the most exact test of the plan. Do not weaken an assertion in it to make it pass.

```js
const usersProviderKey = "my-own-secret";
const usersHeaderValue = "my-own-header-value";
const usersProviderOriginal = [
  "model_provider = \"llm-router\"",
  "",
  "[model_providers.llm-router]",
  "name = \"Mine\"",
  "base_url = \"https://mine.example.test/v1\"",
  `experimental_bearer_token = "${usersProviderKey}"`,
  "",
  "[model_providers.llm-router.http_headers]",
  `X-Mine = "${usersHeaderValue}"`,
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
      assert.equal(applied.includes("[model_providers.llm-router.http_headers]"), false, "the user's child table is not attached to LLM Router's provider");
      assert.deepEqual(filesHolding(fixture.codexDir, usersProviderKey), [original]);
      assert.deepEqual(filesHolding(fixture.codexDir, usersHeaderValue), [original]);
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

- [ ] **Step 4: Run and watch them fail.** Unit file, then the integration file with `--test-name-pattern="own provider table|also uses"`. Expected: the first integration test fails at reading `config.toml.llmr-original`, which does not exist (run on this input with the child table). The third fails at `assertHoldsEveryLine` for `model_provider = "openai"` (the audit ran S-11).

- [ ] **Step 5: Export `profileTokenPrefix`** from `backup-files.ts` and build `profileTokenPattern` from it.

- [ ] **Step 6: Apply the rule** in `isManagedCodexConfigContent` and in the strip's provider-table predicate, through one shared private function in `codex-config-strip.ts`, so the two cannot disagree. Add `stripCodexSnapshotContent` and `providerTables`. Point `codexManagedContent` at the snapshot strip.

- [ ] **Step 7: Run the tests.** The new ones pass. `restoring a Codex config whose LLMR markers were deleted by hand still removes LLMR's provider` still passes: that file keeps LLM Router's token. Then `npm run test:core`. An integration fixture that plants a bare table of that name as LLM Router's gets the token line too, and the PR lists each one.

- [ ] **Step 8: Break it four times.** Make the rule match by header name alone and confirm the first integration test fails. Make `stripCodexSnapshotContent` remove the `model_provider` line and confirm the first and third fail. Drop `providerTables` from the strip and confirm the second fails. Make the writer remove only the parent table and confirm the first fails at the child-table assertion. Put all four back.

- [ ] **Step 9: State the limits in the PR, run the gates, commit.** Limits, each inferred from the rule. A live file where someone removed LLM Router's marker and changed its token keeps that table after a restore, because nothing in it is LLM Router's any more. A table of the user's with no marker and no LLM Router token is the user's, by design. A profile token the user copied by hand into their own table of that id makes the table LLM Router's, so the snapshot strip drops it from the saved original, and that key is revoked at restore anyway. A child table the user adds to LLM Router's provider while the profile applies stays after a restore, with no parent. A displaced provider table comes back at the end of an edited file, not where it was. The effect on Workbuddy named in the Interfaces block. Then `npm run typecheck`, `npm run lint`, `npm run test:architecture`, and `fix(profiles): keep a user's own Codex provider table and model_provider line` Then `npm run typecheck`, `npm run lint`, `npm run test:architecture`, and `fix(profiles): keep a user's own Codex provider table and model_provider line`

---

### Task 5: Keep no profile token in a saved original, and remove only the `model_provider` line LLM Router wrote (S-9, S-7)

Fifth, because the first snapshot is written through Task 4's snapshot strip. Written through today's strip, it would lose the user's `model_provider` line (S-11).

A `config.toml` that LLM Router does not take for its own, but that still holds a ToolHub table from an earlier takeover, is saved as the original today with the old profile token in it, and that copy outlives the restore. After this task the original is saved without LLM Router's content. A `model_provider` line left from another provider id is removed only when it is the line LLM Router recorded writing.

**The S-7 part reaches no product path.** `codexManagedContent` hands the record to `stripLiveContent` only when the live content tests managed, and the S-7 input (a leftover `model_provider` line, no markers, no table) does not (read in `codexManagedContent`). The spec says no product path produced the input. So on the real restore path the old rule stays, and only the unit tests change. "Open with the owner", question 3, asks whether to drop it. Until he answers it is built, and the PR says it reaches only the unit tests. The S-7 part is marked below. Dropping it removes those lines and Review Focus 5.

**Files:**
- Modify: `packages/core/src/profiles/backup-files.ts` (`ensureOriginalSnapshot`), `packages/core/src/profiles/service.ts` (`writeGlobalCodexConfig`, `buildCodexConfigToml`, `readCodexWrittenRecord`), `packages/core/src/profiles/codex-config-strip.ts` (`CodexWrittenRecord`, `CodexWrittenLines`, the strip)
- Test: `packages/core/test/unit/profiles/backup-files.test.mjs`, `packages/core/test/unit/profiles/codex-config-strip.test.mjs`, `packages/core/test/integration/profiles/profile-service.test.mjs`

**Interfaces:**
- Consumes: `stripCodexSnapshotContent` through `matchers.stripManagedContent`, from Task 4.
- Changes: `ensureOriginalSnapshot(file: string, previous: string | undefined, mode?: number, content?: string): void`. With `content`, the original is written with that text. Without it, the file is copied as today. Every other caller passes three arguments and is unchanged.
- Changes, S-7 part: `CodexWrittenRecord` gains `modelProviderLine?: string`, and `CodexWrittenLines` picks it too. `buildCodexConfigToml` returns it in `written` as the `model_provider` line it wrote. `readCodexWrittenRecord` accepts it as an optional line.
- Changes, S-7 part: in a strip with `written.modelProviderLine` set, a root `model_provider` line is LLM Router's when `sameRootAssignment` matches it against that line. With no such field the test is today's, the provider ids. `stripCodexSnapshotContent` is unaffected.

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

In `codex-config-strip.test.mjs`, S-7 part:

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

S-7 part. Extend the existing test `an apply records which Codex lines LLMR wrote, and every restore outcome clears the record` with `assert.equal(record.modelProviderLine, "model_provider = \"llm-router\"", name);`.

- [ ] **Step 2: Run and watch them fail.** Expected: the `backup-files` test reads `raw\n`. The first strip test returns `undefined` for its first assertion. The integration test finds the token in `config.toml.llmr-original`. The fallback test passes today and is there to fail under a wrong build.

- [ ] **Step 3: Add the fourth parameter to `ensureOriginalSnapshot`** and pass it from `writeGlobalCodexConfig` as `previous === undefined ? undefined : matchers.stripManagedContent?.(previous) ?? previous`. A file the strip does not change is written as it is, so Task 4's byte-for-byte test still holds.

- [ ] **Step 4, S-7 part: Record and use `modelProviderLine`** as the Interfaces block says.

- [ ] **Step 5: Run the tests.** The new ones pass. Task 4's three integration tests still pass. Then `npm run test:core`.

- [ ] **Step 6: Break it twice.** Pass no fourth argument in `writeGlobalCodexConfig` and confirm the integration test fails. S-7 part: ignore `written.modelProviderLine` in the strip and confirm the first strip test fails. Put both back.

- [ ] **Step 7: Run the gates and commit.** `npm run typecheck`, `npm run lint`, `npm run test:architecture`. Then `fix(profiles): keep no profile token in a saved Codex original, and remove only the model_provider line LLMR wrote`

---

### Task 6: Keep the copy of a user's first profile settings, and never overwrite a copy (S-3, S-15)

Last, because it depends on nothing above and concerns a legacy table (X-1) and a collision nobody has observed.

A user whose script re-adds the same `[profiles.<id>]` table to `config.toml` before every apply loses the only copy of the settings they first had in the profile file, after the fourth apply. After this task a table equal to what the profile file already holds makes no new copy. Two copies or backups of one file made in the same millisecond get two names.

**Files:**
- Modify: `packages/core/src/profiles/service.ts` (`maybeWriteSeparateCodexProfileFile`), `packages/core/src/profiles/backup-files.ts` (`backupFilePath`)
- Test: `packages/core/test/integration/profiles/profile-service.test.mjs`, `packages/core/test/unit/profiles/backup-files.test.mjs`

**Interfaces:**
- Changes: `maybeWriteSeparateCodexProfileFile` saves a copy only when the user's content of the existing profile file is not empty and differs from the user's content of the file it is about to write. Both go through `codexProfileFileUsersContent`. Comparing with `moved` itself would still copy on every apply when the moved table holds a `model` key, because the writer puts `model` first (inferred from `buildSeparateCodexProfileToml`, Note 3 of the audit).
- Changes: `backupFilePath(file: string): string` returns a path that does not exist. When the timestamped name is taken it appends `-1`, then `-2`, and so on. `backupFiles` matches by prefix and sorts by name, so a suffixed name is found and sorts after the plain one.

- [ ] **Step 1: Write the failing tests.**

In `profile-service.test.mjs`:

```js
test("a profile table added again and again does not push out the copy of the user's first profile settings", ..., async () => {
  for (const table of ["sandbox_mode = \"read-only\"\n", "sandbox_mode = \"read-only\"\nmodel = \"gpt-mine\"\n"]) {
    await withAppliedDefaultProfiles(["default-codex"], async ({ codexConfigFile, codexDir, config }) => {
      const profileFile = path.join(codexDir, "llm-router.config.toml");
      writeFileSync(profileFile, `${readFileSync(profileFile, "utf8")}approval_policy = "never"  # S0 mine\n`);
      for (let round = 0; round < 4; round += 1) {
        writeFileSync(codexConfigFile, `${readFileSync(codexConfigFile, "utf8")}\n[profiles.llm-router]\n${table}`);
        await applyProfileConfig(config);
      }
      const copies = safetyCopies(profileFile);
      assert.equal(copies.length, 1, table);
      assert.match(readFileSync(copies[0], "utf8"), /# S0 mine/, table);
    });
  }
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

- [ ] **Step 3: Add the condition** in `maybeWriteSeparateCodexProfileFile`. Build `next` before the copy. Read `codexProfileFileUsersContent(existing, values.providerId)` once, and copy only when `moved` is not empty, that content is not empty, and it is not equal to `codexProfileFileUsersContent(next, values.providerId)`.

- [ ] **Step 4: Make `backupFilePath` return a free name**, with `existsSync`.

- [ ] **Step 5: Run the tests.** Both pass. `backupFilePath names a timestamped backup beside the file` and `a profile table the user adds to a Codex config replaces their settings in LLMR's profile file whole, and the earlier ones are kept as a copy` still pass. Then `npm run test:core`.

- [ ] **Step 6: Run the gates and commit.** `npm run typecheck`, `npm run lint`, `npm run test:architecture`. Then `fix(profiles): keep the copy of a user's first profile settings, and never overwrite a copy`

---

## Not planned here

- **`config.toml.llmr-original` stays beside the file after a successful Codex restore** (run by the research pass). After Task 5 it holds no profile token. Whether it should go is a restore question and is left to the restore plan.
- **Blank lines LLM Router wrote into a CRLF file keep their LF** after a restore. TOML allows mixed line ends, and S-10 as recorded is the put-back line.
- **A file that starts with a byte-order mark.** The audit ran one: the apply moves the mark into the middle of the file, and `tomllib` rejects the result, but it also rejects the original. What Codex does with a mark was not checked. The scanner does nothing special with it.
- **A provider table defined without a header** (C7 of the audit, run). "Open with the owner", question 2.

## Open with the owner

**1. Should an apply refuse a Codex profile whose provider id is `openai`, `ollama` or `lmstudio`?**

X-3 says Codex reserves those ids and does not let a config override them. If that holds, LLM Router's `[model_providers.openai]` table has no effect, and a profile with that id sends Codex to the built-in provider while LLM Router reports the profile as applied (inferred from X-3, which was read through a summarising fetch, and not run against Codex). Nothing in the S table depends on the answer. Task 4 keeps the user's own `model_provider` line whichever way this goes.

- (a) Refuse. `applyCodexProfile` returns a status that is not ok and names the three ids, and the profile editor rejects them. Recommended. It rests on X-3, and the run against a real Codex is a line of the end pass, not a gate.
- (b) Leave it and say so in the docs page for Codex profiles.
- (c) Do nothing until someone reports it. No UI path sets the id to a reserved one by default. The default is `llm-router`.

No task of this plan waits on it. If the owner picks (a), it becomes Task 7.

**2. Should a provider table defined without a header count as that table?** (C7 of the audit.) An original of `[model_providers]` with `llm-router = { ... }` under it, or a root `model_providers.llm-router.name = "Mine"`, defines the provider table with no header. Today the apply writes a second `[model_providers.llm-router]` beside it, and the file does not parse: "Cannot declare ('model_providers', 'llm-router') twice" (run, both forms). The scanner as written goes by headers, so Tasks 2 to 4 do not change this.

- (a) State the limit in Task 4's PR, and do nothing else. Recommended. No report or test names this form (inferred), and an edited restore would need a way to put a root or a `[model_providers]` statement back in place, which this plan does not have.
- (b) Treat a statement whose `key` path is `model_providers.<id>` or starts with it, in the root or under `[model_providers]`, as that provider. The writer removes it, the original keeps it, and an unedited restore brings it back byte for byte. An edited restore would lose it from the live file. One more commit in batch 7, about 30 lines of source and 30 of test (inferred).

**3. Should Task 5 drop its S-7 part?** It adds `modelProviderLine` to the record and a rule to the strip, but the real restore path passes the record only for a live file that tests managed, and the S-7 input does not (read). The spec says no product path produced the input. Recommended: drop it. That removes about 15 lines of source and 20 of test from Task 5, the field in `written.json`, and Review Focus 5. Built as written until he answers.

## VM check, for the end pass

- Run a real Codex with a profile whose provider id is `openai`, and see whether it uses LLM Router's `[model_providers.openai]` table or its built-in provider (question 1, X-3).
- Run a real Codex on a `config.toml` that LLM Router wrote over each Review Focus input, and see that it loads the file and the user's settings in it.
