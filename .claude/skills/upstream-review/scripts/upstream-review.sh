#!/usr/bin/env bash
# upstream-review.sh - list, classify, dry-run and watermark upstream commits for this fork.
#
# The fork shares history with upstream, so the merge-base of HEAD and the upstream branch is
# the last upstream commit our tree carries wholesale. The fork does not merge upstream: it
# renamed every identifier and many paths and removed whole features, so each wanted change is
# ported by hand (see SKILL.md). The driver answers "what is new", "what did we change in the
# files it touches" and "does the renamed patch apply" before anything is touched.
#
# docs/superpowers/upstream-review/watermark.json holds:
#   forkPointSha     the merge-base when tracking started (history; fixed)
#   lastReviewedSha  the last upstream commit a decision log classified (advances per review)
#
# The window runs from lastReviewedSha to the END ref: the newest upstream release tag past the
# watermark, or the upstream branch tip when no tag is newer. --tip forces the tip. Upstream's
# tags are kept under refs/upstream-review/<remote>/tags/, never refs/tags/, where this fork's
# own release tags live.
#
# USAGE (from anywhere inside the repo)
#   upstream-review.sh [--tip]            fetch, list un-reviewed commits in the window (oldest first)
#   upstream-review.sh --stat [--tip]     same, plus each touched file with a marker (below)
#   upstream-review.sh --urls [--tip]     same, plus a github.com commit URL per commit
#   upstream-review.sh --show <sha>       one upstream commit's full diff, as upstream wrote it
#   upstream-review.sh --port <sha>       the same diff with upstream's names and paths rewritten to this fork's
#   upstream-review.sh --port-check <sha> try the rewritten diff against HEAD, file by file; exit 1 if any file fails
#   upstream-review.sh --diverged         our footprint: files where HEAD differs from the merge-base
#   upstream-review.sh --dry-run-merge    merge the window END in memory and list the conflicts (size of the gap)
#   upstream-review.sh --github           GitHub's view: ahead/behind/status for main and the current branch
#   upstream-review.sh --advance <sha>    set lastReviewedSha to the END SHA printed by the listing you reviewed
#
# UPSTREAM_REVIEW_OFFLINE=1 skips the fetch. The header then says the refs are cached.
#
# Tags on a listed commit: [merge] (its parents are in the range; classify the parents, not
# the merge), [release vX] (upstream tagged this commit).
#
# Markers in --stat compare the fork's copy of the file at HEAD with the commit's own parent
# (the pre-image its diff applies to). A file the fork moved in the rename is looked up at its
# new path, shown as "(here: <path>)".
#   =   our file equals the pre-image              the diff applies as written
#   <   equals the fork point, not the pre-image   an upstream commit after the fork point touched it first;
#                                                  find that commit's verdict in the decision logs
#   ~   differs from both                          we changed it (often only the rename); try --port-check
#   x   we removed it                              it existed at the fork point; skip unless we want it back
#   ^   never here                                 upstream added it after the fork point; port that commit first
#   +   new upstream file                          the port creates it
#   bin binary file                                inspect by hand
#
# Writes: --advance rewrites the watermark, and only when a decision log under
# docs/superpowers/upstream-review/reviews/ has a "Window:" line ending at that SHA. Every
# command except --help adds the upstream remote if it is missing and sets
# remote.<remote>.tagOpt and .pruneTags in this clone.
set -euo pipefail

case "${1:-}" in -h|--help)
  awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit 0 ;;
esac

REPO_ROOT="$(git rev-parse --show-toplevel)"
STATE_DIR="$REPO_ROOT/docs/superpowers/upstream-review"
STATE="$STATE_DIR/watermark.json"
PORT="$(cd "$(dirname "$0")" && pwd)/port.mjs"
export UPSTREAM_REVIEW_RENAME="$REPO_ROOT/scripts/llmr-rename.mjs"

