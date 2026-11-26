# Deviations from upstream

Standing decisions that settle how an upstream change is classified. The `upstream-review` skill reads this file before classifying. A new standing deviation gets a row. A row names where the decision is recorded, so a reviewer can check it instead of trusting this table.

| Upstream | Ours | Since | Verdict for an upstream change | Recorded in |
| --- | --- | --- | --- | --- |
| Identifiers, env names, headers, paths and the CLI carry the `ccr` / `CCR_` prefix and the "Claude Code Router" name | `llmr` / `LLMR_` and "LLM Router", with no compatibility for the old names | v5.0.0, v6.0.0 | ADAPT every commit through `--port`. Never keep an old name except the survivors listed in `kept` in `scripts/llmr-rename.mjs`. | `specs/completed/2026-10-27-ccr-to-llmr-rename.md`, `plans/completed/2026-10-27-fork-identity.md` |
| Chinese and English docs, UI strings and READMEs | English only | v5.2.0 (PR 22) | Take the English half. SKIP `docs/src/content/docs/zh/**`, `README_zh.md` and any Chinese string. | PR 22 (`d77f5182`), `english-only-parity-docs.md` (the content-parity audit), `tests/architecture/english-only.test.mjs` |
| Bundled Claude Design and Claude Ship plugins | Removed | v7.0.0, v7.0.1 | SKIP changes to them. | `plans/completed/2026-10-29-remove-claude-design-and-ship.md` |
| Provider links carry referral, affiliate and tracking codes | Stripped | 2026-11-16 (PR 69) | ADAPT: take the preset change, strip the code. | `specs/2026-11-16-audit-remediation.md` decision D-1, `tests/architecture/no-referral-links.test.mjs` |
| Presets for the resellers `code0`, `claudeapi`, `fenno`, `infistar-ai`, `runapi`, `unity2` | Deleted | 2026-11-16 (PR 70) | SKIP changes to those six. Other presets are judged on merit. | `specs/2026-11-16-audit-remediation.md` decision D-2 |
| Upstream's version line (`v3.x`), release workflow, download links, app id and update feed | The fork's own line (`v4` and later), `npm run release`, its own app id and feed | v4.0.1 (version line), v5.0.0 (identity) | SKIP version bumps, release notes, download links and identity. A fix to shared release tooling is ADAPT. | `plans/completed/2026-10-27-fork-identity.md`, `plans/2026-11-16-audit-release-safety.md` |
| `blog/`, sponsor images, upstream's LICENSE holder line | `blog/` removed, fork copyright line added | 2026-11-16 (PR 71) | SKIP. | `plans/completed/2026-11-16-audit-hygiene-and-presets.md` |
| Compatibility shims and migrations for existing installs | None. The fork has no consumers. | 2026-11-16 | Drop the shim or migration from a port unless it protects user-owned files. | `specs/2026-11-16-audit-remediation.md` decision D-9 |
| Claude App takeover is on by default | Opt-in | v6.1.0 | ADAPT: keep the opt-in. | `plans/completed/2026-10-28-claude-app-takeover-opt-in.md` |
| No Claude apps gateway integration | LLMR runs behind a Claude apps gateway and can sign in to it | v4.3.0, v7.2.0 | Fork-only code. An upstream change to the same files is ADAPT. | `plans/completed/2026-10-25-claude-apps-gateway-integration.md`, `plans/completed/2026-10-25-claude-apps-gateway-client.md` |
| Two architecture tests (`package-boundaries`, `ui-build-contract`); no commit gate, `.claude/` harness or `AGENTS.md` | A full `tests/architecture/` suite, the commit gate, `.claude/`, `AGENTS.md` | 2026-10 | An upstream change to those two tests is judged on merit. Any other upstream file at a fork-only path is ADAPT at most. | `plans/completed/2026-10-25-ai-assistant-guardrails.md` |

## Decided, not yet landed

These come from the audit remediation spec (`specs/2026-11-16-audit-remediation.md`). An upstream commit that moves the other way is SKIP.

| Decision | Effect on an upstream change |
| --- | --- |
| D-4: remove the `TZ=UTC` override for China time zones | SKIP changes that extend it. |
| D-5: `CODEXL_*` environment names become `LLMR_*` | ADAPT: port with the new names once UL-2 lands. |
| D-7: the Codex runtime moves out of its `String.raw` template into a `.cjs` file | ADAPT: hand-port into the runtime string until ST-1 lands, then into the `.cjs` file. |
| D-8: three move-only extractions from `profiles/service.ts` | ADAPT a change to that file after the extractions, at the code's new home. |
| D-10: retry mode keeps its logic | SKIP changes to the retry policy's status codes or defaults. |
| D-11: marketplace modules require a sha256 `integrity` | ADAPT any marketplace change to keep the check. |
| D-12: delete the proxy key injection | SKIP changes that extend the injection. ADAPT other proxy changes. |
