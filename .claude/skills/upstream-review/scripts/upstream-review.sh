#!/usr/bin/env bash
# upstream-review.sh - list, classify, dry-run and watermark upstream commits for this fork.
#
# The fork shares history with upstream, so the merge-base of HEAD and the upstream branch is
# the last upstream commit our tree carries wholesale. The fork does not merge upstream: it
# renamed every identifier and removed whole features, so each wanted change is ported by hand
# (see SKILL.md). The driver answers "what is new", "what did we change in the files it
# touches" and "does the renamed patch apply" before anything is touched.
#
# docs/superpowers/upstream-review/watermark.json holds:
#   forkPointSha     the merge-base when tracking started (history; fixed)
#   lastReviewedSha  the last upstream commit a decision log classified (advances per review)
#
# The window runs from lastReviewedSha to the END ref: the newest upstream release tag
# (refs/remotes/<remote>/tags/v*) past the watermark, or the upstream branch tip when no tag is
# newer. --tip forces the tip. Upstream's tags are kept under refs/remotes/<remote>/tags/ so
# they never land beside the tags this fork cuts for its own releases.
#
# USAGE (from anywhere inside the repo)
#   upstream-review.sh [--tip]            fetch, list un-reviewed commits in the window (oldest first)
#   upstream-review.sh --stat [--tip]     same, plus each touched file with a marker (below)
#   upstream-review.sh --urls [--tip]     same, plus a github.com commit URL per commit
#   upstream-review.sh --show <sha>       one upstream commit's full diff, as upstream wrote it
#   upstream-review.sh --port <sha>       the same diff with upstream's names rewritten to this fork's
#   upstream-review.sh --port-check <sha> try the rewritten diff against HEAD, file by file; exit 1 if any file fails
#   upstream-review.sh --diverged         our footprint: files where HEAD differs from the merge-base
#   upstream-review.sh --dry-run-merge    merge the window END in memory and list the conflicts (size of the gap)
#   upstream-review.sh --github           GitHub's view: ahead/behind/status for main and the current branch
#   upstream-review.sh --advance <sha>    set lastReviewedSha to the END SHA printed by the listing you reviewed
#
# Tags on a listed commit: [merge] (its parents are in the range; classify the parents, not
# the merge), [release vX] (upstream tagged this commit).
#
# Markers in --stat compare our HEAD with the commit's own parent (the pre-image its diff applies to):
#   =   our file equals the pre-image             the diff applies as written
#   <   equals the merge-base, not the pre-image  an earlier un-reviewed upstream commit touched it first
#   ~   differs from both                         we changed it (often only the rename); try --port-check
#   x   we removed it                             skip unless we want the file back
#   +   new upstream file                         the port creates it
#   bin binary file                               inspect by hand
# Only --advance writes a tracked file, the watermark, after a decision log under
# docs/superpowers/upstream-review/reviews/ names the SHA. Every run sets
# remote.<upstream>.tagOpt and .pruneTags in this clone.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
STATE_DIR="$REPO_ROOT/docs/superpowers/upstream-review"
STATE="$STATE_DIR/watermark.json"
RENAME="$REPO_ROOT/scripts/llmr-rename.mjs"

die() { echo "ERROR: $*" >&2; exit 1; }
[ -f "$STATE" ] || die "missing $STATE"
command -v jq >/dev/null || die "jq is required"

require() { [ -n "$2" ] || die "watermark.json: $1 is missing"; }
is_sha()  { [[ "$1" =~ ^[0-9a-f]{40}$ ]] || die "watermark.json: $2 is not a full SHA: $1"; }
is_name() { [[ "$1" =~ ^[A-Za-z0-9._][A-Za-z0-9._/-]*$ ]] || die "watermark.json: $2 is not a safe git name: $1"; }

IFS=$'\t' read -r URL REMOTE BRANCH FORK FORK_DATE WATERMARK WATERMARK_DATE < <(
  jq -r '[.upstreamUrl, .upstreamRemote, .upstreamBranch, .forkPointSha, .forkPointDate, .lastReviewedSha, .lastReviewedDate] | map(. // "") | @tsv' "$STATE")
