#!/bin/bash
#
# Run inside the VM once the server is running. Sends real requests through the LLMR gateway
# and writes a log into logs/ beside this script. The LLMR client key is read from a hidden
# prompt and is never written to the log.
# Usage: ./gateway-check.sh [base url]   (default http://127.0.0.1:3456)

P="$(cd "$(dirname "$0")" && pwd)"
BASE="${1:-http://127.0.0.1:3456}"
LOG="$P/logs/gateway-check-$(date +%Y%m%d-%H%M%S).log"
mkdir -p "$P/logs"

printf 'LLMR client key (from API Keys in the app, input hidden): '
read -rs KEY
echo
[ -n "$KEY" ] || { echo "no key entered"; exit 1; }

step() { echo; echo "## $*"; }
# Prints the status line and the first 600 bytes of the body.
call() { curl -s -m 60 -w '\nhttp %{http_code} in %{time_total}s\n' "$@" | cut -c1-600; }

{
  step "date"
  date
  echo "base $BASE, key length ${#KEY}"

  step "health"
  call "$BASE/health"

  step "models without a key (expect a refusal)"
  call "$BASE/v1/models"

  step "models with the key"
  MODELS="$(curl -s -m 20 -H "Authorization: Bearer $KEY" "$BASE/v1/models")"
  echo "$MODELS" | cut -c1-600
  MODEL="$(echo "$MODELS" | grep -o '"id":[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')"
  echo "first model id: ${MODEL:-none}"
  [ -n "$MODEL" ] || { echo "!! no model id, stopping"; exit 1; }

  step "openai chat completion"
  call -H "Authorization: Bearer $KEY" -H 'content-type: application/json' "$BASE/v1/chat/completions" \
    -d "{\"model\":\"$MODEL\",\"max_tokens\":16,\"messages\":[{\"role\":\"user\",\"content\":\"Reply with the single word: pong\"}]}"

  step "openai chat completion, streamed"
  call -N -H "Authorization: Bearer $KEY" -H 'content-type: application/json' "$BASE/v1/chat/completions" \
    -d "{\"model\":\"$MODEL\",\"max_tokens\":16,\"stream\":true,\"messages\":[{\"role\":\"user\",\"content\":\"Reply with the single word: pong\"}]}"

  step "anthropic messages"
  call -H "x-api-key: $KEY" -H 'anthropic-version: 2023-06-01' -H 'content-type: application/json' "$BASE/v1/messages" \
    -d "{\"model\":\"$MODEL\",\"max_tokens\":16,\"messages\":[{\"role\":\"user\",\"content\":\"Reply with the single word: pong\"}]}"

  step "unknown model (expect a clear error)"
  call -H "Authorization: Bearer $KEY" -H 'content-type: application/json' "$BASE/v1/chat/completions" \
    -d '{"model":"no-such-model","max_tokens":8,"messages":[{"role":"user","content":"hi"}]}'
} > "$LOG" 2>&1

# Belt and braces: the key must not be in the log.
if grep -qF "$KEY" "$LOG"; then
  rm -f "$LOG"
  echo "!! the key appeared in the log, so the log was deleted"
  exit 1
fi
echo "wrote $LOG ($(wc -l < "$LOG") lines)"