die() { echo "ERROR: $*" >&2; exit 1; }
[ -f "$STATE" ] || die "missing $STATE"
command -v jq >/dev/null || die "jq is required"

require() { [ -n "$2" ] || die "watermark.json: $1 is missing"; }
is_sha()  { [[ "$1" =~ ^[0-9a-f]{40}$ ]] || die "watermark.json: $2 is not a full SHA: $1"; }
is_name() { [[ "$1" =~ ^[A-Za-z0-9._][A-Za-z0-9._/-]*$ ]] || die "watermark.json: $2 is not a safe git name: $1"; }

# A unit separator, not a tab: tab is IFS whitespace, so an empty field would shift the rest.
IFS=$'\x1f' read -r URL REMOTE BRANCH FORK FORK_DATE WATERMARK WATERMARK_DATE < <(
  jq -r '[.upstreamUrl, .upstreamRemote, .upstreamBranch, .forkPointSha, .forkPointDate, .lastReviewedSha, .lastReviewedDate] | map(. // "") | join("\u001f")' "$STATE")
require upstreamUrl "$URL"
require upstreamRemote "$REMOTE";     is_name "$REMOTE" upstreamRemote
require upstreamBranch "$BRANCH";     is_name "$BRANCH" upstreamBranch
require forkPointSha "$FORK";         is_sha "$FORK" forkPointSha
require lastReviewedSha "$WATERMARK"; is_sha "$WATERMARK" lastReviewedSha
[[ "$URL" =~ ^https://github\.com/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+(\.git)?$ ]] || die "watermark.json: upstreamUrl must be a plain https github.com URL"
TIP="refs/remotes/$REMOTE/$BRANCH"
TAGNS="refs/upstream-review/$REMOTE/tags"
UP_REPO="${URL#https://github.com/}"; UP_REPO="${UP_REPO%.git}"
GH_WEB="https://github.com/$UP_REPO/commit"

g() { git -C "$REPO_ROOT" -c core.quotePath=false "$@"; }

ensure_upstream() {
  local have
  # The configured URL, not `remote get-url`, which expands url.<base>.insteadOf.
  if have="$(g config --get "remote.$REMOTE.url")"; then
    [ "$have" = "$URL" ] || die "remote '$REMOTE' points at $have, watermark.json says $URL"
  else
    echo "[upstream-review] adding remote $REMOTE -> $URL" >&2
    g remote add --no-tags -- "$REMOTE" "$URL"
  fi
  # A plain `git fetch` of this remote follows tags into refs/tags, and with fetch.prune and
  # fetch.pruneTags set it mirrors upstream's refs/tags, deleting this fork's own tags
  # locally. These two settings stop both.
  g config "remote.$REMOTE.tagOpt" --no-tags
  g config "remote.$REMOTE.pruneTags" false
  REFS="fetched now"
  if [ "${UPSTREAM_REVIEW_OFFLINE:-0}" = 1 ]; then
    g rev-parse -q --verify "$TIP" >/dev/null || die "offline and no cached $TIP"
    REFS="CACHED (offline), upstream may have moved"
  else
    echo "[upstream-review] fetching $REMOTE/$BRANCH and its v* tags" >&2
    if ! g fetch -q --no-tags -- "$REMOTE" "+refs/heads/$BRANCH:$TIP" "+refs/tags/v*:$TAGNS/v*"; then
      g rev-parse -q --verify "$TIP" >/dev/null || die "fetch failed and no cached $TIP"
      REFS="CACHED (fetch failed), upstream may have moved"
    fi
  fi
  g merge-base --is-ancestor "$WATERMARK" "$TIP" || die "lastReviewedSha is not an ancestor of $REMOTE/$BRANCH (history rewritten?)"
  BASE="$(g merge-base HEAD "$TIP")" || die "HEAD and $REMOTE/$BRANCH share no history"
  pick_end
}

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

release_tag_of() {
  g for-each-ref --points-at "$1" --format='%(refname)' "$TAGNS/v*" | sed "s#^$TAGNS/##" | tr '\n' ' '
}

need_node() {
  [ -f "$UPSTREAM_REVIEW_RENAME" ] || die "missing $UPSTREAM_REVIEW_RENAME"
  command -v node >/dev/null || die "node is required"
}

# stdin: NUL-separated upstream paths. stdout: this fork's path for each.
fork_paths() { node "$PORT" paths; }

# $1 commit, $2 optional upstream path. Plumbing-style flags so user diff settings cannot change the patch.
ported_patch() {
  if [ -n "${2:-}" ]; then
    GIT_LITERAL_PATHSPECS=1 g diff --no-color --no-ext-diff --no-renames --src-prefix=a/ --dst-prefix=b/ "$1^" "$1" -- "$2"
  else
    g diff --no-color --no-ext-diff --no-renames --src-prefix=a/ --dst-prefix=b/ "$1^" "$1"
  fi | node "$PORT" patch
}

# One line per file the commit touches: marker, +adds, -dels, path.
stat_commit() {
  local commit="$1" meta path pre head base add del i j n=0 m note
  local paths pres heres heads bases adds dels; paths=(); pres=(); heres=(); heads=(); bases=(); adds=(); dels=()
  while IFS= read -r -d '' meta && IFS= read -r -d '' path; do
    read -r _ _ pre _ <<<"$meta"
    paths[n]="$path"; pres[n]="$pre"; n=$((n+1))
  done < <(g diff-tree --no-commit-id --no-renames -r -z --raw "$commit")
  [ "$n" -gt 0 ] || return 0
  i=0
  while IFS=$'\t' read -r -d '' add del path; do adds[i]="$add"; dels[i]="$del"; i=$((i+1)); done < <(g diff-tree --no-commit-id --no-renames -r -z --numstat "$commit")
  i=0
  while IFS= read -r -d '' path; do heres[i]="$path"; i=$((i+1)); done < <(printf '%s\0' "${paths[@]}" | fork_paths)
  [ "$i" -eq "$n" ] || die "path rename returned $i paths for $n files in $commit"
  i=0
  while read -r head _ && read -r base _; do heads[i]="$head"; bases[i]="$base"; i=$((i+1)); done < <(
    for ((j=0; j<n; j++)); do printf 'HEAD:%s\n%s:%s\n' "${heres[j]}" "$BASE" "${paths[j]}"; done |
    g cat-file --batch-check='%(objectname) %(objecttype)' | sed 's/^.* missing$/- missing/')
  [ "$i" -eq "$n" ] || die "object lookup returned $i results for $n files in $commit"
  for ((i=0; i<n; i++)); do
    pre="${pres[i]}"; head="${heads[i]}"; base="${bases[i]}"
    if [ "${adds[i]}" = "-" ]; then m=bin
    elif [ "$head" = "-" ]; then
      if [[ "$pre" =~ ^0+$ ]]; then m="+"; elif [ "$base" = "-" ]; then m="^"; else m=x; fi
    elif [ "$head" = "$pre" ]; then m="="
    elif [ "$head" = "$base" ]; then m="<"
    else m="~"; fi
    note=""; [ "${heres[i]}" = "${paths[i]}" ] || note="  (here: ${heres[i]})"
    if [ "$m" = bin ]; then printf '      %-3s %5s %5s  %s%s\n' bin "" "" "${paths[i]}" "$note"
    else printf '      %-3s %5s %5s  %s%s\n' "$m" "+${adds[i]}" "-${dels[i]}" "${paths[i]}" "$note"; fi
  done
}

github_view() {
  command -v gh >/dev/null || die "--github needs the gh CLI"
  local origin our_repo branch refs ref out
  origin="$(g remote get-url origin)"
  our_repo="${origin#https://github.com/}"; our_repo="${our_repo#git@github.com:}"; our_repo="${our_repo%.git}"
  [[ "$our_repo" =~ ^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$ ]] || die "origin is not a github.com repository: $origin"
  branch="$(g rev-parse --abbrev-ref HEAD)"
  echo "GitHub fork compare (counts commits, not patches; a fork that ports never reads as caught up)"
  refs=main; [ "$branch" = main ] || refs="main $branch"
  for ref in $refs; do
    printf '  %-28s ' "$UP_REPO:$BRANCH...$ref"
    if out="$(gh api "repos/$our_repo/compare/${UP_REPO%%/*}:$BRANCH...$ref" \
      --jq '"status=\(.status) ahead_by=\(.ahead_by) behind_by=\(.behind_by)"' 2>&1)"; then echo "$out"
    else echo "(compare failed: $(echo "$out" | head -1))"; fi
  done
  echo "  web: https://github.com/$our_repo/compare/$branch...${UP_REPO%%/*}:$BRANCH   (what upstream has that we do not)"
  echo "  web: https://github.com/$UP_REPO/compare/$BRANCH...${our_repo%%/*}:$branch   (our deviations, as upstream would see them)"
}

USE_TIP=0
args=()
for a in "$@"; do case "$a" in --tip) USE_TIP=1 ;; *) args+=("$a") ;; esac; done
set -- "${args[@]+"${args[@]}"}"
cmd="${1:-list}"
case "$cmd" in
  --show|--port|--port-check)
    [ $# -eq 2 ] || die "$cmd takes one <sha>"
    ensure_upstream
    sha="$(g rev-parse -q --verify "$2^{commit}")" || die "not a commit: $2"
    [ "$cmd" = "--show" ] && { g show "$sha"; exit 0; }
    need_node
    g rev-parse -q --verify "$sha^" >/dev/null || die "$2 has no parent to diff against"
    [ "$cmd" = "--port" ] && { ported_patch "$sha"; exit 0; }
    work="$(mktemp -d)"
    trap 'rm -rf "$work"' EXIT
    # A scratch index holding HEAD, so uncommitted edits cannot change the verdict.
    GIT_INDEX_FILE="$work/index" g read-tree HEAD
    g diff --no-renames -z --numstat "$sha^" "$sha" > "$work/files"
    [ -s "$work/files" ] || die "$2 changes no files"
    files=(); kinds=(); n=0
    while IFS=$'\t' read -r -d '' add _ file; do files[n]="$file"; kinds[n]="$add"; n=$((n+1)); done < "$work/files"
    heres=(); i=0
    while IFS= read -r -d '' file; do heres[i]="$file"; i=$((i+1)); done < <(printf '%s\0' "${files[@]}" | fork_paths)
    [ "$i" -eq "$n" ] || die "path rename returned $i paths for $n files"
    ok=0; bad=0; bin=0
    for ((i=0; i<n; i++)); do
      if [ "${kinds[i]}" = "-" ]; then bin=$((bin+1)); printf '  binary   %s\n' "${heres[i]}"; continue; fi
      ported_patch "$sha" "${files[i]}" > "$work/one"
      if GIT_INDEX_FILE="$work/index" g apply --check --cached "$work/one" 2>"$work/err"; then
        ok=$((ok+1)); printf '  applies  %s\n' "${heres[i]}"
      else
        bad=$((bad+1)); printf '  FAILS    %s\n             %s\n' "${heres[i]}" "$(head -1 "$work/err" | sed 's/^error: //')"
      fi
    done
    echo "Port check of $(g rev-parse --short "$sha") against HEAD: $ok apply, $bad fail, $bin binary (inspect by hand). Paths are this fork's."
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
      [[ "$rc" -eq 1 && "$(echo "$out" | head -1)" =~ ^[0-9a-f]{40,}$ ]] || { echo "ERROR: merge-tree failed (exit $rc): $out" >&2; exit 2; }
      files="$(echo "$out" | sed '1d;/^$/,$d')"
      echo "  $(echo "$files" | wc -l | tr -d ' ') conflicting file(s):"; echo "$files" | sed 's/^/    /'
      echo "  Expected here: the fork ports commit by commit. Use --port-check <sha> per commit."
      exit 1
    fi ;;
  --github)
    ensure_upstream
    github_view; exit 0 ;;
  --advance)
    [ $# -eq 2 ] || die "--advance takes the END <sha> you reviewed (printed by the listing)"
    ensure_upstream
    NEWSHA="$(g rev-parse -q --verify "$2^{commit}")" || die "not a commit: $2"
    g merge-base --is-ancestor "$NEWSHA" "$TIP" || die "$2 is not on $REMOTE/$BRANCH"
    NEWSHORT="$(g rev-parse --short "$NEWSHA")"
    g merge-base --is-ancestor "$WATERMARK" "$NEWSHA" || die "watermark would move backward: current $(g rev-parse --short "$WATERMARK") is not an ancestor of $NEWSHORT"
    grep -rEq -- "^Window: .*\.\.$NEWSHA" "$STATE_DIR/reviews" 2>/dev/null ||
      die "no decision log has a 'Window:' line ending at $NEWSHA; write docs/superpowers/upstream-review/reviews/<date>-review.md first"
    NEWDATE="$(g log -1 --date=short --pretty=%ad "$NEWSHA")"
    NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    tmp="$(mktemp "$STATE_DIR/.watermark.XXXXXX")"
    trap 'rm -f "$tmp"' EXIT
    jq --arg s "$NEWSHA" --arg ss "$NEWSHORT" --arg d "$NEWDATE" --arg n "$NOW" \
      '.lastReviewedSha=$s | .lastReviewedShaShort=$ss | .lastReviewedDate=$d | .lastAdvancedAt=$n' \
      "$STATE" > "$tmp" || die "jq failed; watermark left unchanged"
    chmod 644 "$tmp"
    mv "$tmp" "$STATE"
    echo "[upstream-review] watermark -> $NEWSHORT ($NEWDATE). Commit docs/superpowers/upstream-review/ to share it." >&2
    exit 0 ;;
  list|--stat|--urls)
    [ $# -le 1 ] || die "$cmd takes no argument (one listing option at a time)" ;;
  *) die "unknown option '$cmd' (see --help)" ;;
esac

ensure_upstream
[ "$cmd" = "--stat" ] && need_node
RANGE="$WATERMARK..$END"
COUNT="$(g rev-list --count "$RANGE")"
CHANGES="$(g rev-list --count --no-merges "$RANGE")"
BEYOND="$(g rev-list --count "$END..$TIP")"
ENDSHA="$(g rev-parse "$END")"
echo "Upstream review: $REMOTE/$BRANCH"
echo "  upstream refs:       $REFS"
echo "  fork point:          $(g rev-parse --short "$FORK") $FORK_DATE"
echo "  merge-base:          $(g rev-parse --short "$BASE")"
echo "  last reviewed:       $(g rev-parse --short "$WATERMARK") $WATERMARK_DATE"
echo "  window end:          $ENDSHA  ($END_LABEL)"
echo "  commits to review:   $COUNT  ($CHANGES to classify, the rest are merges)"
[ "$BEYOND" -gt 0 ] && echo "  beyond the window:   $BEYOND  (on $REMOTE/$BRANCH after $END_LABEL; --tip includes them)"
if [ "$COUNT" -eq 0 ]; then
  case "$REFS" in CACHED*) echo "Nothing new in the cached refs. Run without UPSTREAM_REVIEW_OFFLINE, or check the network, before trusting this." ;; *) echo "Up to date." ;; esac
  exit 0
fi

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
echo "with the line 'Window: $(g rev-parse --short "$WATERMARK")..$ENDSHA', then: $0 --advance $ENDSHA"
