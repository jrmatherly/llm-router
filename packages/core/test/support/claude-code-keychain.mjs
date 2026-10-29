import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { resetClaudeCodeAuthStateForTest } from "@llmr/core/agents/local-providers/claude-code.ts";

export const testTokenEndpoint = "http://127.0.0.1/claude/oauth/token";

export async function withKeychainLogin(claudeAiOauth, run) {
  await withClaudeCodeHome(async () => {
    await withPlatform("darwin", async () => {
      await withFakeKeychain({ claudeAiOauth }, run);
    });
  });
}

export function stubTokenEndpoint(t, respond) {
  resetClaudeCodeAuthStateForTest();
  const previousFetch = globalThis.fetch;
  const previousEndpoint = process.env.LLMR_CLAUDE_CODE_OAUTH_TOKEN_ENDPOINT;
  process.env.LLMR_CLAUDE_CODE_OAUTH_TOKEN_ENDPOINT = testTokenEndpoint;
  const endpoint = { calls: 0 };
  globalThis.fetch = async (input, init) => {
    endpoint.calls += 1;
    return respond(input, init);
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
    restoreEnv("LLMR_CLAUDE_CODE_OAUTH_TOKEN_ENDPOINT", previousEndpoint);
    resetClaudeCodeAuthStateForTest();
  });
  return endpoint;
}

export function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status });
}

export async function withClaudeCodeHome(run) {
  const home = mkdtempSync(path.join(os.tmpdir(), "llmr-claude-code-provider-"));
  const previousHome = process.env.HOME;
  process.env.HOME = home;
  try {
    await run(home);
  } finally {
    restoreEnv("HOME", previousHome);
    rmSync(home, { force: true, recursive: true });
  }
}

export async function withPlatform(platform, run) {
  const descriptor = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", {
    configurable: true,
    value: platform
  });
  try {
    await run();
  } finally {
    Object.defineProperty(process, "platform", descriptor);
  }
}

export async function withFakeSecurityOutput(output, run) {
  await withFakeSecurityScript(`cat <<'LLMR_KEYCHAIN_JSON'\n${JSON.stringify(output)}\nLLMR_KEYCHAIN_JSON\n`, run);
}

export async function withFakeSecurityFailure(run) {
  await withFakeSecurityScript("exit 44\n", run);
}

// Pins $USER as well as PATH: the provider looks the keychain item up under the
// current account, so the expected item name has to be deterministic.
export async function withFakeSecurityScript(body, run) {
  const binDir = mkdtempSync(path.join(os.tmpdir(), "llmr-security-bin-"));
  const securityPath = path.join(binDir, "security");
  const previousPath = process.env.PATH;
  const previousUser = process.env.USER;
  writeFileSync(securityPath, `#!/bin/sh\n${body}`);
  chmodSync(securityPath, 0o755);
  process.env.PATH = `${binDir}${path.delimiter}${previousPath ?? ""}`;
  process.env.USER = keychainAccount;
  try {
    await run(binDir);
  } finally {
    restoreEnv("PATH", previousPath);
    restoreEnv("USER", previousUser);
    rmSync(binDir, { force: true, recursive: true });
  }
}

export const keychainAccount = "llmr-test-user";
export const keychainNotFound = "echo 'security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.' >&2\nexit 44";