require upstreamUrl "$URL"
require upstreamRemote "$REMOTE";     is_name "$REMOTE" upstreamRemote
require upstreamBranch "$BRANCH";     is_name "$BRANCH" upstreamBranch
require forkPointSha "$FORK";         is_sha "$FORK" forkPointSha
require lastReviewedSha "$WATERMARK"; is_sha "$WATERMARK" lastReviewedSha
[[ "$URL" =~ ^https://github\.com/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+(\.git)?$ ]] || die "watermark.json: upstreamUrl must be a plain https github.com URL"
TIP="refs/remotes/$REMOTE/$BRANCH"
TAGNS="refs/remotes/$REMOTE/tags"
UP_REPO="${URL#https://github.com/}"; UP_REPO="${UP_REPO%.git}"   # owner/repo
GH_WEB="https://github.com/$UP_REPO/commit"

g() { git -C "$REPO_ROOT" "$@"; }

ensure_upstream() {
  local have
  if have="$(g remote get-url -- "$REMOTE" 2>/dev/null)"; then
    [ "$have" = "$URL" ] || die "remote '$REMOTE' points at $have, watermark.json says $URL"
  else
    echo "[upstream-review] adding remote $REMOTE -> $URL" >&2
    g remote add --no-tags -- "$REMOTE" "$URL"
  fi
  # A plain `git fetch` of this remote copies upstream's tags into refs/tags two ways: tag
  # auto-following, and fetch.pruneTags, which mirrors refs/tags/* and would also delete this
  # fork's own tags. push.followTags then publishes the copies. Keep them in $TAGNS only.
  g config "remote.$REMOTE.tagOpt" --no-tags
  g config "remote.$REMOTE.pruneTags" false
  if [ "${UPSTREAM_REVIEW_OFFLINE:-0}" = 1 ]; then
    g rev-parse -q --verify "$TIP" >/dev/null || die "offline and no cached $TIP"
  else
    echo "[upstream-review] fetching $REMOTE/$BRANCH and its v* tags" >&2
    if ! g fetch -q --no-tags -- "$REMOTE" "+refs/heads/$BRANCH:$TIP" "+refs/tags/v*:$TAGNS/v*"; then
      g rev-parse -q --verify "$TIP" >/dev/null || die "fetch failed and no cached $TIP"
      echo "[upstream-review] fetch failed; using cached $TIP" >&2
    fi
  fi
  g merge-base --is-ancestor "$WATERMARK" "$TIP" || die "lastReviewedSha is not an ancestor of $REMOTE/$BRANCH (history rewritten?)"
  BASE="$(g merge-base HEAD "$TIP")"
  pick_end
}

# END is the newest upstream release tag past the watermark, else the tip. --tip overrides.
pick_end() {
  END="$TIP"; END_LABEL="tip"
  [ "${USE_TIP:-0}" = 1 ] && return 0
  local tag
  # Process substitution, not a pipe: breaking early would SIGPIPE for-each-ref and pipefail would exit 141.
  tag="$(while read -r ref; do
      g merge-base --is-ancestor "$ref" "$TIP" || continue
      g merge-base --is-ancestor "$ref" "$WATERMARK" && continue
      echo "$ref"; break
    done < <(g for-each-ref --sort=-creatordate --format='%(refname)' "$TAGNS/v*"))"
  [ -n "$tag" ] || return 0
  # Peel an annotated tag so END is the commit the listing, the log and --advance all name.
  END="$(g rev-parse "$tag^{commit}")"; END_LABEL="release ${tag#"$TAGNS"/}"
}

release_tag_of() {  # upstream tag(s) pointing at this commit, if any
  g for-each-ref --points-at "$1" --format='%(refname:strip=4)' "$TAGNS/v*" | tr '\n' ' '
}

# The commit's diff with upstream's identifiers and paths rewritten by the fork's rename table.
ported_patch() {
  [ -f "$RENAME" ] || die "missing $RENAME"
  command -v node >/dev/null || die "--port needs node"
  g diff --no-renames "$1^" "$1" -- ${2:+"$2"} | RENAME="$RENAME" node --input-type=module -e '
    import { pathToFileURL } from "node:url";
    const { classes, renameText } = await import(pathToFileURL(process.env.RENAME).href);
    let patch = "";
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) patch += chunk;
    process.stdout.write(renameText(patch, Object.keys(classes)));
  '
}

