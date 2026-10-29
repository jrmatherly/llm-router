import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import test from "node:test";
import {
  claudeCodeCandidate,
  importClaudeCodeProvider,
  readClaudeCodeOauth,
  resolveClaudeCodeAuth
} from "@llmr/core/agents/local-providers/claude-code.ts";
import { createDefaultAppConfig } from "@llmr/core/config/default-config.ts";
import { compileCoreGatewayConfig } from "@llmr/core/gateway/core-runtime/config-compiler.ts";
import { createGatewayPlugin } from "@llmr/core/gateway/core-runtime/local-agent-auth-provider-hook.ts";
import {
  jsonResponse,
  keychainAccount,
  keychainNotFound,
  stubTokenEndpoint,
  withClaudeCodeHome,
  withEnv,
  withFakeKeychain,
  withFakeSecurityFailure,
  withFakeSecurityKeychain,
  withFakeSecurityOutput,
  withFakeSecurityScript,
  withKeychainLogin,
  withPlatform,
  writeClaudeCredentials
} from "../../support/claude-code-keychain.mjs";

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

test("importing Claude Code fails on a transient refresh failure instead of importing the stale token", { skip: process.platform === "win32" }, async (t) => {
  await withKeychainLogin({ accessToken: "expired", refreshToken: "r1", expiresAt: Date.now() - 1 }, async () => {
    t.mock.method(console, "warn", () => {});
    stubTokenEndpoint(t, () => jsonResponse(503, {}));
    await assert.rejects(importClaudeCodeProvider(claudeCodeCandidate(), []), (error) => error.name !== "ClaudeCodeRefreshAuthError" && /HTTP 503/.test(error.message));
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
