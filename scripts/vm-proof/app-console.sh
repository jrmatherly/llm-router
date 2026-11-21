#!/bin/bash
#
# Run inside the VM. Quits LLM Router, starts it again from this shell so its main-process
# console output lands in logs/ beside this script, waits, then records state with collect.sh.
# The app keeps running afterwards. Usage: ./app-console.sh [seconds to wait, default 40]

P="$(cd "$(dirname "$0")" && pwd)"
LOG="$P/logs/app-console-$(date +%Y%m%d-%H%M%S).log"
BIN="/Applications/LLM Router.app/Contents/MacOS/LLM Router"
mkdir -p "$P/logs"

osascript -e 'tell application "LLM Router" to quit' 2> /dev/null
for _ in $(seq 1 20); do
  pgrep -f "LLM Router.app/Contents/MacOS/LLM Router" > /dev/null || break
  sleep 1
done
pgrep -f "LLM Router.app/Contents/MacOS/LLM Router" > /dev/null && { echo "LLM Router is still running; quit it from the tray and run this again"; exit 1; }

nohup "$BIN" > "$LOG" 2>&1 &
echo "started LLM Router (pid $!), console output in $LOG"
sleep "${1:-40}"
# Keys never belong in a shared log.
if grep -qE '(sk-llmr-|llmr-pro)[A-Za-z0-9_-]{8,}' "$LOG"; then
  sed -i '' -E 's/(sk-llmr-|llmr-pro)[A-Za-z0-9_-]+/\1[masked]/g' "$LOG"
  echo "masked key values found in the console output"
fi
echo "console lines so far: $(wc -l < "$LOG")"
"$P/collect.sh" console
