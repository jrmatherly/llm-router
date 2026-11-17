---
name: upstream-review
description: Review what changed in the upstream project this fork came from since the last review, decide per commit whether the fork adopts, adapts or skips it, and port the wanted ones without disturbing our deviations. Use for "sync from upstream", "what changed upstream", "review upstream", "are we behind upstream", "did upstream release", "bring upstream commit X in", or any periodic upstream check. Encodes the port-first rule, the watermark, the per-file divergence markers, the renamed-patch check, the decision log and the deviations table.
argument-hint: "[--stat | --urls | --tip | --show <sha> | --port <sha> | --port-check <sha> | --diverged | --dry-run-merge | --github | --advance <sha>]"
---

# Upstream review

This repo is a GitHub fork and shares history with its upstream. The upstream URL, the fork point and the last reviewed commit are in `docs/superpowers/upstream-review/watermark.json`. Divergence is intended (`AGENTS.md`): the goal of a review is to know what upstream did and take what fits, never to reach parity.

## Sync policy: port, never merge

A merge of upstream conflicted in 61 files on 2026-11-16 (`--dry-run-merge` gives today's count), because the fork renamed every identifier, went English only and removed whole features. So:

- **Each wanted upstream commit is ported on its own.** One upstream change is one branch and one squash-merged PR here, through the normal code flow. The PR's `## Why` links the upstream commit, and the commit message ends with `Ported from upstream <full sha>`.
- **Small rows may share a PR when the owner asks.** Batch only rows sized S whose files do not overlap (compare the `--port-check` paths). Each row is its own commit with its own failing test first and its own `Ported from upstream` line, the PR body has one section per row, and reviewers are briefed per row. A row whose defect is unconfirmed here is measured first and dropped from the batch if it does not reproduce. Rows sized M or L, and rows that need a decision, stay alone.
- **The rename is done by a tool.** `--port <sha>` prints the upstream diff with upstream's names and paths rewritten by `scripts/llmr-rename.mjs`. `--port-check <sha>` tries that diff against `HEAD` file by file and prints this fork's path for each, with the reason when a file fails. Apply the files that pass with `--port <sha> | git apply -v --include=<path>`, using the path `--port-check` printed, and port the failing files by hand. `git apply --include` exits 0 when the path matches nothing, so read the `-v` output or `git status` to confirm a file changed.
- **GitHub will always read "behind".** It counts commits, and the fork never records upstream ancestry. The watermark and the decision logs are the record of what was reviewed.
- **A skipped commit needs no code.** It gets a verdict row, and a row in the deviations table when the skip is a standing rule.

## Tooling

| Piece | Path |
| --- | --- |
| Driver | `${CLAUDE_SKILL_DIR}/scripts/upstream-review.sh` (needs `jq` and `node`; `--github` needs `gh`) |
| Watermark (tracked) | `docs/superpowers/upstream-review/watermark.json` |
| Decision logs (tracked) | `docs/superpowers/upstream-review/reviews/<YYYY-MM-DD>-review.md` |
| Deviations table (tracked) | `docs/superpowers/upstream-review/deviations.md` |
| Rename table | `scripts/llmr-rename.mjs` (`${CLAUDE_SKILL_DIR}/scripts/port.mjs` applies it to a diff, one file at a time, so the table's per-file survivors hold) |
| Driver test | `tests/architecture/upstream-review-skill.test.mjs` |

```bash
S=.claude/skills/upstream-review/scripts/upstream-review.sh
$S                    # fetch, list un-reviewed commits oldest first, window end, merge-base
$S --stat             # + each touched file with a divergence marker
$S --urls             # + github commit URL per commit (for the log)
$S --show <sha>       # one commit's diff as upstream wrote it
$S --port <sha>       # the same diff in this fork's names
$S --port-check <sha> # which files of the renamed diff apply to HEAD; exit 1 if any fails
$S --diverged         # our footprint against the merge-base
$S --dry-run-merge    # how many files a merge would conflict in (a size check only)
$S --github           # GitHub compare for main and the current branch
$S --advance <end>    # after the log names <end>; refuses to move backward or without a log
```

`UPSTREAM_REVIEW_OFFLINE=1` skips the fetch and uses the cached upstream refs. The listing's `upstream refs:` line says `CACHED` when the refs were not fetched in that run, whether offline or because the fetch failed. Do not conclude "nothing new" from a cached listing.

The driver fetches upstream's `v*` tags into `refs/upstream-review/upstream/tags/`, never `refs/tags/`, and sets `remote.upstream.tagOpt --no-tags` and `remote.upstream.pruneTags false` on every run. They matter when a clone has `fetch.prune` and `fetch.pruneTags` set (check with `git config --get fetch.prune`, and the same for `fetch.pruneTags` and `push.followTags`). Without the two remote settings, a plain `git fetch upstream` there mirrors upstream's `refs/tags`, which copies upstream's tags beside ours and deletes this fork's own tags locally. A later push with `push.followTags` would then publish any upstream annotated tag reachable from what is pushed. The driver test pins this with a real fetch.

In a clone with a remote named `upstream`, `gh` can resolve to it instead of `origin`. Pass `--repo jrmatherly/llm-router`, or run `gh repo set-default jrmatherly/llm-router` once per clone (`git config remote.origin.gh-resolved` prints `base` when it is set).

Tags on a listed commit: `[merge]` (classify its parents, not the merge) and `[release vX]`. Markers in `--stat` compare the fork's copy at `HEAD` with the commit's parent. A file the rename moved is looked up at its new path and shown as `(here: <path>)`:

| | Meaning | For a port |
| --- | --- | --- |
| `=` | ours equals the pre-image | applies as written |
| `<` | ours equals the fork point, not the pre-image | an upstream commit after the fork point touched it first; find that commit's verdict in the decision logs before porting this one |
| `~` | ours differs from both | we changed it, often only by the rename; `--port-check` tells which |
| `x` | we removed it (it existed at the fork point) | check the deviations table; usually SKIP for that file |
| `^` | never here: upstream added it after the fork point | the commit that added it was not ported; port that one first, or SKIP |
| `+` | new upstream file | the port creates it, renamed |
| `bin` | binary | inspect by hand |

## Method

1. Run `$S --stat` and `$S --github`. Group the non-merge commits by area (gateway, providers and presets, agents and profiles, observability, MCP, desktop, release and docs).
2. Read `docs/superpowers/upstream-review/deviations.md` and the decisions table of any open spec under `docs/superpowers/specs/`. A commit that contradicts a recorded decision is SKIP without further debate.
3. For each non-merge commit, `--show <sha>` and read the diff against its parent. For a window over about 15 commits, dispatch one reviewer subagent per area with the SHAs, the marker output and this file, and synthesize one log. Re-check the top claims yourself before ranking them.
4. Classify our state from the markers and the diff: ALREADY-HAVE (we fixed it another way), ABSENT, DIVERGED, PARTIAL.
5. Verdict:
   - `ADOPT`: port as upstream wrote it, after the rename.
   - `ADAPT`: port the logic, keep ours where the deviations table says so.
   - `SKIP`: not wanted. Give the reason.
   - `MONITOR`: an upstream feature that overlaps one of ours or one we may want later. Record what it does better.
6. Run `--port-check <sha>` for every ADOPT and ADAPT and put the result in the log. It sizes the port.
7. Write every verdict with file-level evidence and the commit URL to the dated decision log (template below). Rank the ADOPT and ADAPT rows by value to this fork.
8. `$S --advance <end>` and commit `docs/superpowers/upstream-review/` to `main` (docs-only). `--advance` needs the log's `Window:` line to end with the full END SHA, as the template has it.
9. The owner picks which rows to port. Each port is its own PR, or one commit in a batch PR under the rule above. Record the PR in the log's "Landed" section when it merges.

### Validating a port

```bash
npm run typecheck
npm run test:architecture
npm run test:core        # or test:ui, test:electron, test:cli for the package touched
```

A port brings upstream's test with it when upstream wrote one. A renamed diff can pass `git apply` and still be wrong, so the tests decide.

## Rules for this repo

- **Never adopt as written:** anything carrying the old names (the rename guard in `tests/architecture/llmr-rename.test.mjs` fails on them), Chinese text or a second language (`tests/architecture/english-only.test.mjs`), referral or affiliate links (`tests/architecture/no-referral-links.test.mjs`), or a compatibility path for old installs (the fork has no consumers).
- **Version bumps, release workflows, download links and app identity are SKIP.** The fork cuts its own releases with `npm run release`.
- **Generated files are regenerated, never ported:** `packages/core/models.json`, `packages/ui/src/generated/`, `package-lock.json`.
- **A dependency bump is its own decision.** Check it against the `overrides` in `package.json` and the machine's `min-release-age` (`npm config get min-release-age`) before porting.
- **An upstream file under `.claude/`, `AGENTS.md` or `CLAUDE.md` is ADAPT at most.** Read it for an idea worth having and port the idea.
- **Check a fix against what we already did.** The fork fixed several defects its own way. ALREADY-HAVE is a valid state, and the better of the two fixes wins.
- **A watermark advance without a decision log is a lost review.** `--advance` refuses when no log names the SHA.

## Decision log template

```markdown
# Upstream review - <YYYY-MM-DD>

Window: `<from>..<full end sha>` (<tip | release vX>), N commits (M merges). Driver: `--stat`, `--dry-run-merge` (K conflicting files), `--github` (status, ahead_by, behind_by).

## Headline
One paragraph: what the window is about, what is worth taking, anything that needs the owner's decision.

## Verdicts
| # | Commit | Area | Our state | Markers | Port check | Verdict | Evidence |
|---|--------|------|-----------|---------|------------|---------|----------|
| 1 | <short> | gateway | ABSENT | `~ +` | 3 apply, 1 fail | ADOPT | what it changes, where, why it fits; <commit url> |

## Recommended ports, in order
Each with the reason and the expected size.

## Landed
PR links as ports merge.

## Red flags
Anything upstream did that this fork must watch (a changed security boundary, a renamed path, a new dependency).
```
