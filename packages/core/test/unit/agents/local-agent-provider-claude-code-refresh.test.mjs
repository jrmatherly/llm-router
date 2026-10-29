import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  claudeCodeAccessTokenExpired,
  claudeCodeTokenEndpoint,
  resetClaudeCodeAuthStateForTest,
  resolveClaudeCodeAuth,
  resolveClaudeCodeAuthOrStored,
  writeClaudeCodeStoreRecord
} from "@llmr/core/agents/local-providers/claude-code.ts";
import {
  jsonResponse,
  keychainAccount,
  keychainNotFound,
  restoreEnv,
  stubTokenEndpoint,
  testTokenEndpoint,
  withClaudeCodeHome,
  withEnv,
  withFakeKeychain,
  withFakeSecurityFailure,
  withFakeSecurityScript,
  withKeychainLogin,
  withPlatform,
  writeClaudeCredentials
} from "../../support/claude-code-keychain.mjs";

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

test("the token endpoint override is honoured only for loopback hosts", (t) => {
  const previous = process.env.LLMR_CLAUDE_CODE_OAUTH_TOKEN_ENDPOINT;
  t.after(() => restoreEnv("LLMR_CLAUDE_CODE_OAUTH_TOKEN_ENDPOINT", previous));
  process.env.LLMR_CLAUDE_CODE_OAUTH_TOKEN_ENDPOINT = "https://evil.example/token";
  assert.equal(claudeCodeTokenEndpoint(), "https://platform.claude.com/v1/oauth/token");
  process.env.LLMR_CLAUDE_CODE_OAUTH_TOKEN_ENDPOINT = "http://[::1]:8080/token";
  assert.equal(claudeCodeTokenEndpoint(), "http://[::1]:8080/token");
});
