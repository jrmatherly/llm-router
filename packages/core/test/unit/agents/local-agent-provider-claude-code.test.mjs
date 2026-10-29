import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { claudeCodeAccessTokenExpired, claudeCodeCandidate, importClaudeCodeProvider, readClaudeCodeOauth } from "@llmr/core/agents/local-providers/claude-code.ts";
import { createDefaultAppConfig } from "@llmr/core/config/default-config.ts";
import { compileCoreGatewayConfig } from "@llmr/core/gateway/core-runtime/config-compiler.ts";
import { createGatewayPlugin } from "@llmr/core/gateway/core-runtime/local-agent-auth-provider-hook.ts";

test("Claude Code local provider prefers macOS Keychain credentials over stale file credentials", { skip: process.platform === "win32" }, async () => {
  await withClaudeCodeHome(async (home) => {
    await withPlatform("darwin", async () => {
      await withFakeSecurityOutput({
        claudeAiOauth: {
          accessToken: "keychain-access-token",
          refreshToken: "keychain-refresh-token"
        }
      }, async () => {
        writeClaudeCredentials(home, {
          access_token: "stale-file-access-token",
          refresh_token: "stale-file-refresh-token"
        });

        const candidate = claudeCodeCandidate();
        assert.equal(candidate.status, "available");
        assert.equal(candidate.importable, true);
        assert.equal(candidate.sourceFile, `keychain:Claude Code-credentials (${keychainAccount})`);

        const result = importClaudeCodeProvider(candidate, []);
        assert.equal(result.providerPlugins[0].auth.headers.authorization, "Bearer keychain-access-token");
        assert.equal(result.providerPlugins[1].auth.headers.authorization, "Bearer keychain-access-token");
      });
    });
  });
});

test("Claude Code local provider falls back to file credentials when Keychain is unavailable", { skip: process.platform === "win32" }, async () => {
  await withClaudeCodeHome(async (home) => {
    await withPlatform("darwin", async () => {
      await withFakeSecurityFailure(async () => {
        const credentialFile = writeClaudeCredentials(home, {
          accessToken: "file-access-token",
          refreshToken: "file-refresh-token"
        });

        const candidate = claudeCodeCandidate();
        assert.equal(candidate.status, "available");
        assert.equal(candidate.importable, true);
        assert.equal(candidate.sourceFile, credentialFile);
        assert.deepEqual(readClaudeCodeOauth().store, { container: "root", kind: "file", path: credentialFile, refreshable: true });

        const result = importClaudeCodeProvider(candidate, []);
        assert.equal(result.providerPlugins[0].auth.headers.authorization, "Bearer file-access-token");
      });
    });
  });
});

test("Core gateway config replaces imported Claude Code OAuth token with live macOS Keychain token", { skip: process.platform === "win32" }, async () => {
  await withClaudeCodeHome(async (home) => {
    await withPlatform("darwin", async () => {
      await withFakeSecurityOutput({
        access_token: "keychain-runtime-token",
        refresh_token: "keychain-refresh-token"
      }, async () => {
        assert.equal(readClaudeCodeOauth().store.container, "root");
        const config = createDefaultAppConfig();
        config.providerPlugins = [
          {
            auth: {
              headers: {
                authorization: "Bearer imported-stale-token",
                "anthropic-beta": "oauth-2025-04-20"
              },
              removeHeaders: ["x-api-key"],
              strict: true
            },
            key: "llmr-local-agent-claude-code-api-claude-code-oauth",
            providerName: "Claude Code API"
          }
        ];
        config.Providers = [
          {
            api_base_url: "https://api.anthropic.com",
            id: "claude-code-api",
            models: ["claude-sonnet-5"],
            name: "Claude Code API",
            type: "anthropic_messages"
          }
        ];

        const compiled = await compileCoreGatewayConfig(config, "raw-trace-token", "billing-usage-token", "core-auth-token");
        const plugin = compiled.providerPlugins.find((item) => item.key === "llmr-local-agent-claude-code-api-claude-code-oauth");

        assert.equal(plugin.auth, undefined);
        const livePlugin = compiled.plugins.find((item) => item.key === "llmr-local-agent-auth-provider-hooks");
        const [hook] = createGatewayPlugin({ plugin: livePlugin }).providerHooks;
        const result = await hook.authenticate({
          upstreamRequest: { url: "https://api.anthropic.com/v1/messages", method: "POST", headers: { "x-api-key": "old" }, body: {} }
        });
        assert.equal(result.ok, true);
        assert.equal(result.value.headers.authorization, "Bearer keychain-runtime-token");
        assert.equal(result.value.headers["x-api-key"], undefined);
        assert.match(result.value.headers["anthropic-beta"], /oauth-2025-04-20/);
      });
    });
  });
});

