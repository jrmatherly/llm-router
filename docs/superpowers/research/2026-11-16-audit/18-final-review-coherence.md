# Final review: program-wide coherence

Unedited report from one read-only pass on 2026-11-16, at commit `136ad730`. It is input to [the audit remediation spec](../../specs/2026-11-16-audit-remediation.md), not a decision record. Its confirmed findings were applied to the plans before they were committed. Paths under `<session scratchpad>` no longer exist.

---

Goal: the finished audit-remediation plans validated once more before commit. Lens: program-wide coherence. All paths are under `docs/superpowers/` (`specs/2026-11-16-audit-remediation.md`, `plans/2026-11-16-audit-*.md`).

**Verdict.** The program is coherent (no orphan finding, no cycle, no decision violated), but six cross-plan gaps will cause rework and the index owner list is incomplete.

## Findings

1. **structure plan, ST-4 Step 6 and ST-5 Step 6 | causes rework.** Step 3 of each edits `packages/core/test/integration/profiles/profile-service.test.mjs` (moves the `resolveGrokSourceHome` / `resolveKimiSourceHome` import), but the Files blocks omit the file and the commit steps stage only two source files. The pushed commit keeps a test importing a name `service.ts` no longer exports. The gate (typecheck, architecture) does not see `.mjs` tests, so CI goes red. Evidence: structure.md:647, :669, :724, :748; importer at `profile-service.test.mjs:13`. Fix: add the test file to both Files blocks and both `git add` lines, and add ST-4, ST-5 to the index row for that file.

2. **electron plan Task 8 (line 523), desktop plan DH-1 owner step (line 56), index line 132 | causes rework.** Both tell the owner to check Windows "on the draft release, before it is published" or "before the release goes out". RS-2's `publish` job runs automatically once `upload-macos`, `windows`, `linux` finish (release-safety.md:508-532), and electron.md:26 says no workflow packages Windows before a release. There is no pause. Fix, owner's choice: (a) give `publish` an environment with a required reviewer, added to RS-2 and RS-5; or (b) reword both to "check the published release; if it fails, run `gh release edit vX.Y.Z --draft`" (flag confirmed with `gh release edit --help`).

3. **desktop plan DH-2 Task 1 Step 1 | blocks execution before 2026-11-22.** `npm install --save-dev tldts@^7.5.4`. `npm view tldts time` gives 7.5.4 published 2026-11-15, and `npm config get min-release-age` is 7. No older version satisfies the range. The plan and the index owner list are silent. Fix: use `tldts@^7.5.0` (7.5.0 published 2026-11-12, eligible 11-19) or add the override to DH-2 owner steps and index line 124.

4. **structure plan ST-1 and ST-2 versus tooling.md:40 | causes rework.** The index lets TL-1 and ST-1 be open together. If TL-1 lands first, `npm run lint` is in the commit gate and Biome reads the new 7,300-line `.runtime.cjs`. The structure plan never mentions Biome (grep returns nothing). The tooling plan's "by fixes" option breaks ST-1's byte-identical gate. Fix: add to structure "Specific to this plan": "If TL-1 has merged, add `!packages/core/src/agents/codex/*.runtime.cjs` to `files.includes` in `biome.json` in ST-1. Do not edit the script to satisfy lint." Add the same to the index cross-plan notes.

5. **core-gateway plan CG-9 Task 2 Step 2 (line 1414), desktop plan DH-1 Task 7 and DH-3 Task 4 Step 4 | causes rework.** These run `npm run dev:electron` with the real home (`build/dev.mjs` sets no `HOME`). electron.md:49 forbids exactly that. CG-9 also needs the proxy CA trusted in the system store and a real LLMR key, yet says "Owner steps: None". Fix: mark CG-9 Task 2 Step 2 an owner step in the plan and the index, and prefix the DH launches with `HOME="$T" LLMR_INTERNAL_HOME_DIR="$T"` as EU Task 5 Step 3 does.