stat_commit() {
  local commit="$1" meta path pre head base i j n=0
  local paths pres heads bases adds dels; paths=(); pres=(); heads=(); bases=(); adds=(); dels=()
  while IFS= read -r -d '' meta && IFS= read -r -d '' path; do
    read -r _ _ pre _ <<<"$meta"
    paths[n]="$path"; pres[n]="$pre"; n=$((n+1))
  done < <(g diff-tree --no-commit-id --no-renames -r -z --raw "$commit")
  [ "$n" -gt 0 ] || return 0
  i=0
  while IFS=$'\t' read -r -d '' add del path; do adds[i]="$add"; dels[i]="$del"; i=$((i+1)); done < <(g diff-tree --no-commit-id --no-renames -r -z --numstat "$commit")
  i=0
  while read -r head _ && read -r base _; do heads[i]="$head"; bases[i]="$base"; i=$((i+1)); done < <(
    for ((j=0; j<n; j++)); do printf 'HEAD:%s\n%s:%s\n' "${paths[j]}" "$BASE" "${paths[j]}"; done |
    g cat-file --batch-check='%(objectname) %(objecttype)' | sed 's/^.* missing$/- missing/')
  for ((i=0; i<n; i++)); do
    pre="${pres[i]}"; head="${heads[i]}"; base="${bases[i]}"
    if [ "${adds[i]}" = "-" ]; then m=bin
    elif [[ "$pre" =~ ^0+$ ]]; then
      if [ "$head" = "-" ]; then m="+"; elif [ "$head" = "$base" ]; then m="<"; else m="~"; fi
    elif [ "$head" = "-" ]; then m=x
    elif [ "$head" = "$pre" ]; then m="="
    elif [ "$head" = "$base" ]; then m="<"
    else m="~"; fi
    [ "$m" = bin ] && printf '      %-3s %5s %5s  %s\n' bin "" "" "${paths[i]}" || printf '      %-3s %5s %5s  %s\n' "$m" "+${adds[i]}" "-${dels[i]}" "${paths[i]}"
  done
}

github_view() {
  command -v gh >/dev/null || die "--github needs the gh CLI"
  local origin our_repo branch refs ref
  origin="$(g remote get-url origin)"
  our_repo="${origin#https://github.com/}"; our_repo="${our_repo#git@github.com:}"; our_repo="${our_repo%.git}"
  branch="$(g rev-parse --abbrev-ref HEAD)"
  echo "GitHub fork compare (counts commits, not patches: a cherry-pick still reads as behind until merged)"
  refs=main; [ "$branch" = main ] || refs="main $branch"
  for ref in $refs; do
    printf '  %-28s ' "$UP_REPO:$BRANCH...$ref"
    gh api "repos/$our_repo/compare/${UP_REPO%%/*}:$BRANCH...$ref" \
      --jq '"status=\(.status) ahead_by=\(.ahead_by) behind_by=\(.behind_by)"' 2>/dev/null || echo "(compare failed; branch not pushed?)"
  done
  echo "  web: https://github.com/$our_repo/compare/$branch...${UP_REPO%%/*}:$BRANCH   (what a merge would bring in)"
  echo "  web: https://github.com/$UP_REPO/compare/$BRANCH...${our_repo%%/*}:$branch   (our deviations, as upstream would see them)"
}

