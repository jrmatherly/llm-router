import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  claudeCodeAccessTokenExpired,
  claudeCodeCandidate,
  claudeCodeTokenEndpoint,
  importClaudeCodeProvider,
  readClaudeCodeOauth,
  resetClaudeCodeAuthStateForTest,
  resolveClaudeCodeAuth,
  resolveClaudeCodeAuthOrStored,
  writeClaudeCodeStoreRecord
} from "@llmr/core/agents/local-providers/claude-code.ts";
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

        const result = await importClaudeCodeProvider(candidate, []);
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
          expires_at: 1793249706961,
          refreshToken: "file-refresh-token"
        });

        const candidate = claudeCodeCandidate();
        assert.equal(candidate.status, "available");
        assert.equal(candidate.importable, true);
        assert.equal(candidate.sourceFile, credentialFile);
        const oauth = readClaudeCodeOauth();
        assert.deepEqual(oauth.store, { container: "root", kind: "file", path: credentialFile, refreshable: true });
        assert.equal(oauth.expiresAt, undefined);

        const result = await importClaudeCodeProvider(candidate, []);
        assert.equal(result.providerPlugins[0].auth.headers.authorization, "Bearer file-access-token");
      });
    });
  });
});

test("Core gateway config replaces imported Claude Code OAuth token with live macOS Keychain token", { skip: process.platform === "win32" }, async () => {
  await withClaudeCodeHome(async () => {
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

        const result = await importClaudeCodeProvider(candidate, []);
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

        const result = await importClaudeCodeProvider(candidate, []);
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
        const result = await importClaudeCodeProvider(claudeCodeCandidate(), []);
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
        await assert.rejects(
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

        const result = await importClaudeCodeProvider(candidate, []);
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

test("Claude Code local provider never marks a file login refreshable while CLAUDE_CODE_CUSTOM_OAUTH_URL is set", { skip: process.platform === "win32" }, async () => {
  await withClaudeCodeHome(async (home) => {
    await withPlatform("darwin", async () => {
      await withEnv("CLAUDE_CODE_CUSTOM_OAUTH_URL", "https://auth.example.test", async () => {
        await withFakeSecurityFailure(async () => {
          const credentialFile = writeClaudeCredentials(home, { claudeAiOauth: { accessToken: "a", refreshToken: "r", scopes: [] } });
          const oauth = readClaudeCodeOauth();
          assert.equal(oauth.scopes, undefined);
          assert.deepEqual(oauth.store, { container: "claudeAiOauth", kind: "file", path: credentialFile, refreshable: false });
        });
      });
    });
  });
});

test("Claude Code local provider marks an accountless keychain read as not refreshable", { skip: process.platform === "win32" }, async () => {
  await withClaudeCodeHome(async () => {
    await withPlatform("darwin", async () => {
      const record = JSON.stringify({ claudeAiOauth: { accessToken: "a", refreshToken: "r" } });
      const body = [
        `if [ "$1" = "dump-keychain" ]; then exit 44; fi`,
        `for arg in "$@"; do if [ "$arg" = "-a" ]; then ${keychainNotFound}; fi; done`,
        `cat <<'LLMR_ACCOUNTLESS'`,
        record,
        "LLMR_ACCOUNTLESS",
        ""
      ].join("\n");
      await withFakeSecurityScript(body, async () => {
        const oauth = readClaudeCodeOauth();
        assert.equal(oauth.store.account, undefined);
        assert.equal(oauth.store.refreshable, false);
        assert.equal(oauth.store.service, "Claude Code-credentials");
      });
    });
  });
});

test("Claude Code local provider marks a keychain item whose account the safe pattern rejects as not refreshable", { skip: process.platform === "win32" }, async () => {
  await withClaudeCodeHome(async () => {
    await withPlatform("darwin", async () => {
      await withFakeSecurityKeychain([
        {
          account: "other user",
          modified: "20260729042837",
          record: { claudeAiOauth: { accessToken: "a", refreshToken: "r" } },
          service: "Claude Code-credentials",
          accountlessLookup: false
        }
      ], async () => {
        const oauth = readClaudeCodeOauth();
        assert.equal(oauth.store.account, "other user");
        assert.equal(oauth.store.refreshable, false);
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

test("Claude Code local provider refreshes an expired access token with a JSON body", { skip: process.platform === "win32" }, async (t) => {
  await withKeychainLogin({ accessToken: "expired", refreshToken: "r1", expiresAt: Date.now() - 1, scopes: ["user:inference", "user:profile"] }, async () => {
    stubTokenEndpoint(t, (input, init) => {
      assert.equal(String(input), testTokenEndpoint);
      assert.equal(init.headers["content-type"], "application/json");
      assert.deepEqual(JSON.parse(init.body), {
        client_id: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
        grant_type: "refresh_token",
        refresh_token: "r1",
        scope: "user:inference user:profile"
      });
      return jsonResponse(200, { access_token: "fresh", expires_in: 3600, refresh_token: "r2", refresh_token_expires_in: 86400, scope: "user:inference" });
    });
    const auth = await resolveClaudeCodeAuth();
    assert.equal(auth.accessToken, "fresh");
    assert.equal(auth.refreshToken, "r2");
    assert.ok(auth.expiresAt > Date.now() + 3_500_000);
    assert.ok(auth.refreshTokenExpiresAt > Date.now() + 86_000_000);
    assert.deepEqual(auth.scopes, ["user:inference"]);
  });
});

test("Claude Code local provider keeps the refresh token, refresh expiry and scopes and drops the expiry when the response omits them", { skip: process.platform === "win32" }, async (t) => {
  await withKeychainLogin({ accessToken: "expired", refreshToken: "r1", expiresAt: Date.now() - 1, refreshTokenExpiresAt: 1800000000000, scopes: ["user:inference"] }, async () => {
    const endpoint = stubTokenEndpoint(t, () => jsonResponse(200, { access_token: "fresh" }));
    const auth = await resolveClaudeCodeAuth();
    assert.equal(auth.accessToken, "fresh");
    assert.equal(auth.expiresAt, undefined);
    assert.equal(auth.refreshToken, "r1");
    assert.equal(auth.refreshTokenExpiresAt, 1800000000000);
    assert.deepEqual(auth.scopes, ["user:inference"]);
    assert.equal(auth.store.service, "Claude Code-credentials");
    assert.equal((await resolveClaudeCodeAuth()).accessToken, "fresh");
    assert.equal(endpoint.calls, 1);
  });
});

test("Claude Code local provider serves the cached fresh pair instead of posting the consumed refresh token again", { skip: process.platform === "win32" }, async (t) => {
  await withKeychainLogin({ accessToken: "expired", refreshToken: "r1", expiresAt: Date.now() - 1 }, async () => {
    const endpoint = stubTokenEndpoint(t, () => jsonResponse(200, { access_token: "fresh", expires_in: 3600, refresh_token: "r2" }));
    assert.equal((await resolveClaudeCodeAuth()).accessToken, "fresh");
    assert.equal((await resolveClaudeCodeAuth()).accessToken, "fresh");
    assert.equal(endpoint.calls, 1);
  });
});

test("Claude Code local provider refreshes an expired cached pair with the cached refresh token", { skip: process.platform === "win32" }, async (t) => {
  await withKeychainLogin({ accessToken: "expired", refreshToken: "r1", expiresAt: Date.now() - 1 }, async () => {
    const posted = [];
    const endpoint = stubTokenEndpoint(t, (_input, init) => {
      posted.push(JSON.parse(init.body).refresh_token);
      return posted.length === 1
        ? jsonResponse(200, { access_token: "fresh", expires_in: 0, refresh_token: "r2" })
        : jsonResponse(200, { access_token: "fresher", expires_in: 3600, refresh_token: "r3" });
    });
    assert.equal((await resolveClaudeCodeAuth()).accessToken, "fresh");
    const second = await resolveClaudeCodeAuth();
    assert.equal(second.accessToken, "fresher");
    assert.equal(second.refreshToken, "r3");
    assert.equal(endpoint.calls, 2);
    assert.deepEqual(posted, ["r1", "r2"]);
    assert.equal((await resolveClaudeCodeAuth()).accessToken, "fresher");
    assert.equal(endpoint.calls, 2);
  });
});

test("Claude Code local provider adopts a peer-rotated token on 400 invalid_grant", { skip: process.platform === "win32" }, async (t) => {
  await withKeychainLogin({ accessToken: "expired", refreshToken: "r1", expiresAt: Date.now() - 1 }, async (keychain) => {
    stubTokenEndpoint(t, () => {
      keychain.write({ claudeAiOauth: { accessToken: "peer", expiresAt: Date.now() + 3_600_000, refreshToken: "r3" } });
      return jsonResponse(400, { error: "invalid_grant" });
    });
    assert.equal((await resolveClaudeCodeAuth()).accessToken, "peer");
  });
});

test("Claude Code local provider surfaces a rejected refresh and does not post that token again", { skip: process.platform === "win32" }, async (t) => {
  await withKeychainLogin({ accessToken: "expired", refreshToken: "r1", expiresAt: Date.now() - 1 }, async () => {
    const warn = t.mock.method(console, "warn", () => {});
    const endpoint = stubTokenEndpoint(t, () => jsonResponse(401, { error: "invalid_grant", error_description: "secret detail" }));
    await assert.rejects(resolveClaudeCodeAuth(), (error) => error.name === "ClaudeCodeRefreshAuthError" && error.status === 401 && error.code === "invalid_grant");
    await assert.rejects(resolveClaudeCodeAuth(), (error) => error.name === "ClaudeCodeRefreshAuthError" && !error.message.includes("secret detail"));
    assert.equal(endpoint.calls, 1);
    assert.equal(warn.mock.callCount(), 1);
    assert.doesNotMatch(String(warn.mock.calls[0].arguments[0]), /r1|secret detail/);
  });
});

test("Claude Code local provider retries after a refresh failure that is not a rejection", { skip: process.platform === "win32" }, async (t) => {
  await withKeychainLogin({ accessToken: "expired", refreshToken: "r1", expiresAt: Date.now() - 1 }, async () => {
    const endpoint = stubTokenEndpoint(t, () => jsonResponse(503, {}));
    await assert.rejects(resolveClaudeCodeAuth(), (error) => error.name === "Error");
    await assert.rejects(resolveClaudeCodeAuth(), (error) => error.name === "Error");
    assert.equal(endpoint.calls, 2);
  });
});

test("Claude Code local provider coalesces concurrent refreshes", { skip: process.platform === "win32" }, async (t) => {
  await withKeychainLogin({ accessToken: "expired", refreshToken: "r1", expiresAt: Date.now() - 1 }, async () => {
    const endpoint = stubTokenEndpoint(t, () => jsonResponse(200, { access_token: "fresh", expires_in: 3600, refresh_token: "r2" }));
    const [first, second] = await Promise.all([resolveClaudeCodeAuth(), resolveClaudeCodeAuth()]);
    assert.equal(first.accessToken, "fresh");
    assert.equal(second.accessToken, "fresh");
    assert.equal(endpoint.calls, 1);
  });
});

test("Claude Code local provider does not refresh a token that is still valid", { skip: process.platform === "win32" }, async (t) => {
  await withKeychainLogin({ accessToken: "valid", refreshToken: "r1", expiresAt: Date.now() + 3_600_000 }, async () => {
    stubTokenEndpoint(t, () => {
      throw new Error("refresh must not be called");
    });
    assert.equal((await resolveClaudeCodeAuth()).accessToken, "valid");
  });
});

test("Claude Code local provider never refreshes an unrefreshable store", { skip: process.platform === "win32" }, async (t) => {
  await withClaudeCodeHome(async () => {
    await withPlatform("darwin", async () => {
      const expiresAt = Date.now() - 1;
      const record = JSON.stringify({ claudeAiOauth: { accessToken: "a", expiresAt, refreshToken: "r" } });
      const body = [
        `if [ "$1" = "dump-keychain" ]; then exit 44; fi`,
        `for arg in "$@"; do if [ "$arg" = "-a" ]; then ${keychainNotFound}; fi; done`,
        `cat <<'LLMR_ACCOUNTLESS'`,
        record,
        "LLMR_ACCOUNTLESS",
        ""
      ].join("\n");
      await withFakeSecurityScript(body, async () => {
        stubTokenEndpoint(t, () => {
          throw new Error("refresh must not be called");
        });
        const auth = await resolveClaudeCodeAuth();
        assert.equal(auth.accessToken, "a");
        assert.equal(auth.expiresAt, expiresAt);
        assert.equal(auth.store.refreshable, false);
      });
    });
  });
});

test("refreshed Claude Code tokens are written to the keychain through security -i in Claude Code's own shape", { skip: process.platform === "win32" }, async (t) => {
  const originalRecord = {
    claudeAiOauth: { accessToken: "expired", expiresAt: Date.now() - 1, refreshToken: "r1", scopes: ["user:inference", "user:profile"], subscriptionType: "max" },
    mcpOAuth: { "plugin:github|1": { accessToken: "mcp-plugin-token", refreshToken: "mcp-plugin-refresh" } }
  };
  await withClaudeCodeHome(async () => {
    await withPlatform("darwin", async () => {
      await withFakeKeychain(originalRecord, async (keychain) => {
        stubTokenEndpoint(t, () => jsonResponse(200, { access_token: "fresh", expires_in: 3600, refresh_token: "r2", refresh_token_expires_in: 86400, scope: "user:inference" }));
        await resolveClaudeCodeAuth();
        const [call] = keychain.calls;
        assert.deepEqual(call.argv, ["-i"]);
        assert.match(call.stdin, /^add-generic-password -U -a "[^"]+" -s "Claude Code-credentials" -X [0-9a-f]+\n$/);
        const written = keychain.read();
        assert.equal(written.claudeAiOauth.accessToken, "fresh");
        assert.equal(written.claudeAiOauth.refreshToken, "r2");
        assert.equal(written.claudeAiOauth.subscriptionType, "max");
        assert.ok(written.claudeAiOauth.refreshTokenExpiresAt > Date.now());
        assert.deepEqual(written.claudeAiOauth.scopes, ["user:inference"]);
        assert.deepEqual(written.mcpOAuth, originalRecord.mcpOAuth);
      });
    });
  });
});

test("a keychain record over the stdin limit is written on argv", { skip: process.platform === "win32" }, async (t) => {
  await withClaudeCodeHome(async () => {
    await withPlatform("darwin", async () => {
      await withFakeKeychain({ claudeAiOauth: { accessToken: "expired", expiresAt: Date.now() - 1, refreshToken: "r1" }, mcpOAuth: { padding: "x".repeat(2100) } }, async (keychain) => {
        t.mock.method(console, "warn", () => {});
        stubTokenEndpoint(t, () => jsonResponse(200, { access_token: "fresh", expires_in: 3600, refresh_token: "r2" }));
        await resolveClaudeCodeAuth();
        const [call] = keychain.calls;
        assert.equal(call.argv[0], "add-generic-password");
        assert.equal(call.stdin, "");
        assert.equal(keychain.read().claudeAiOauth.refreshToken, "r2");
        assert.equal(keychain.read().mcpOAuth.padding.length, 2100);
      });
    });
  });
});

test("a keychain record over the stdin limit warns once that it went through argv", { skip: process.platform === "win32" }, async (t) => {
  await withClaudeCodeHome(async () => {
    await withPlatform("darwin", async () => {
      await withFakeKeychain({ claudeAiOauth: { accessToken: "expired", expiresAt: Date.now() - 1, refreshToken: "r1" }, mcpOAuth: { padding: "x".repeat(2100) } }, async (keychain) => {
        const warnings = [];
        t.mock.method(console, "warn", (message) => warnings.push(String(message)));
        stubTokenEndpoint(t, () => jsonResponse(200, { access_token: "fresh", expires_in: 3600, refresh_token: "r2" }));
        keychain.setWriteFailure(51);
        await resolveClaudeCodeAuth();
        keychain.setWriteFailure(undefined);
        const now = Date.now() + 60_001;
        t.mock.method(Date, "now", () => now);
        await resolveClaudeCodeAuth();
        assert.equal(keychain.calls.length, 2);
        assert.equal(keychain.read().claudeAiOauth.refreshToken, "r2");
        const argvWarnings = warnings.filter((line) => /security -i stdin limit/.test(line));
        assert.deepEqual(argvWarnings, [`Claude Code login record exceeds the security -i stdin limit; written through argv, where ps can read it until the write returns (keychain:Claude Code-credentials (${keychainAccount}))`]);
        assert.doesNotMatch(warnings.join("\n"), /fresh|r2|[0-9a-f]{40}/);
      });
    });
  });
});

test("a keychain write that hangs is a failed write after the timeout", { skip: process.platform === "win32" }, async (t) => {
  await withEnv("LLMR_CLAUDE_CODE_KEYCHAIN_WRITE_TIMEOUT_MS", "500", async () => {
    await withClaudeCodeHome(async () => {
      await withPlatform("darwin", async () => {
        await withFakeKeychain({ claudeAiOauth: { accessToken: "expired", expiresAt: Date.now() - 1, refreshToken: "r1" } }, async (keychain) => {
          const warnings = [];
          t.mock.method(console, "warn", (message) => warnings.push(String(message)));
          stubTokenEndpoint(t, () => jsonResponse(200, { access_token: "fresh", expires_in: 3600, refresh_token: "r2" }));
          const started = Date.now();
          assert.equal((await resolveClaudeCodeAuth()).accessToken, "fresh");
          const elapsed = Date.now() - started;
          assert.ok(elapsed >= 500 && elapsed < 2_000, `write returned after ${elapsed} ms`);
          assert.equal(warnings.length, 1);
          assert.match(warnings[0], /\(security timed out\)$/);
          assert.equal(keychain.read().claudeAiOauth.refreshToken, "r1");
          assert.equal((await resolveClaudeCodeAuth()).accessToken, "fresh");
          assert.equal(keychain.calls.length, 1);
        }, { writeDelaySeconds: 2 });
      });
    });
  });
});

test("the write-failure warning re-arms after a successful write", { skip: process.platform === "win32" }, async (t) => {
  await withClaudeCodeHome(async () => {
    await withPlatform("darwin", async () => {
      await withFakeKeychain({ claudeAiOauth: { accessToken: "expired", expiresAt: Date.now() - 1, refreshToken: "r1" } }, async (keychain) => {
        const warnings = [];
        t.mock.method(console, "warn", (message) => warnings.push(String(message)));
        stubTokenEndpoint(t, () => jsonResponse(200, { access_token: "fresh", expires_in: 3600, refresh_token: "r2" }));
        keychain.setWriteFailure(51);
        await resolveClaudeCodeAuth();
        assert.equal(warnings.length, 1);
        keychain.setWriteFailure(undefined);
        const now = Date.now() + 60_001;
        t.mock.method(Date, "now", () => now);
        await resolveClaudeCodeAuth();
        assert.equal(keychain.read().claudeAiOauth.refreshToken, "r2");
        keychain.write({ claudeAiOauth: { accessToken: "expired", expiresAt: now - 1, refreshToken: "r5" } });
        keychain.setWriteFailure(51);
        await resolveClaudeCodeAuth();
        assert.equal(warnings.length, 2);
        assert.equal(warnings[1], `Claude Code login could not be written back to keychain:Claude Code-credentials (${keychainAccount}) (security exited 51)`);
      });
    });
  });
});

test("the keychain writer refuses an unsafe account or service name", { skip: process.platform === "win32" }, async () => {
  await withFakeKeychain({ claudeAiOauth: {} }, async (keychain) => {
    const store = { account: keychainAccount, container: "claudeAiOauth", kind: "keychain", refreshable: true, service: "Claude Code-credentials\"" };
    assert.throws(() => writeClaudeCodeStoreRecord(store, { claudeAiOauth: {} }), /not safe to write/);
    assert.throws(() => writeClaudeCodeStoreRecord({ ...store, account: "other user", service: "Claude Code-credentials" }, { claudeAiOauth: {} }), /not safe to write/);
    assert.equal(keychain.calls.length, 0);
  });
});

test("refreshed Claude Code tokens are written to .credentials.json atomically with mode 0600", { skip: process.platform === "win32" }, async (t) => {
  await withClaudeCodeHome(async (home) => {
    await withPlatform("darwin", async () => {
      await withFakeSecurityFailure(async () => {
        const credentialFile = writeClaudeCredentials(home, { claudeAiOauth: { accessToken: "expired", expiresAt: Date.now() - 1, refreshToken: "r1", subscriptionType: "pro" }, mcpOAuth: { keep: true } });
        stubTokenEndpoint(t, () => jsonResponse(200, { access_token: "fresh", expires_in: 3600, refresh_token: "r2" }));
        await resolveClaudeCodeAuth();
        const written = JSON.parse(readFileSync(credentialFile, "utf8"));
        assert.equal(written.claudeAiOauth.accessToken, "fresh");
        assert.equal(written.claudeAiOauth.refreshToken, "r2");
        assert.equal(written.claudeAiOauth.subscriptionType, "pro");
        assert.deepEqual(written.mcpOAuth, { keep: true });
        assert.equal(statSync(credentialFile).mode & 0o777, 0o600);
        assert.deepEqual(readdirSync(path.dirname(credentialFile)), [".credentials.json"]);
      });
    });
  });
});

test("a refreshed Claude Code token is not written over a pair a peer rotated meanwhile", { skip: process.platform === "win32" }, async (t) => {
  await withKeychainLogin({ accessToken: "expired", refreshToken: "r1", expiresAt: Date.now() - 1 }, async (keychain) => {
    stubTokenEndpoint(t, () => {
      keychain.write({ claudeAiOauth: { accessToken: "peer", expiresAt: Date.now() + 3_600_000, refreshToken: "r9" } });
      return jsonResponse(200, { access_token: "fresh", expires_in: 3600, refresh_token: "r2" });
    });
    const auth = await resolveClaudeCodeAuth();
    assert.equal(auth.accessToken, "peer");
    assert.equal(keychain.calls.length, 0);
    assert.equal((await resolveClaudeCodeAuth()).accessToken, "peer");
  });
});

test("a failed keychain write keeps the fresh pair, holds the write retry for 60 s and warns once", { skip: process.platform === "win32" }, async (t) => {
  await withClaudeCodeHome(async () => {
    await withPlatform("darwin", async () => {
      await withFakeKeychain({ claudeAiOauth: { accessToken: "expired", expiresAt: Date.now() - 1, refreshToken: "r1" } }, async (keychain) => {
        const warnings = [];
        t.mock.method(console, "warn", (message) => warnings.push(String(message)));
        const endpoint = stubTokenEndpoint(t, () => jsonResponse(200, { access_token: "fresh", expires_in: 3600, refresh_token: "r2" }));
        assert.equal((await resolveClaudeCodeAuth()).accessToken, "fresh");
        assert.equal((await resolveClaudeCodeAuth()).accessToken, "fresh");
        assert.equal(endpoint.calls, 1);
        assert.equal(keychain.calls.length, 1);
        const now = Date.now() + 60_001;
        t.mock.method(Date, "now", () => now);
        assert.equal((await resolveClaudeCodeAuth()).accessToken, "fresh");
        assert.equal(keychain.calls.length, 2);
        assert.equal(endpoint.calls, 1);
        assert.equal(warnings.length, 1);
        assert.equal(warnings[0], `Claude Code login could not be written back to keychain:Claude Code-credentials (${keychainAccount}) (security exited 51)`);
        assert.doesNotMatch(warnings[0], /fresh|r2|[0-9a-f]{40}/);
      }, { writeExitCode: 51 });
    });
  });
});

test("a written Claude Code pair is not written again on the next resolve", { skip: process.platform === "win32" }, async (t) => {
  await withKeychainLogin({ accessToken: "expired", refreshToken: "r1", expiresAt: Date.now() - 1 }, async (keychain) => {
    const endpoint = stubTokenEndpoint(t, () => jsonResponse(200, { access_token: "fresh", expires_in: 3600, refresh_token: "r2" }));
    assert.equal((await resolveClaudeCodeAuth()).accessToken, "fresh");
    assert.equal(keychain.calls.length, 1);
    assert.equal((await resolveClaudeCodeAuth()).accessToken, "fresh");
    assert.equal(keychain.calls.length, 1);
    assert.equal(endpoint.calls, 1);
  });
});

test("a chained refresh after a retried write keeps the compare-and-swap baseline on the store's token", { skip: process.platform === "win32" }, async (t) => {
  await withClaudeCodeHome(async () => {
    await withPlatform("darwin", async () => {
      await withFakeKeychain({ claudeAiOauth: { accessToken: "expired", expiresAt: Date.now() - 1, refreshToken: "r1" } }, async (keychain) => {
        t.mock.method(console, "warn", () => {});
        const posted = [];
        stubTokenEndpoint(t, (_input, init) => {
          posted.push(JSON.parse(init.body).refresh_token);
          return posted.length === 1
            ? jsonResponse(200, { access_token: "fresh", expires_in: 0, refresh_token: "r2" })
            : jsonResponse(200, { access_token: "fresher", expires_in: 3600, refresh_token: "r3" });
        });
        assert.equal((await resolveClaudeCodeAuth()).accessToken, "fresh");
        assert.equal((await resolveClaudeCodeAuth()).accessToken, "fresher");
        assert.equal((await resolveClaudeCodeAuth()).accessToken, "fresher");
        assert.deepEqual(posted, ["r1", "r2"]);
        assert.equal(keychain.read().claudeAiOauth.refreshToken, "r3");
      }, { failWrites: 1, writeExitCode: 51 });
    });
  });
});

test("a retry-persist by one caller during another caller's chained refresh converges on the newest pair", { skip: process.platform === "win32" }, async (t) => {
  await withClaudeCodeHome(async () => {
    await withPlatform("darwin", async () => {
      await withFakeKeychain({ claudeAiOauth: { accessToken: "expired", expiresAt: Date.now() - 1, refreshToken: "r1" } }, async (keychain) => {
        t.mock.method(console, "warn", () => {});
        const posted = [];
        let releaseSecondRefresh;
        const secondRefresh = new Promise((resolve) => {
          releaseSecondRefresh = resolve;
        });
        stubTokenEndpoint(t, async (_input, init) => {
          posted.push(JSON.parse(init.body).refresh_token);
          if (posted.length === 1) {
            return jsonResponse(200, { access_token: "fresh", expires_in: 0, refresh_token: "r2" });
          }
          await secondRefresh;
          return jsonResponse(200, { access_token: "fresher", expires_in: 3600, refresh_token: "r3" });
        });
        assert.equal((await resolveClaudeCodeAuth()).accessToken, "fresh");
        assert.equal(keychain.read().claudeAiOauth.refreshToken, "r1");
        const a = resolveClaudeCodeAuth();
        const now = Date.now() + 60_001;
        t.mock.method(Date, "now", () => now);
        const b = resolveClaudeCodeAuth();
        assert.equal(keychain.read().claudeAiOauth.refreshToken, "r2");
        releaseSecondRefresh();
        const [first, second] = await Promise.all([a, b]);
        assert.equal(first.accessToken, "fresher");
        assert.equal(second.accessToken, "fresher");
        assert.deepEqual(posted, ["r1", "r2"]);
        assert.equal(keychain.read().claudeAiOauth.refreshToken, "r3");
      }, { failWrites: 1, writeExitCode: 51 });
    });
  });
});

test("importing Claude Code refreshes an expired access token first", { skip: process.platform === "win32" }, async (t) => {
  await withKeychainLogin({ accessToken: "expired", refreshToken: "r1", expiresAt: Date.now() - 1 }, async () => {
    stubTokenEndpoint(t, () => jsonResponse(200, { access_token: "fresh", expires_in: 3600, refresh_token: "r2" }));
    const result = await importClaudeCodeProvider(claudeCodeCandidate(), []);
    assert.equal(result.providerPlugins[0].auth.headers.authorization, "Bearer fresh");
    assert.equal(result.providerPlugins[1].auth.headers.authorization, "Bearer fresh");
  });
});

test("importing Claude Code fails when the refresh token was rejected", { skip: process.platform === "win32" }, async (t) => {
  await withKeychainLogin({ accessToken: "expired", refreshToken: "r1", expiresAt: Date.now() - 1 }, async () => {
    t.mock.method(console, "warn", () => {});
    stubTokenEndpoint(t, () => jsonResponse(400, { error: "invalid_grant" }));
    await assert.rejects(importClaudeCodeProvider(claudeCodeCandidate(), []), (error) => error.name === "ClaudeCodeRefreshAuthError");
  });
});

test("resolveClaudeCodeAuthOrStored returns the stored pair after any refresh failure", { skip: process.platform === "win32" }, async (t) => {
  await withKeychainLogin({ accessToken: "expired", refreshToken: "r1", expiresAt: Date.now() - 1 }, async () => {
    t.mock.method(console, "warn", () => {});
    stubTokenEndpoint(t, () => jsonResponse(503, {}));
    assert.equal((await resolveClaudeCodeAuthOrStored()).accessToken, "expired");
    resetClaudeCodeAuthStateForTest();
    stubTokenEndpoint(t, () => jsonResponse(401, { error: "invalid_grant" }));
    assert.equal((await resolveClaudeCodeAuthOrStored()).accessToken, "expired");
    await assert.rejects(resolveClaudeCodeAuth(), (error) => error.name === "ClaudeCodeRefreshAuthError");
  });
});

test("Claude Code candidate is locked when the access token expired and no refresh token can renew it", { skip: process.platform === "win32" }, async () => {
  await withKeychainLogin({ accessToken: "expired", expiresAt: Date.now() - 1 }, async () => {
    const candidate = claudeCodeCandidate();
    assert.equal(candidate.status, "locked");
    assert.equal(candidate.importable, false);
    assert.equal(candidate.detail, "Claude Code access token is expired and the login has no refresh token. Run `claude /login`, then retry.");
  });
});

test("Claude Code candidate stays available for an expired access token with a refresh token", { skip: process.platform === "win32" }, async () => {
  await withKeychainLogin({ accessToken: "expired", refreshToken: "r1", expiresAt: Date.now() - 1 }, async () => {
    assert.equal(claudeCodeCandidate().status, "available");
  });
});

test("Claude Code candidate is locked when the access token expired on a login LLMR cannot refresh", { skip: process.platform === "win32" }, async () => {
  await withKeychainLogin({ accessToken: "expired", refreshToken: "r1", expiresAt: Date.now() - 1 }, async () => {
    await withEnv("CLAUDE_CODE_CUSTOM_OAUTH_URL", "https://auth.example.test", async () => {
      const candidate = claudeCodeCandidate();
      assert.equal(candidate.status, "locked");
      assert.equal(candidate.importable, false);
      assert.equal(candidate.detail, "Claude Code access token is expired and LLMR cannot refresh this login. Run `claude /login`, then retry.");
    });
  });
});

test("Claude Code candidate without an access token stays locked, but the resolver refreshes it", { skip: process.platform === "win32" }, async (t) => {
  await withKeychainLogin({ refreshToken: "r1" }, async () => {
    const candidate = claudeCodeCandidate();
    assert.equal(candidate.status, "locked");
    assert.equal(candidate.detail, "Claude Code login was detected, but no usable access token was found.");
    stubTokenEndpoint(t, () => jsonResponse(200, { access_token: "fresh", expires_in: 3600, refresh_token: "r2" }));
    assert.equal((await resolveClaudeCodeAuth()).accessToken, "fresh");
  });
});

test("the token endpoint override is honoured only for loopback hosts", (t) => {
  const previous = process.env.LLMR_CLAUDE_CODE_OAUTH_TOKEN_ENDPOINT;
  t.after(() => restoreEnv("LLMR_CLAUDE_CODE_OAUTH_TOKEN_ENDPOINT", previous));
  process.env.LLMR_CLAUDE_CODE_OAUTH_TOKEN_ENDPOINT = "https://evil.example/token";
  assert.equal(claudeCodeTokenEndpoint(), "https://platform.claude.com/v1/oauth/token");
  process.env.LLMR_CLAUDE_CODE_OAUTH_TOKEN_ENDPOINT = "http://[::1]:8080/token";
  assert.equal(claudeCodeTokenEndpoint(), "http://[::1]:8080/token");
});

const testTokenEndpoint = "http://127.0.0.1/claude/oauth/token";

async function withKeychainLogin(claudeAiOauth, run) {
  await withClaudeCodeHome(async () => {
    await withPlatform("darwin", async () => {
      await withFakeKeychain({ claudeAiOauth }, run);
    });
  });
}

function stubTokenEndpoint(t, respond) {
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

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status });
}

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