// Claude Code >= 2.1 writes the credential item under the current $USER and
// leaves any pre-2.1 item (account "unknown") in place on the same service
// name. A lookup without `-a` matches the stale one, which only carries MCP
// plugin OAuth. See musistudio/claude-code-router#1601.
test("Claude Code local provider reads the credential item stored under the current account", { skip: process.platform === "win32" }, async () => {
  await withClaudeCodeHome(async () => {
    await withPlatform("darwin", async () => {
      await withFakeSecurityKeychain([
        {
          account: "unknown",
          modified: "20260604091803",
          record: { mcpOAuth: { "plugin:github|1": { expiresAt: 1 } } },
          service: "Claude Code-credentials"
        },
        {
          account: keychainAccount,
          modified: "20260729042837",
          record: { claudeAiOauth: { accessToken: "live-access-token", refreshToken: "live-refresh-token" } },
          service: "Claude Code-credentials"
        }
      ], async () => {
        const candidate = claudeCodeCandidate();
        assert.equal(candidate.status, "available");
        assert.equal(candidate.importable, true);
        assert.equal(candidate.sourceFile, `keychain:Claude Code-credentials (${keychainAccount})`);

        const result = importClaudeCodeProvider(candidate, []);
        assert.equal(result.providerPlugins[0].auth.headers.authorization, "Bearer live-access-token");
      });
    });
  });
});

// The only path to an item written under a different account (a login made as
// another user, or a $USER that has since changed) is `security dump-keychain`
// enumeration; the expected-name lookup cannot reach it.
test("Claude Code local provider enumerates the keychain to find an item under another account", { skip: process.platform === "win32" }, async () => {
  await withClaudeCodeHome(async () => {
    await withPlatform("darwin", async () => {
      await withFakeSecurityKeychain([
        {
          account: "other-user",
          modified: "20260729042837",
          record: { claudeAiOauth: { accessToken: "enumerated-access-token" } },
          service: "Claude Code-credentials",
          accountlessLookup: false
        }
      ], async () => {
        const candidate = claudeCodeCandidate();
        assert.equal(candidate.status, "available");
        assert.equal(candidate.importable, true);
        assert.equal(candidate.sourceFile, "keychain:Claude Code-credentials (other-user)");

        const result = importClaudeCodeProvider(candidate, []);
        assert.equal(result.providerPlugins[0].auth.headers.authorization, "Bearer enumerated-access-token");
      });
    });
  });
});

// mcpOAuth holds per-plugin tokens that are not Anthropic API credentials;
// importing one yields a provider that 401s on every request.
test("Claude Code local provider ignores mcpOAuth plugin tokens in favour of claudeAiOauth", { skip: process.platform === "win32" }, async () => {
  await withClaudeCodeHome(async () => {
    await withPlatform("darwin", async () => {
      await withFakeSecurityKeychain([
        {
          account: keychainAccount,
          modified: "20260729042837",
          record: {
            mcpOAuth: { "plugin:github|1": { accessToken: "mcp-plugin-token", refreshToken: "mcp-plugin-refresh" } },
            claudeAiOauth: { accessToken: "live-access-token", refreshToken: "live-refresh-token" }
          },
          service: "Claude Code-credentials"
        }
      ], async () => {
        const result = importClaudeCodeProvider(claudeCodeCandidate(), []);
        assert.equal(result.providerPlugins[0].auth.headers.authorization, "Bearer live-access-token");
      });
    });
  });
});

// Regression for the review on #1604: an mcpOAuth-only record must yield no
// token at all, not a plugin token demoted to a fallback.
test("Claude Code local provider does not import an mcpOAuth-only keychain token", { skip: process.platform === "win32" }, async () => {
  await withClaudeCodeHome(async () => {
    await withPlatform("darwin", async () => {
      await withFakeSecurityKeychain([
        {
          account: keychainAccount,
          modified: "20260729042837",
          record: {
            mcpOAuth: {
              "plugin:github|1": {
                accessToken: "mcp-plugin-token",
                refreshToken: "mcp-plugin-refresh"
              }
            }
          },
          service: "Claude Code-credentials"
        }
      ], async () => {
        const candidate = claudeCodeCandidate();

        assert.equal(candidate.status, "locked");
        assert.equal(candidate.importable, false);
        assert.match(candidate.detail, /no OAuth token/);
        assert.match(candidate.detail, /mcpOAuth/);
        assert.throws(
          () => importClaudeCodeProvider(candidate, []),
          /Claude Code access token was not found/
        );
      });
    });
  });
});