// One mutable item, whatever -a/-s say: refresh tests assert the write-back
// target through `calls`, not through separate records.
export async function withFakeKeychain(initialRecord, run, options = {}) {
  const failWrite = options.writeExitCode === undefined
    ? ""
    : options.failWrites === undefined ? `exit ${options.writeExitCode}\n` : `if [ "$(basename "$call")" -lt ${options.failWrites} ]; then exit ${options.writeExitCode}; fi\n`;
  const delay = options.writeDelaySeconds === undefined ? "" : `sleep ${options.writeDelaySeconds}\n`;
  const body = [
    `dir=$(dirname "$0")`,
    `case "$1" in`,
    "  find-generic-password)",
    `    for arg in "$@"; do`,
    `      if [ "$arg" = "-w" ]; then cat "$dir/record.json"; exit 0; fi`,
    "    done ;;",
    "  add-generic-password|-i)",
    `    call="$dir/calls/$(ls "$dir/calls" | wc -l | tr -d ' ')"`,
    `    mkdir "$call"`,
    `    printf '%s\\0' "$@" > "$call/argv"`,
    `    if [ "$1" = "-i" ]; then`,
    `      cat > "$call/stdin"`,
    `      hex=$(sed -n 's/^add-generic-password .*-X \"\\{0,1\\}\\([0-9a-fA-F]*\\).*$/\\1/p' "$call/stdin" | tail -n 1)`,
    "    else",
    `      : > "$call/stdin"`,
    "      hex=''",
    `      while [ $# -gt 0 ]; do`,
    `        if [ "$1" = "-X" ]; then hex="$2"; fi`,
    "        shift",
    "      done",
    "    fi",
    `    ${delay}if [ -f "$dir/write-failure" ]; then exit "$(cat "$dir/write-failure")"; fi`,
    `    ${failWrite}[ -n "$hex" ] || exit 1`,
    `    printf '%s' "$hex" | xxd -r -p > "$dir/next.json" && mv "$dir/next.json" "$dir/record.json" || exit 1`,
    "    exit 0 ;;",
    "esac",
    keychainNotFound,
    ""
  ].join("\n");
  await withFakeSecurityScript(body, async (binDir) => {
    const recordFile = path.join(binDir, "record.json");
    const callsDir = path.join(binDir, "calls");
    mkdirSync(callsDir);
    const keychain = {
      get calls() {
        return readdirSync(callsDir)
          .sort((a, b) => Number(a) - Number(b))
          .map(name => ({
            argv: readFileSync(path.join(callsDir, name, "argv"), "utf8").split("\0").slice(0, -1),
            stdin: readFileSync(path.join(callsDir, name, "stdin"), "utf8")
          }));
      },
      read: () => JSON.parse(readFileSync(recordFile, "utf8")),
      setWriteFailure: (exitCode) => exitCode === undefined ? rmSync(path.join(binDir, "write-failure"), { force: true }) : writeFileSync(path.join(binDir, "write-failure"), String(exitCode)),
      write: (record) => writeFileSync(recordFile, JSON.stringify(record))
    };
    keychain.write(initialRecord);
    await run(keychain);
  });
}

// Stands in for the macOS keychain: `find-generic-password` matches on
// service+account, an omitted `-a` matches the first item registered for the
// service (as the real Keychain picks an arbitrary one), and `dump-keychain`
// prints the metadata-only listing the provider parses.
export async function withFakeSecurityKeychain(items, run) {
  await withFakeSecurityScript(fakeSecurityBody(items), run);
}

export function fakeSecurityBody(items) {
  const dump = [
    ...items.map(item => [
      `keychain: "/tmp/login.keychain-db"`,
      "version: 512",
      "class: \"genp\"",
      "attributes:",
      `    "acct"<blob>="${item.account}"`,
      `    "mdat"<timedate>=0x00  "${item.modified}Z\\000"`,
      `    "svce"<blob>="${item.service}"`
    ].join("\n")),
    [
      `keychain: "/tmp/login.keychain-db"`,
      "attributes:",
      `    "acct"<blob>="unrelated"`,
      `    "svce"<blob>="Bitwarden Safe Storage"`
    ].join("\n")
  ].join("\n");

  // `accountlessLookup: false` models an item the Keychain will not return for
  // a `-s`-only query, so only enumeration can reach it.
  const firstForService = new Map();
  for (const item of items) {
    if (item.accountlessLookup !== false && !firstForService.has(item.service)) {
      firstForService.set(item.service, item);
    }
  }
  const branches = [
    ...items.map((item, index) => ({ key: `${item.service}|${item.account}`, record: item.record, tag: `LLMR_J${index}` })),
    ...[...firstForService.values()].map((item, index) => ({ key: `${item.service}|`, record: item.record, tag: `LLMR_A${index}` }))
  ];

  return [
    `if [ "$1" = "dump-keychain" ]; then`,
    `cat <<'LLMR_DUMP'`,
    dump,
    "LLMR_DUMP",
    "exit 0",
    "fi",
    "shift",
    "acct=''",
    "svc=''",
    "while [ $# -gt 0 ]; do",
    `  case "$1" in`,
    `    -a) acct="$2"; shift 2 ;;`,
    `    -s) svc="$2"; shift 2 ;;`,
    "    *) shift ;;",
    "  esac",
    "done",
    `case "$svc|$acct" in`,
    ...branches.map(branch => [
      `"${branch.key}")`,
      `cat <<'${branch.tag}'`,
      JSON.stringify(branch.record),
      branch.tag,
      "exit 0 ;;"
    ].join("\n")),
    "esac",
    keychainNotFound
  ].join("\n");
}

export async function withEnv(name, value, run) {
  const previous = process.env[name];
  process.env[name] = value;
  try {
    await run();
  } finally {
    restoreEnv(name, previous);
  }
}

export function writeClaudeCredentials(home, credentials) {
  const directory = path.join(home, ".claude");
  const credentialFile = path.join(directory, ".credentials.json");
  mkdirSync(directory, { recursive: true });
  writeFileSync(credentialFile, JSON.stringify(credentials, null, 2));
  return credentialFile;
}

export function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