USE_TIP=0
args=()
for a in "$@"; do case "$a" in --tip) USE_TIP=1 ;; *) args+=("$a") ;; esac; done
set -- "${args[@]+"${args[@]}"}"
cmd="${1:-list}"
case "$cmd" in
  --show|--port|--port-check)
    [ $# -ge 2 ] || die "$cmd needs a <sha>"
    ensure_upstream
    sha="$(g rev-parse -q --verify "$2^{commit}")" || die "not a commit: $2"
    case "$cmd" in
      --show) g show "$sha"; exit 0 ;;
      --port) ported_patch "$sha"; exit 0 ;;
    esac
    one="$(mktemp)"
    trap 'rm -f "$one"' EXIT
    ok=0; bad=0
    while IFS= read -r file; do
      ported_patch "$sha" "$file" > "$one"
      if g apply --check "$one" 2>/dev/null; then ok=$((ok+1)); printf '  applies  %s\n' "$file"
      else bad=$((bad+1)); printf '  FAILS    %s\n' "$file"; fi
    done < <(g diff --no-renames --name-only "$sha^" "$sha")
    echo "Port check of $(g rev-parse --short "$sha") against HEAD: $ok file(s) apply, $bad fail. A failing file needs a hand port or was removed here."
    [ "$bad" -eq 0 ]; exit $? ;;
  --diverged)
    ensure_upstream
    echo "Files where our HEAD differs from the merge-base $(g rev-parse --short "$BASE") (fork point $(g rev-parse --short "$FORK")):"
    g diff --stat=120 "$BASE" HEAD; exit 0 ;;
  --dry-run-merge)
    ensure_upstream
    echo "Dry-run merge of $END_LABEL ($(g rev-parse --short "$END")) into HEAD (git merge-tree, nothing checked out):"
    if out="$(g merge-tree --write-tree --name-only HEAD "$END")"; then
      echo "  clean. Merged tree $(echo "$out" | head -1 | cut -c1-12)."
      exit 0
    else
      rc=$?
      [ "$rc" -eq 1 ] || { echo "ERROR: merge-tree failed (exit $rc): $out" >&2; exit 2; }
      files="$(echo "$out" | sed '1d;/^$/,$d')"
      echo "  $(echo "$files" | wc -l | tr -d ' ') conflicting file(s):"; echo "$files" | sed 's/^/    /'
      echo "  Expected here: the fork ports commit by commit. Use --port-check <sha> per commit."
      exit 1
    fi ;;
  --github)
    ensure_upstream
    github_view; exit 0 ;;
  --advance)
    [ $# -ge 2 ] || die "--advance needs the END <sha> you reviewed (printed by the listing)"
    ensure_upstream
    NEWSHA="$(g rev-parse -q --verify "$2^{commit}")" || die "not a commit: $2"
    g merge-base --is-ancestor "$NEWSHA" "$TIP" || die "$2 is not on $REMOTE/$BRANCH"
    NEWSHORT="$(g rev-parse --short "$NEWSHA")"
    g merge-base --is-ancestor "$WATERMARK" "$NEWSHA" || die "watermark would move backward: current $(g rev-parse --short "$WATERMARK") is not an ancestor of $NEWSHORT"
    grep -rlq -- "$NEWSHORT" "$STATE_DIR/reviews" 2>/dev/null || die "no decision log mentions $NEWSHORT; write docs/superpowers/upstream-review/reviews/<date>-review.md first"
    NEWDATE="$(g log -1 --date=short --pretty=%ad "$NEWSHA")"
    NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    tmp="$(mktemp "$STATE_DIR/.watermark.XXXXXX")"
    trap 'rm -f "$tmp"' EXIT
    jq --arg s "$NEWSHA" --arg ss "$NEWSHORT" --arg d "$NEWDATE" --arg n "$NOW" \
      '.lastReviewedSha=$s | .lastReviewedShaShort=$ss | .lastReviewedDate=$d | .lastAdvancedAt=$n' \
      "$STATE" > "$tmp" || die "jq failed; watermark left unchanged"
    mv "$tmp" "$STATE"
    echo "[upstream-review] watermark -> $NEWSHORT ($NEWDATE). Commit docs/superpowers/upstream-review/ to share it." >&2
    exit 0 ;;
  -h|--help) sed -n '2,43p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  list|--stat|--urls) ;;
  *) die "unknown option '$cmd' (see --help)" ;;
esac

ensure_upstream
RANGE="$WATERMARK..$END"
COUNT="$(g rev-list --count "$RANGE")"
CHANGES="$(g rev-list --count --no-merges "$RANGE")"
BEYOND="$(g rev-list --count "$END..$TIP")"
ENDSHA="$(g rev-parse "$END")"
echo "Upstream review: $REMOTE/$BRANCH"
echo "  fork point:          $(g rev-parse --short "$FORK") $FORK_DATE"
echo "  merge-base:          $(g rev-parse --short "$BASE")"
echo "  last reviewed:       $(g rev-parse --short "$WATERMARK") $WATERMARK_DATE"
echo "  window end:          $ENDSHA  ($END_LABEL)"
echo "  commits to review:   $COUNT  ($CHANGES to classify, the rest are merges)"
[ "$BEYOND" -gt 0 ] && echo "  beyond the window:   $BEYOND  (on $REMOTE/$BRANCH after $END_LABEL; --tip includes them)"
[ "$COUNT" -eq 0 ] && { echo "Up to date."; exit 0; }

g log --reverse --date=short --pretty='%H%x09%h%x09%ad%x09%p%x09%s' "$RANGE" |
while IFS=$'\t' read -r full short date parents subj; do
  tag=""; case "$parents" in *" "*) tag="  [merge]";; esac
  rel="$(release_tag_of "$full")"; [ -n "$rel" ] && tag="$tag  [release ${rel% }]"
  echo
  echo "* $short  $date  $subj$tag"
  [ "$cmd" = "--urls" ] && echo "    $GH_WEB/$full"
  if [ "$cmd" = "--stat" ] && [[ "$tag" != *"[merge]"* ]]; then
    stat_commit "$full"
  fi
done

echo
echo "Next: classify each commit (see SKILL.md), write docs/superpowers/upstream-review/reviews/$(date +%Y-%m-%d)-review.md"
echo "with 'Window: $(g rev-parse --short "$WATERMARK")..$ENDSHA', then: $0 --advance $ENDSHA"