// An mcpOAuth-only keychain record must not short-circuit the file fallback.
test("Claude Code local provider prefers file credentials over an mcpOAuth-only keychain token", { skip: process.platform === "win32" }, async () => {
  await withClaudeCodeHome(async (home) => {
    await withPlatform("darwin", async () => {
      await withFakeSecurityKeychain([
        {
          account: keychainAccount,
          modified: "20260729042837",
          record: {
            mcpOAuth: {
              "plugin:github|1": {
                accessToken: "mcp-plugin-token",
                refreshToken: "mcp-plugin-refresh"
              }
            }
          },
          service: "Claude Code-credentials"
        }
      ], async () => {
        const credentialFile = writeClaudeCredentials(home, {
          accessToken: "file-access-token",
          refreshToken: "file-refresh-token"
        });

        const candidate = claudeCodeCandidate();

        assert.equal(candidate.status, "available");
        assert.equal(candidate.importable, true);
        assert.equal(candidate.sourceFile, credentialFile);

        const result = importClaudeCodeProvider(candidate, []);
        assert.equal(result.providerPlugins[0].auth.headers.authorization, "Bearer file-access-token");
      });
    });
  });
});

// With CLAUDE_CONFIG_DIR set, Claude Code appends the first 8 hex of
// sha256(NFC(configDir)) to the service name.
test("Claude Code local provider reads the config-dir-suffixed keychain service", { skip: process.platform === "win32" }, async () => {
  await withClaudeCodeHome(async (home) => {
    await withPlatform("darwin", async () => {
      const configDir = path.join(home, "alt-claude");
      const suffix = createHash("sha256").update(configDir.normalize("NFC")).digest("hex").slice(0, 8);
      const service = `Claude Code-credentials-${suffix}`;
      await withEnv("CLAUDE_CONFIG_DIR", configDir, async () => {
        await withFakeSecurityKeychain([
          {
            account: keychainAccount,
            modified: "20260729042837",
            record: { claudeAiOauth: { accessToken: "suffixed-access-token" } },
            service
          }
        ], async () => {
          const candidate = claudeCodeCandidate();
          assert.equal(candidate.status, "available");
          assert.equal(candidate.sourceFile, `keychain:${service} (${keychainAccount})`);
        });
      });
    });
  });
});

test("Claude Code local provider explains login state that carries no OAuth token", { skip: process.platform === "win32" }, async () => {
  await withClaudeCodeHome(async () => {
    await withPlatform("darwin", async () => {
      await withFakeSecurityKeychain([
        {
          account: keychainAccount,
          modified: "20260729042837",
          record: { mcpOAuth: { "plugin:github|1": { expiresAt: 1 } } },
          service: "Claude Code-credentials"
        }
      ], async () => {
        const candidate = claudeCodeCandidate();
        assert.equal(candidate.status, "locked");
        assert.equal(candidate.importable, false);
        assert.match(candidate.detail, /no OAuth token/);
        assert.match(candidate.detail, /mcpOAuth/);
      });
    });
  });
});

// errSecItemNotFound is the ordinary logged-out answer: it must not be reported
// as an unreadable store.
test("Claude Code local provider reports a missing candidate when no keychain item exists", { skip: process.platform === "win32" }, async () => {
  await withClaudeCodeHome(async () => {
    await withPlatform("darwin", async () => {
      await withFakeSecurityKeychain([], async () => {
        const candidate = claudeCodeCandidate();
        assert.equal(candidate.status, "missing");
        assert.equal(candidate.importable, false);
        assert.equal(candidate.detail, "No local login state was found for this agent.");
      });
    });
  });
});

test("Claude Code local provider carries expiry, scopes and store from the keychain record", { skip: process.platform === "win32" }, async () => {
  await withClaudeCodeHome(async () => {
    await withPlatform("darwin", async () => {
      await withFakeKeychain({ claudeAiOauth: { accessToken: "a", refreshToken: "r", expiresAt: 1793249706961, refreshTokenExpiresAt: 1800000000000, scopes: ["user:inference"] }, mcpOAuth: {} }, async () => {
        const oauth = readClaudeCodeOauth();
        assert.equal(oauth.expiresAt, 1793249706961);
        assert.equal(oauth.refreshTokenExpiresAt, 1800000000000);
        assert.deepEqual(oauth.scopes, ["user:inference"]);
        assert.deepEqual(oauth.store, { account: keychainAccount, container: "claudeAiOauth", kind: "keychain", refreshable: true, service: "Claude Code-credentials" });
      });
    });
  });
});