6. **index, "Steps only the owner can do" | minor, several omissions.** Missing: release notes for UL-2 (leftovers.md:592), CG-9 (core-gateway.md:1436) and EU-2 Step 7 (macOS 13); only UL-1 is listed. Missing: "run the first two commands of RS-5 step 5 before RS-2 Task 2.3 and before the release the index says to cut after RS-3" (release-safety.md:563, :905). Missing: EU-1 Windows and Linux packaging (electron.md:69), item 3 above, RS-1 outcome C triage. HP-2 (D-2) and CG-6 (D-11, custom marketplaces lose entries) have no release-note text at all.

7. **core-gateway plan CG-2 versus spec F-C2 | minor, narrower than the spec.** F-C2 says captured bodies are readable through `network_capture_get` with only a gateway key. CG-2 leaves that as is (grep for `network_capture` in the plan returns nothing), and with capture on every host is still decrypted (:277). After CG-9 every proxied tool holds a gateway key. Fix: one Known-limits line in the plan and one Deferred bullet in the spec, or a decision.

8. **Stale or mismatched text | minor.**
   - core-gateway.md:5 and :7 say "F-C2 to F-C12" and "F-C1 waits on the owner's design decision". D-12 decided it and CG-9 fixes it.
   - hygiene.md:434 says "the spec's 201 is off by four". The spec already says `README.md:205`.
   - ST-3 size is S in structure.md:492 and M in the index.
   - RS-3 says "Land after RS-2" (release-safety.md:618). The index lists only RS-1.
   - RS-5 step 1 needs RS-4. The index lists RS-1, RS-2.
   - CG-7 is titled "Persist the rotated token" in the plan and index, but keeps it in memory only (:82, :1165).
   - All eight plans say their Global Constraints are copied from the spec (desktop says "verbatim"), but omit the spec's `min-release-age` bullet and the wire-test exception to the ai-gateway rule.

9. **release-safety plan RS-5 step 1 | minor.** Dependabot goes on after RS-4 (wave 1). `.github/dependabot.yml` groups `"*"` with no `ignore`, so the first grouped PR will include Electron, better-sqlite3 and the majors the spec defers. Fix: run step 1 after EU-2, or add a major-version ignore.

10. **index conflict table, rebuilt from Files blocks | minor.** Missing rows: `tests/architecture/ui-build-contract.test.mjs` (DH-1, TL-1), and TL-1 on `layout.test.tsx`. Everything else matches.

## Unverified suspicions
- Biome 2.6.6 accepts a second `!` entry for a `.cjs` glob as in item 4. Check: `npx biome lint` after the edit.
- Dependabot `ignore` with `update-types` syntax for item 9. Check: GitHub's dependabot options reference.
- esbuild fails the test bundle on a missing named export (item 1). RS-3 Step 2 assumes the same. Check: run ST-4 Step 3 without the test edit.
- A required-reviewer environment on `publish` works for a tag-triggered run on this repo. Check: one throwaway tag.

## Checked and sound
- Traceability both ways: F-A1 to F-G2 each map to a PR, a deferral or D-10. No conflicting double owner.
- D-1 to D-12: no shim, fallback read, opt-in flag, formatter, extra extraction, signing or retry change in any plan.
- Dependency graph: no cycle, no PR scheduled before a dependency.
- Interfaces match exactly: `redactSensitiveUrlQuery`, `writeFileAtomic` widening, `proxyGet` order, `jobBlocks`, `test-gateway`, `📦 Build gateway`, `apply-support.ts` exports against ST-4 and ST-5, `.runtime.cjs` name, the DH-1 guard names, `npm run lint`, `DEFAULT_CHECKS`.
- Index dates for the EU cooldown match `npm view` (11-21, 11-23). `electron-builder@26.18.1` is already eligible.
- Guard tests exclude `docs/superpowers/`, so committing these documents trips nothing.

Not checked: task bodies beyond the sections cited, and no suite or build was run.
