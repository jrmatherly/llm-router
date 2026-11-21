#!/bin/bash
#
# Run inside the VM, any number of times, after a step in the app. Reads only.
# Writes a log into logs/ beside this script. Never prints file contents that hold tokens.
# Usage: ./collect.sh [label]

P="$(cd "$(dirname "$0")" && pwd)"
LOG="$P/logs/collect-${1:-state}-$(date +%Y%m%d-%H%M%S).log"
APP="/Applications/LLM Router.app"
mkdir -p "$P/logs"

step() { echo; echo "## $*"; }

{
  step "date"
  date

  step "app"
  defaults read "$APP/Contents/Info" CFBundleShortVersionString 2>&1
  xattr -l "$APP" 2>&1
  pgrep -fl "LLM Router" || echo "no LLM Router process"

  step "cli"
  zsh -lic 'command -v llmr && ls -l "$(command -v llmr)" && llmr --version' 2>&1

  step "listeners"
  lsof -nP -iTCP -sTCP:LISTEN 2> /dev/null | grep -E "LLM|llmr|node|:345[0-9]" || echo "no LLMR listener"

  step "gateway health"
  curl -s -m 5 -i http://127.0.0.1:3456/health 2>&1 || echo "curl exit $?"

  step "data dir (names, modes and sizes only)"
  ls -laR "$HOME/.llm-router" 2>&1 | head -200

  step "files LLMR may write outside its own dir"
  ls -la "$HOME/.claude" "$HOME/.codex" "$HOME/.claude.json" 2>&1
  ls -la "$HOME/Library/Application Support" 2>&1 | grep -i -E "llm|router" || echo "no app-support entry"
  ls -la "$HOME/Library/Logs" 2>&1 | grep -i -E "llm|router" || echo "no Logs entry"

  step "agent files LLMR wrote (key and token values masked)"
  for f in "$HOME/.claude/settings.json" "$HOME/.codex/config.toml" "$HOME/.codex/llm-router.config.toml"; do
    echo "--- $f"
    [ -f "$f" ] && sed -E \
      -e 's/(sk-llmr-|llmr-pro)[A-Za-z0-9_-]+/\1[masked]/g' \
      -e 's/(([Kk][Ee][Yy]|[Tt][Oo][Kk][Ee][Nn]|[Ss][Ee][Cc][Rr][Ee][Tt]|[Aa]uthorization)[A-Za-z_]*"?[[:space:]]*[:=][[:space:]]*")[^"]{12,}"/\1[masked]"/g' "$f"
  done
  ls -laR "$HOME/.codex/.llm-router" 2>&1 | head -30

  step "LLMR files outside app-data"
  find "$HOME/.llm-router" -maxdepth 4 -not -path "*/app-data/*" -not -name "models.json" -exec ls -ld {} + 2>&1 | cut -c1-200 | head -80

  step "saved profile config (key and token values masked)"
  sqlite3 -readonly "$HOME/.llm-router/config.sqlite" "select key, updated_at, length(value_json) from app_config; select 'runtime_state', key, updated_at, length(value_json) from runtime_state;" 2>&1
  sqlite3 -readonly "$HOME/.llm-router/config.sqlite" "select json_extract(value_json,'\$.profile.enabled'), json_extract(value_json,'\$.gateway.enabled'), json_extract(value_json,'\$.autoStart') from app_config where key='default'; select json_extract(value_json,'\$.profile.profiles') from app_config where key='default'; select value_json from runtime_state;" 2>&1 \
    | sed -E -e 's/(sk-llmr-|llmr-pro)[A-Za-z0-9_-]+/\1[masked]/g' \
      -e 's/(([Kk][Ee][Yy]|[Tt][Oo][Kk][Ee][Nn]|[Ss][Ee][Cc][Rr][Ee][Tt]|[Aa]uthorization)[A-Za-z_]*"?[[:space:]]*[:=][[:space:]]*")[^"]{12,}"/\1[masked]"/g' | cut -c1-6000

  step "claude profile state files"
  for f in "$HOME/.llm-router/profiles"/*/claude/settings-state.json "$HOME/.llm-router/claude-model-discovery-fingerprint.json"; do
    echo "--- $f"; [ -f "$f" ] && cat "$f"; echo
  done

  step "crash reports"
  ls -la "$HOME/Library/Logs/DiagnosticReports" 2>&1 | grep -i -E "llm|router|electron" || echo "none"

  step "recent system log lines for the app (5 min)"
  log show --last 5m --style compact --predicate 'process == "LLM Router" AND messageType >= 16' 2>&1 | tail -40
} > "$LOG" 2>&1

echo "wrote $LOG ($(wc -l < "$LOG") lines)"