test("Claude Code local provider marks a custom-oauth keychain item as not refreshable", { skip: process.platform === "win32" }, async () => {
  await withClaudeCodeHome(async () => {
    await withPlatform("darwin", async () => {
      await withEnv("CLAUDE_CODE_CUSTOM_OAUTH_URL", "https://auth.example.test", async () => {
        await withFakeKeychain({ claudeAiOauth: { accessToken: "a", expiresAt: "2026-10-28T00:00:00Z" } }, async () => {
          const oauth = readClaudeCodeOauth();
          assert.equal(oauth.expiresAt, undefined);
          assert.deepEqual(oauth.store, { account: keychainAccount, container: "claudeAiOauth", kind: "keychain", refreshable: false, service: "Claude Code-custom-oauth-credentials" });
        });
      });
    });
  });
});

test("claudeCodeAccessTokenExpired honors the 60 s margin, a missing expiresAt and a missing access token", () => {
  const now = Date.now();
  assert.equal(claudeCodeAccessTokenExpired({ accessToken: "a", expiresAt: now + 30_000 }), true);
  assert.equal(claudeCodeAccessTokenExpired({ accessToken: "a", expiresAt: now + 120_000 }), false);
  assert.equal(claudeCodeAccessTokenExpired({ accessToken: "a" }), false);
  assert.equal(claudeCodeAccessTokenExpired({ expiresAt: now + 120_000 }), true);
});

test("fake keychain records security -i writes and exposes the record", { skip: process.platform === "win32" }, async () => {
  await withFakeKeychain({ claudeAiOauth: { accessToken: "a" } }, async (keychain) => {
    execFileSync("security", ["-i"], { input: `add-generic-password -U -a "u" -s "Claude Code-credentials" -X ${Buffer.from("{\"x\":1}").toString("hex")}\n` });
    assert.deepEqual(keychain.read(), { x: 1 });
    assert.equal(keychain.calls.length, 1);
  });
});

test("fake keychain keeps the record and records the call when writes fail", { skip: process.platform === "win32" }, async () => {
  await withFakeKeychain({ x: 1 }, async (keychain) => {
    const hex = Buffer.from("{\"x\":2}").toString("hex");
    assert.throws(() => execFileSync("security", ["add-generic-password", "-U", "-a", "u", "-s", "s", "-X", hex]), { status: 7 });
    assert.deepEqual(keychain.read(), { x: 1 });
    assert.deepEqual(keychain.calls, [{ argv: ["add-generic-password", "-U", "-a", "u", "-s", "s", "-X", hex], stdin: "" }]);
  }, { writeExitCode: 7 });
});

test("fake keychain serves a record set by write() without recording a call", { skip: process.platform === "win32" }, async () => {
  await withFakeKeychain({ x: 1 }, async (keychain) => {
    keychain.write({ x: 3 });
    assert.deepEqual(keychain.read(), { x: 3 });
    assert.deepEqual(JSON.parse(execFileSync("security", ["find-generic-password", "-s", "s", "-w"], { encoding: "utf8" })), { x: 3 });
    assert.equal(keychain.calls.length, 0);
  });
});

async function withClaudeCodeHome(run) {
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

async function withPlatform(platform, run) {
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

async function withFakeSecurityOutput(output, run) {
  await withFakeSecurityScript(`cat <<'LLMR_KEYCHAIN_JSON'\n${JSON.stringify(output)}\nLLMR_KEYCHAIN_JSON\n`, run);
}

async function withFakeSecurityFailure(run) {
  await withFakeSecurityScript("exit 44\n", run);
}

// Pins $USER as well as PATH: the provider looks the keychain item up under the
// current account, so the expected item name has to be deterministic.
async function withFakeSecurityScript(body, run) {
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

const keychainAccount = "llmr-test-user";
const keychainNotFound = "echo 'security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.' >&2\nexit 44";

// One mutable item, whatever -a/-s say: refresh tests assert the write-back
// target through `calls`, not through separate records.
async function withFakeKeychain(initialRecord, run, options = {}) {
  const failWrite = options.writeExitCode === undefined ? "" : `exit ${options.writeExitCode}\n`;
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
async function withFakeSecurityKeychain(items, run) {
  await withFakeSecurityScript(fakeSecurityBody(items), run);
}

function fakeSecurityBody(items) {
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

async function withEnv(name, value, run) {
  const previous = process.env[name];
  process.env[name] = value;
  try {
    await run();
  } finally {
    restoreEnv(name, previous);
  }
}

function writeClaudeCredentials(home, credentials) {
  const directory = path.join(home, ".claude");
  const credentialFile = path.join(directory, ".credentials.json");
  mkdirSync(directory, { recursive: true });
  writeFileSync(credentialFile, JSON.stringify(credentials, null, 2));
  return credentialFile;
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
