#!/bin/bash
# usage: run.sh <mode> <port> [extra env assignments...]
set -u
here="$(cd "$(dirname "$0")" && pwd)"
mode="$1"; port="$2"; shift 2
tag="${RUN_TAG:-$mode}"
work="$here/runs/$tag"
rm -rf "$work"; mkdir -p "$work/cfg" "$work/cwd"
node_bin="$(node -p process.execPath)"
"$node_bin" "$here/stub.mjs" "$mode" "$port" "$work/requests.jsonl" > "$work/stub.out" 2>&1 &
stub_pid=$!
sleep 1
cd "$work/cwd"
env -i PATH="$PATH" HOME="$HOME" TERM=dumb \
  CLAUDE_CONFIG_DIR="$work/cfg" \
  ANTHROPIC_BASE_URL="http://127.0.0.1:$port" \
  ANTHROPIC_AUTH_TOKEN="stub-token" \
  "$@" \
  claude -p "Use the Bash tool three times, one command per call, to write three files. Then say done." \
    --permission-mode auto --debug-file "$work/debug.log" --output-format json > "$work/result.json" 2> "$work/stderr.txt" &
claude_pid=$!
( sleep "${RUN_LIMIT:-150}"; kill "$claude_pid" 2>/dev/null ) &
watch_pid=$!
wait "$claude_pid"; echo "claude exit=$?"
kill "$watch_pid" "$stub_pid" 2>/dev/null
echo "--- requests ($tag)"
cat "$work/requests.jsonl" 2>/dev/null
echo "--- files written"; ls "$work/cwd/out" 2>/dev/null
echo "--- result"; head -c 700 "$work/result.json"; echo
echo "--- stderr"; head -c 600 "$work/stderr.txt"; echo
echo "--- server-classifier log"; /usr/bin/grep -a -i "server-classifier\|safeguard\|auto mode" "$work/debug.log" 2>/dev/null | cut -c1-330 | head -30
