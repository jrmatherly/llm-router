#!/bin/bash
#
# Run inside the VM. Installs the dmg beside this script into /Applications, checks its
# signature and notarization, launches it, and writes a log into logs/ beside this script.
# Usage: ./install-check.sh [dmg name]   (default: the 8.0.0 arm64 dmg)

P="$(cd "$(dirname "$0")" && pwd)"
DMG="$P/${1:-LLM-Router_8.0.0-mac-Apple-Silicon-arm64.dmg}"
APP="/Applications/LLM Router.app"
LOG="$P/logs/install-check-$(date +%Y%m%d-%H%M%S).log"
MNT="$(mktemp -d)"
mkdir -p "$P/logs"

case "$(hostname)" in
  *Virtual-Machine*) ;;
  *) echo "refusing to run: hostname $(hostname) does not look like the VM"; exit 1 ;;
esac

step() { echo; echo "## $*"; }

{
  step "date and system"
  date
  sw_vers
  uname -m

  step "dmg"
  ls -l "$DMG" || exit 1
  shasum -a 512 "$DMG" | xxd -r -p | base64 | tr -d '\n'; echo "  (sha512, compare with latest-mac.yml)"
  grep -A1 "$(basename "$DMG")" "$P/latest-mac.yml" | grep sha512
  spctl -a -vv -t open --context context:primary-signature "$DMG"
  echo "spctl dmg exit $?"

  step "state before install"
  ls -ld "$APP" "$HOME/.llm-router" "$HOME/.claude" "$HOME/.codex" 2>&1
  command -v llmr || echo "llmr not on PATH"

  step "mount and copy"
  hdiutil attach "$DMG" -nobrowse -readonly -mountpoint "$MNT" || exit 1
  ls -la "$MNT"
  rm -rf "$APP"
  ditto "$MNT/LLM Router.app" "$APP"
  echo "ditto exit $?"
  hdiutil detach "$MNT"

  # QUARANTINE=1 marks the app as a browser download to test Gatekeeper's first-launch prompt.
  # It also makes macOS run the app translocated (read-only, random path), which breaks
  # auto-update and the llmr link, so leave it off for every other test.
  [ "${QUARANTINE:-0}" = 1 ] && xattr -w com.apple.quarantine "0083;$(printf '%x' "$(date +%s)");Safari;$(uuidgen)" "$APP"
  xattr -l "$APP"

  step "signature"
  codesign --verify --deep --strict --verbose=2 "$APP"
  echo "codesign verify exit $?"
  codesign -dv --verbose=4 "$APP" 2>&1 | grep -E "Identifier|Authority|TeamIdentifier|Timestamp|Runtime|flags"
  defaults read "$APP/Contents/Info" CFBundleShortVersionString
  defaults read "$APP/Contents/Info" LSMinimumSystemVersion
  lipo -archs "$APP/Contents/MacOS/LLM Router"

  step "gatekeeper"
  spctl -a -vv "$APP"
  echo "spctl app exit $?"
  if xcrun -f stapler > /dev/null 2>&1; then
    xcrun stapler validate "$APP"
    echo "stapler exit $?"
  else
    echo "stapler not available (no Xcode tools); skipped"
  fi

  step "launch"
  open "$APP"
  echo "open exit $? (approve the first-launch prompt if one appears)"
  for _ in $(seq 1 30); do
    pgrep -fl "LLM Router.app/Contents/MacOS/LLM Router" && break
    sleep 2
  done
  pgrep -fl "LLM Router" || echo "!! no LLM Router process after 60 s"
  for _ in $(seq 1 30); do
    [ -d "$HOME/.llm-router" ] && break
    sleep 2
  done
  [ -d "$HOME/.llm-router" ] || echo "!! no ~/.llm-router 60 s after the process started"
  sleep 10

  step "state after first launch"
  ls -la "$HOME/.llm-router" 2>&1
  zsh -lic 'command -v llmr && llmr --version' 2>&1
  lsof -nP -iTCP -sTCP:LISTEN 2> /dev/null | grep -E "LLM|llmr|node|:345[0-9]" || echo "no LLMR listener yet"
} > "$LOG" 2>&1

echo "wrote $LOG ($(wc -l < "$LOG") lines)"
