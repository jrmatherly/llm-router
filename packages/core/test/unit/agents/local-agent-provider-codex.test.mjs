import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  attachCodexRateLimitResetCreditDetails,
  CodexRefreshAuthError,
  codexDefaultBaseUrl,
  codexModelCatalogFromPayloadForTest,
  codexProviderAccountConfig,
  codexRateLimitResetCreditDetails,
  normalizeCodexProviderAccountConfig,
  readCodexLocalModelCatalog,
  resolveCodexAuth
} from "@llmr/core/agents/local-providers/codex.ts";
import { localAgentProviderApiKey } from "@llmr/core/agents/local-providers/shared.ts";
import { CONFIGDIR } from "@llmr/core/config/constants.ts";

const codexEnvKeys = ["CODEX_HOME", "CODEX_REFRESH_TOKEN_URL_OVERRIDE", "HOME", "LLMR_INTERNAL_HOME_DIR", "USERPROFILE"];

function jwt(payload) {
  return [
    base64url({ alg: "none", typ: "JWT" }),
    base64url(payload),
    ""
  ].join(".");
}

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function accessToken(lifetimeSeconds, scp = ["openid", "api.connectors.read", "api.connectors.invoke"]) {
  return jwt({ exp: Math.floor(Date.now() / 1000) + lifetimeSeconds, scp });
}

function nextRefreshToken(token) {
  const match = /^r(\d+)$/.exec(token);
  return match ? `r${Number(match[1]) + 1}` : `${token}-next`;
}

async function codexFixture(t, { lifetimeSeconds = 3600, onRequest } = {}) {
  const saved = Object.fromEntries(codexEnvKeys.map((key) => [key, process.env[key]]));
  const home = mkdtempSync(path.join(os.tmpdir(), "llmr-codex-auth-"));
  const codexDir = path.join(home, ".codex");
  mkdirSync(codexDir, { recursive: true });
  const requests = [];
  const seen = new Set();
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", async () => {
      const payload = JSON.parse(body);
      requests.push({ ...payload, path: request.url });
      const send = (status, value) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify(value));
      };
      const override = await onRequest?.(payload);
      if (override) {
        send(override.status, override.body);
        return;
      }
      if (seen.has(payload.refresh_token)) {
        send(400, { error: "refresh_token_reused" });
        return;
      }
      seen.add(payload.refresh_token);
      send(200, {
        access_token: accessToken(lifetimeSeconds),
        id_token: jwt({ "https://api.openai.com/auth": { chatgpt_account_id: "acct-1" }, rotated: payload.refresh_token }),
        refresh_token: nextRefreshToken(payload.refresh_token)
      });
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.LLMR_INTERNAL_HOME_DIR = home;
  process.env.CODEX_REFRESH_TOKEN_URL_OVERRIDE = `${origin}/oauth/token`;
  delete process.env.CODEX_HOME;
  t.after(async () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    await new Promise((resolve) => server.close(resolve));
    chmodSync(codexDir, 0o700);
    rmSync(home, { force: true, recursive: true });
  });
  const authFile = path.join(codexDir, "auth.json");
  return {
    authFile,
    codexDir,
    home,
    lockFile: (file = authFile) => path.join(CONFIGDIR, "locks", `codex-auth-${createHash("sha256").update(file).digest("hex").slice(0, 16)}.lock`),
    origin,
    readAuth: (file = authFile) => JSON.parse(readFileSync(file, "utf8")),
    requests,
    seed: (login = {}, file = authFile) => writeFileSync(file, `${JSON.stringify(chatgptLogin(login), null, 2)}\n`),
    seen
  };
}

function chatgptLogin({ expiresIn = -10, refreshToken = "r0", tokens = {}, ...rest } = {}) {
  return {
    agent_identity: { name: "kept" },
    auth_mode: "chatgpt",
    made_up_key: [1, 2, 3],
    tokens: {
      access_token: accessToken(expiresIn),
      account_id: "acct-1",
      id_token: jwt({ "https://api.openai.com/auth": { chatgpt_account_id: "acct-1" } }),
      refresh_token: refreshToken,
      ...tokens
    },
    ...rest
  };
}

test("two expiries send the first token, then the rotated one", async (t) => {
  const codex = await codexFixture(t, { lifetimeSeconds: 30 });
  codex.seed();

  await resolveCodexAuth();
  await resolveCodexAuth();

  assert.deepEqual(codex.requests.map((request) => request.refresh_token), ["r0", "r1"]);
});

test("the rotated login is saved to auth.json", async (t) => {
  const codex = await codexFixture(t);
  codex.seed();
  const before = codex.readAuth();

  const auth = await resolveCodexAuth();

  const after = codex.readAuth();
  assert.equal(after.tokens.refresh_token, "r1");
  assert.equal(after.tokens.access_token, auth.accessToken);
  assert.notEqual(after.tokens.access_token, before.tokens.access_token);
  assert.notEqual(after.tokens.id_token, before.tokens.id_token);
  assert.equal(after.tokens.id_token, auth.idToken);
  assert.ok(Number.isFinite(Date.parse(after.last_refresh)));
  assert.deepEqual(after.agent_identity, before.agent_identity);
  assert.deepEqual(after.made_up_key, before.made_up_key);
  assert.equal(after.auth_mode, "chatgpt");
  assert.equal(after.tokens.account_id, "acct-1");
  if (process.platform !== "win32") {
    assert.equal(statSync(codex.authFile).mode & 0o777, 0o600);
  }
});

test("concurrent callers share one refresh", async (t) => {
  const codex = await codexFixture(t, { lifetimeSeconds: 30 });
  codex.seed();

  const results = await Promise.all(Array.from({ length: 10 }, () => resolveCodexAuth()));

  assert.equal(codex.requests.length, 1);
  assert.ok(results.every((auth) => auth.refreshToken === "r1"));
});

test("a second process waits for the lock", async (t) => {
  const codex = await codexFixture(t);
  codex.seed();
  const lockFile = codex.lockFile();
  mkdirSync(path.dirname(lockFile), { recursive: true });
  writeFileSync(lockFile, JSON.stringify({ pid: 999999, timestamp: Date.now() }));
  t.after(() => rmSync(lockFile, { force: true }));
  setTimeout(() => {
    codex.seed({ expiresIn: 3600, refreshToken: "rp" });
    rmSync(lockFile, { force: true });
  }, 300);

  const auth = await resolveCodexAuth();

  assert.equal(auth.refreshToken, "rp");
  assert.equal(codex.requests.length, 0);
});

test("a stale lock is taken over", async (t) => {
  const codex = await codexFixture(t);
  codex.seed();
  const lockFile = codex.lockFile();
  mkdirSync(path.dirname(lockFile), { recursive: true });
  const staleAt = Date.now() - 60_000;
  writeFileSync(lockFile, JSON.stringify({ pid: 999999, timestamp: staleAt }));
  utimesSync(lockFile, staleAt / 1000, staleAt / 1000);
  t.after(() => rmSync(lockFile, { force: true }));

  const auth = await resolveCodexAuth();

  assert.equal(auth.refreshToken, "r1");
  assert.equal(codex.requests.length, 1);
  assert.equal(existsSync(lockFile), false);
  assert.deepEqual(readdirSync(path.dirname(lockFile)).filter((name) => name.startsWith(path.basename(lockFile))), []);
});

test("releasing the lock leaves another holder's lock in place", async (t) => {
  let codex;
  const foreignLock = JSON.stringify({ nonce: "another-holder", pid: 999999, timestamp: Date.now() });
  codex = await codexFixture(t, {
    onRequest: () => {
      writeFileSync(codex.lockFile(), foreignLock);
    }
  });
  codex.seed();
  t.after(() => rmSync(codex.lockFile(), { force: true }));

  await resolveCodexAuth();

  assert.equal(readFileSync(codex.lockFile(), "utf8"), foreignLock);
});

test("a login saved by a peer during the request wins", async (t) => {
  let codex;
  codex = await codexFixture(t, {
    onRequest: () => {
      codex.seed({ expiresIn: 3600, refreshToken: "rp" });
    }
  });
  codex.seed();

  const auth = await resolveCodexAuth();

  assert.equal(codex.requests.length, 1);
  assert.equal(codex.readAuth().tokens.refresh_token, "rp");
  assert.equal(auth.refreshToken, "rp");
});

test("a rejected refresh adopts a peer's login", async (t) => {
  let codex;
  codex = await codexFixture(t, {
    onRequest: () => {
      codex.seed({ expiresIn: 3600, refreshToken: "rp" });
      return { body: { error: "refresh_token_reused" }, status: 400 };
    }
  });
  codex.seed();

  const auth = await resolveCodexAuth();

  assert.equal(auth.refreshToken, "rp");
  assert.equal(auth.accessToken, codex.readAuth().tokens.access_token);
  assert.equal(codex.requests.length, 1);
});

test("a rejected refresh with no peer throws CodexRefreshAuthError", async (t) => {
  const codex = await codexFixture(t);
  codex.seed();
  codex.seen.add("r0");

  await assert.rejects(resolveCodexAuth(), CodexRefreshAuthError);
  assert.equal(codex.readAuth().tokens.refresh_token, "r0");
});

test("a symbolic link is never refreshed", async (t) => {
  if (process.platform === "win32") {
    t.skip("symbolic links need extra rights on Windows");
    return;
  }
  const codex = await codexFixture(t);
  const target = path.join(codex.home, "real-auth.json");
  codex.seed({}, target);
  symlinkSync(target, codex.authFile);
  const targetBefore = readFileSync(target, "utf8");

  const auth = await resolveCodexAuth();

  assert.equal(auth.refreshToken, "r0");
  assert.equal(codex.requests.length, 0);
  assert.ok(lstatSync(codex.authFile).isSymbolicLink());
  assert.equal(readlinkSync(codex.authFile), target);
  assert.equal(readFileSync(target, "utf8"), targetBefore);
});

test("an unwritable directory is never refreshed", async (t) => {
  if (process.platform === "win32" || process.getuid?.() === 0) {
    t.skip("directory modes do not stop this user from writing");
    return;
  }
  const codex = await codexFixture(t);
  codex.seed();
  chmodSync(codex.codexDir, 0o500);

  const auth = await resolveCodexAuth();

  assert.equal(auth.refreshToken, "r0");
  assert.equal(codex.requests.length, 0);
});

test("a missing auth.json is not created", async (t) => {
  const codex = await codexFixture(t);

  assert.equal(await resolveCodexAuth(), undefined);
  assert.equal(existsSync(codex.authFile), false);
  assert.equal(codex.requests.length, 0);
});

test("an API-key login is never refreshed", async (t) => {
  const codex = await codexFixture(t);
  for (const login of [
    chatgptLogin({ auth_mode: "apikey" }),
    { ...chatgptLogin(), auth_mode: undefined, OPENAI_API_KEY: "sk-test" }
  ]) {
    writeFileSync(codex.authFile, JSON.stringify(login));
    const before = readFileSync(codex.authFile, "utf8");

    await resolveCodexAuth();

    assert.equal(readFileSync(codex.authFile, "utf8"), before);
  }
  assert.equal(codex.requests.length, 0);
});

test("an externally managed login is never refreshed", async (t) => {
  const codex = await codexFixture(t);
  codex.seed({ auth_mode: "chatgptAuthTokens" });
  const before = readFileSync(codex.authFile, "utf8");

  await resolveCodexAuth();

  assert.equal(codex.requests.length, 0);
  assert.equal(readFileSync(codex.authFile, "utf8"), before);
});

test("CODEX_HOME moves the file", async (t) => {
  const codex = await codexFixture(t);
  const codexHome = path.join(codex.home, "elsewhere");
  mkdirSync(codexHome);
  process.env.CODEX_HOME = codexHome;
  const authFile = path.join(codexHome, "auth.json");
  codex.seed({}, authFile);
  writeFileSync(path.join(codexHome, "models_cache.json"), JSON.stringify({ models: [{ slug: "gpt-codex-home" }] }));

  const auth = await resolveCodexAuth();

  assert.equal(auth.sourceFile, authFile);
  assert.equal(codex.readAuth(authFile).tokens.refresh_token, "r1");
  assert.equal(existsSync(codex.authFile), false);
  assert.ok(readCodexLocalModelCatalog().models.includes("gpt-codex-home"));
});

test("a keyring store disables refresh", async (t) => {
  const codex = await codexFixture(t);
  const configFile = path.join(codex.codexDir, "config.toml");
  codex.seed();
  writeFileSync(configFile, 'model = "gpt-5-codex"\ncli_auth_credentials_store = "keyring"\n');

  assert.equal((await resolveCodexAuth()).refreshToken, "r0");
  assert.equal(codex.requests.length, 0);

  writeFileSync(configFile, 'model = "gpt-5-codex"\n\n[profiles.x]\ncli_auth_credentials_store = "keyring"\n');

  assert.equal((await resolveCodexAuth()).refreshToken, "r1");
  assert.equal(codex.requests.length, 1);
});

test("a file store still refreshes", async (t) => {
  const codex = await codexFixture(t);
  codex.seed();
  writeFileSync(path.join(codex.codexDir, "config.toml"), 'cli_auth_credentials_store = "file"\n');

  assert.equal((await resolveCodexAuth()).refreshToken, "r1");
  assert.equal(codex.requests.length, 1);
});

test("the refresh goes to the login's own issuer", async (t) => {
  const codex = await codexFixture(t);
  delete process.env.CODEX_REFRESH_TOKEN_URL_OVERRIDE;
  codex.seed({ tokens: { oauth_provenance: { client_id: "client-x", issuer: codex.origin } } });

  await resolveCodexAuth();

  assert.equal(codex.requests.length, 1);
  assert.equal(codex.requests[0].client_id, "client-x");
  assert.equal(codex.requests[0].path, "/oauth/token");
  assert.equal(codex.requests[0].grant_type, "refresh_token");
  assert.ok(!("scope" in codex.requests[0]));
});

test("a fresh token makes no request", async (t) => {
  const codex = await codexFixture(t);
  codex.seed({ expiresIn: 3600 });

  assert.equal((await resolveCodexAuth()).refreshToken, "r0");
  assert.equal(codex.requests.length, 0);
});

test("a token missing the connector scopes makes no request", async (t) => {
  const codex = await codexFixture(t);
  codex.seed({ tokens: { access_token: accessToken(3600, ["openid"]) } });

  assert.equal((await resolveCodexAuth()).refreshToken, "r0");
  assert.equal(codex.requests.length, 0);
});

test("a refresh response without an id_token keeps the file's id_token", async (t) => {
  const codex = await codexFixture(t, {
    onRequest: () => ({ body: { access_token: accessToken(3600), refresh_token: "r1" }, status: 200 })
  });
  codex.seed();
  const idToken = codex.readAuth().tokens.id_token;

  const auth = await resolveCodexAuth();

  assert.equal(codex.readAuth().tokens.refresh_token, "r1");
  assert.equal(codex.readAuth().tokens.id_token, idToken);
  assert.equal(auth.idToken, idToken);
});

test("a 401 from the token endpoint throws CodexRefreshAuthError", async (t) => {
  const codex = await codexFixture(t, {
    onRequest: () => ({ body: { error: "invalid_grant" }, status: 401 })
  });
  codex.seed();

  await assert.rejects(resolveCodexAuth(), CodexRefreshAuthError);
});

test("a 401 from the token endpoint adopts a peer's login", async (t) => {
  let codex;
  codex = await codexFixture(t, {
    onRequest: () => {
      codex.seed({ expiresIn: 3600, refreshToken: "rp" });
      return { body: { error: "invalid_grant" }, status: 401 };
    }
  });
  codex.seed();

  const auth = await resolveCodexAuth();

  assert.equal(auth.refreshToken, "rp");
  assert.equal(codex.requests.length, 1);
});

test("a failed save keeps the rotated login in memory and warns once without a token", async (t) => {
  if (process.platform === "win32" || process.getuid?.() === 0) {
    t.skip("directory modes do not stop this user from writing");
    return;
  }
  let codex;
  codex = await codexFixture(t, {
    lifetimeSeconds: 30,
    onRequest: () => {
      chmodSync(codex.codexDir, 0o500);
    }
  });
  codex.seed();
  const original = codex.readAuth().tokens.access_token;
  const warn = t.mock.method(console, "warn", () => {});

  const first = await resolveCodexAuth();
  chmodSync(codex.codexDir, 0o700);
  await resolveCodexAuth();

  assert.equal(first.refreshToken, "r1");
  assert.deepEqual(codex.requests.map((request) => request.refresh_token), ["r0", "r1"]);
  assert.equal(warn.mock.callCount(), 1);
  const message = String(warn.mock.calls[0].arguments[0]);
  assert.ok(!message.includes(first.accessToken) && !message.includes(original));
});

test("a login deleted during the refresh is not recreated", async (t) => {
  let codex;
  codex = await codexFixture(t, {
    onRequest: () => {
      unlinkSync(codex.authFile);
    }
  });
  codex.seed();
  const warn = t.mock.method(console, "warn", () => {});

  assert.equal(await resolveCodexAuth(), undefined);
  assert.equal(existsSync(codex.authFile), false);
  assert.equal(warn.mock.callCount(), 0);
});

test("CODEX_REFRESH_TOKEN_URL_OVERRIDE wins over the login's issuer", async (t) => {
  const codex = await codexFixture(t);
  const closed = http.createServer();
  await new Promise((resolve) => closed.listen(0, "127.0.0.1", resolve));
  const closedOrigin = `http://127.0.0.1:${closed.address().port}`;
  await new Promise((resolve) => closed.close(resolve));
  codex.seed({ tokens: { oauth_provenance: { issuer: closedOrigin } } });

  assert.equal((await resolveCodexAuth()).refreshToken, "r1");
  assert.equal(codex.requests.length, 1);
});

test("a read-only auth.json is never refreshed", async (t) => {
  if (process.platform === "win32" || process.getuid?.() === 0) {
    t.skip("file modes do not stop this user from writing");
    return;
  }
  const codex = await codexFixture(t);
  codex.seed();
  chmodSync(codex.authFile, 0o400);

  assert.equal((await resolveCodexAuth()).refreshToken, "r0");
  assert.equal(codex.requests.length, 0);
});

test("a login with another credential and no auth_mode is never refreshed", async (t) => {
  const codex = await codexFixture(t);
  for (const credential of [
    { personal_access_token: "pat-test" },
    { bedrock_api_key: "bedrock-test" },
    { bedrock_access_keys: { access_key_id: "id", secret_access_key: "secret" } }
  ]) {
    writeFileSync(codex.authFile, JSON.stringify({ ...chatgptLogin(), auth_mode: undefined, ...credential }));

    assert.equal((await resolveCodexAuth()).refreshToken, "r0");
  }
  assert.equal(codex.requests.length, 0);
});

test("an empty CODEX_HOME falls back to ~/.codex", async (t) => {
  const codex = await codexFixture(t);
  process.env.CODEX_HOME = "";
  codex.seed();

  const auth = await resolveCodexAuth();

  assert.equal(auth.sourceFile, codex.authFile);
  assert.equal(codex.readAuth().tokens.refresh_token, "r1");
});

test("Codex provider account config includes manual reset meter", () => {
  const config = codexProviderAccountConfig();
  const usageConnector = config.connectors.find((connector) => connector.type === "http-json" && connector.endpoint.endsWith("/wham/usage"));
  assert.ok(usageConnector);

  const meters = usageConnector.mapping.meters;
  const manualResetMeter = meters.find((meter) => meter.id === "codex_manual_resets");
  assert.ok(manualResetMeter);
  assert.equal(manualResetMeter.label, "Manual resets");
  assert.equal(manualResetMeter.unit, "resets");
  assert.equal(manualResetMeter.window, "manual-reset");
  assert.ok(Array.isArray(manualResetMeter.remaining));
  assert.ok(manualResetMeter.remaining.includes("$.resetsAvailable"));
  assert.ok(manualResetMeter.remaining.includes("$.availableRateLimitResetCount"));
  assert.ok(manualResetMeter.remaining.includes("$.rate_limit_reset_credits.available_count"));
  assert.ok(manualResetMeter.remaining.includes("$.rate_limit.manual_resets.remaining"));
  assert.equal(manualResetMeter.remaining.at(-1), 0);
  assert.ok(Array.isArray(manualResetMeter.resetAt));
  assert.ok(manualResetMeter.resetAt.includes("$.resetExpires"));
  assert.ok(manualResetMeter.resetAt.includes("$.expires_at"));
  assert.ok(manualResetMeter.resetAt.includes("$.rate_limit.manual_resets.expires_at"));
  assert.ok(manualResetMeter.resetAt.includes("$.manual_resets.reset_at"));

  const resetCreditsConnector = config.connectors.find((connector) => connector.type === "http-json" && connector.endpoint.endsWith("/wham/rate-limit-reset-credits"));
  assert.ok(resetCreditsConnector);
  const resetCreditsMeter = resetCreditsConnector.mapping.meters.find((meter) => meter.id === "codex_manual_resets");
  assert.ok(resetCreditsMeter);
  assert.deepEqual(resetCreditsMeter.remaining, ["$.available_count", "$.rate_limit_reset_credits.available_count", 0]);
});

test("Codex quota meters accept reset_at and resets_at usage shapes", () => {
  const config = codexProviderAccountConfig();
  const usageConnector = config.connectors.find((connector) => connector.type === "http-json" && connector.endpoint.endsWith("/wham/usage"));
  const primaryQuota = usageConnector.mapping.meters.find((meter) => meter.id === "codex_primary_quota");
  const secondaryQuota = usageConnector.mapping.meters.find((meter) => meter.id === "codex_secondary_quota");

  assert.ok(Array.isArray(primaryQuota.resetAt));
  assert.ok(primaryQuota.resetAt.includes("$.rate_limit.primary_window.reset_at"));
  assert.ok(primaryQuota.resetAt.includes("$.rate_limit.primary_window.resets_at"));
  assert.ok(primaryQuota.resetAt.includes("$.rate_limits.primary.resets_at"));
  assert.ok(Array.isArray(secondaryQuota.resetAt));
  assert.ok(secondaryQuota.resetAt.includes("$.rate_limit.secondary_window.reset_at"));
  assert.ok(secondaryQuota.resetAt.includes("$.rate_limit.secondary_window.resets_at"));
  assert.ok(secondaryQuota.resetAt.includes("$.rate_limits.secondary.resets_at"));
});

test("Codex local provider account config upgrades persisted usage mapping", () => {
  const oldAccount = JSON.parse(JSON.stringify(codexProviderAccountConfig()));
  oldAccount.refreshIntervalMs = 45000;
  const usageConnector = oldAccount.connectors.find((connector) => connector.type === "http-json" && connector.endpoint.endsWith("/wham/usage"));
  const manualResetMeter = usageConnector.mapping.meters.find((meter) => meter.id === "codex_manual_resets");
  manualResetMeter.remaining = manualResetMeter.remaining.filter((path) => path !== "$.rate_limit_reset_credits.available_count");

  const provider = normalizeCodexProviderAccountConfig({
    account: oldAccount,
    api_base_url: codexDefaultBaseUrl,
    api_key: localAgentProviderApiKey,
    models: ["gpt-5-codex"],
    name: "Codex API",
    protocol: "openai_responses"
  });

  const upgradedUsageConnector = provider.account.connectors.find((connector) => connector.type === "http-json" && connector.endpoint.endsWith("/wham/usage"));
  const upgradedResetCreditsConnector = provider.account.connectors.find((connector) => connector.type === "http-json" && connector.endpoint.endsWith("/wham/rate-limit-reset-credits"));
  const upgradedManualResetMeter = upgradedUsageConnector.mapping.meters.find((meter) => meter.id === "codex_manual_resets");
  assert.equal(provider.account.refreshIntervalMs, 45000);
  assert.ok(upgradedResetCreditsConnector);
  assert.ok(upgradedManualResetMeter.remaining.includes("$.rate_limit_reset_credits.available_count"));
});

test("Codex local provider config preserves imported GPT-5 context metadata", () => {
  const provider = normalizeCodexProviderAccountConfig({
    api_base_url: codexDefaultBaseUrl,
    api_key: localAgentProviderApiKey,
    modelMetadata: {
      "custom-model": {
        contextWindow: 64000,
        maxContextWindow: 64000
      },
      "gpt-5-codex": {
        contextWindow: 640000,
        maxContextWindow: 720000
      },
      "gpt-5.6-sol": {
        contextWindow: 1050000,
        maxContextWindow: 1050000
      }
    },
    models: ["gpt-5-codex", "gpt-5.5", "gpt-5.6-sol", "custom-model"],
    name: "Codex API",
    protocol: "openai_responses"
  });

  assert.deepEqual(provider.modelMetadata["gpt-5-codex"], {
    contextWindow: 640000,
    maxContextWindow: 720000
  });
  assert.equal(provider.modelMetadata["gpt-5.5"], undefined);
  assert.deepEqual(provider.modelMetadata["gpt-5.6-sol"], {
    contextWindow: 1050000,
    maxContextWindow: 1050000
  });
  assert.deepEqual(provider.modelMetadata["custom-model"], {
    contextWindow: 64000,
    maxContextWindow: 64000
  });

  const nonLocal = normalizeCodexProviderAccountConfig({
    api_base_url: codexDefaultBaseUrl,
    api_key: "real-api-key",
    modelMetadata: {
      "gpt-5.6-sol": {
        contextWindow: 1050000,
        maxContextWindow: 1050000
      }
    },
    models: ["gpt-5.6-sol"],
    name: "OpenAI",
    protocol: "openai_responses"
  });

  assert.deepEqual(nonLocal.modelMetadata["gpt-5.6-sol"], {
    contextWindow: 1050000,
    maxContextWindow: 1050000
  });
});

test("Codex local provider config preserves pinned context metadata", () => {
  const provider = normalizeCodexProviderAccountConfig({
    api_base_url: codexDefaultBaseUrl,
    api_key: localAgentProviderApiKey,
    modelMetadata: {
      "gpt-5-codex": {
        contextWindow: 1000000,
        contextWindowPinned: true,
        maxContextWindow: 1000000
      }
    },
    models: ["gpt-5-codex"],
    name: "Codex API",
    protocol: "openai_responses"
  });

  assert.deepEqual(provider.modelMetadata["gpt-5-codex"], {
    contextWindow: 1000000,
    contextWindowPinned: true,
    maxContextWindow: 1000000
  });
});

test("Codex reset credit details include available effective and expiry times", () => {
  const details = codexRateLimitResetCreditDetails({
    rate_limit_reset_credits: {
      credits: [
        {
          effective_at: "2026-07-03T00:00:00Z",
          expires_at: "2026-07-10T00:00:00Z",
          id: "reset-1",
          status: "available"
        },
        {
          effectiveAt: "2026-07-04T00:00:00Z",
          expiresAt: "2026-07-11T00:00:00Z",
          id: "reset-2",
          status: "available"
        },
        {
          effective_at: "2026-06-01T00:00:00Z",
          expires_at: "2026-06-08T00:00:00Z",
          id: "reset-expired",
          status: "expired"
        }
      ]
    }
  });

  assert.deepEqual(details.map((detail) => detail.id), ["reset-1", "reset-2"]);
  assert.equal(details[0].effectiveAt, "2026-07-03T00:00:00.000Z");
  assert.equal(details[0].expiresAt, "2026-07-10T00:00:00.000Z");
});

test("Codex reset credit details support reset credits endpoint shape", () => {
  const details = codexRateLimitResetCreditDetails({
    available_count: 2,
    credits: [
      {
        description: "Reset all Codex limits.",
        expires_at: "2026-08-02T00:00:00Z",
        id: "reset-root-1",
        start_date: "2026-07-03T00:00:00Z",
        status: "available",
        title: "Usage reset"
      },
      {
        expires_at: "2026-07-20T00:00:00Z",
        id: "reset-used",
        start_date: "2026-06-20T00:00:00Z",
        status: "used",
        title: "Used reset"
      }
    ]
  });

  assert.equal(details.length, 1);
  assert.equal(details[0].id, "reset-root-1");
  assert.equal(details[0].label, "Usage reset");
  assert.equal(details[0].description, "Reset all Codex limits.");
  assert.equal(details[0].redeemable, true);
  assert.equal(details[0].effectiveAt, "2026-07-03T00:00:00.000Z");
  assert.equal(details[0].expiresAt, "2026-08-02T00:00:00.000Z");
});

test("Codex reset credit details attach to manual reset meter", () => {
  const meters = attachCodexRateLimitResetCreditDetails([
    {
      id: "codex_manual_resets",
      kind: "requests",
      label: "Manual resets",
      remaining: 1,
      source: "http-json",
      unit: "resets",
      window: "manual-reset"
    }
  ], {
    rate_limit_reset_credits: {
      credits: [
        {
          effective_at: "2026-07-03T00:00:00Z",
          expires_at: "2026-07-10T00:00:00Z",
          id: "reset-1",
          status: "available"
        }
      ]
    }
  });

  assert.equal(meters[0].details.length, 1);
  assert.equal(meters[0].details[0].id, "reset-1");
  assert.equal(meters[0].resetAt, "2026-07-10T00:00:00.000Z");
});

test("Codex local provider account config keeps custom connectors", () => {
  const account = {
    connectors: [
      {
        auth: "none",
        endpoint: "https://example.com/account",
        mapping: {
          meters: [
            {
              id: "custom",
              kind: "balance",
              label: "Custom",
              remaining: "$.balance",
              unit: "credits"
            }
          ]
        },
        type: "http-json"
      }
    ],
    enabled: true
  };

  const provider = normalizeCodexProviderAccountConfig({
    account,
    api_base_url: codexDefaultBaseUrl,
    api_key: localAgentProviderApiKey,
    models: ["gpt-5-codex"],
    name: "Codex API",
    protocol: "openai_responses"
  });

  assert.equal(provider.account, account);
});

test("Codex model catalog parser accepts live model endpoint shapes", () => {
  const catalog = codexModelCatalogFromPayloadForTest({
    data: [
      {
        additional_speed_tiers: [{ id: "fast", label: "Fast" }],
        context_window: 272000,
        default_reasoning_level: "high",
        display_name: "GPT-5 Codex",
        effective_context_window_percent: 95,
        max_context_window: 300000,
        service_tiers: [{ id: "auto" }],
        slug: "gpt-5-codex",
        supports_fast_mode: true,
        supported_reasoning_levels: [
          { description: "Low", effort: "low" },
          { description: "High", effort: "high" }
        ],
        supports_reasoning_summaries: true
      },
      { displayName: "GPT-5.1 Codex", id: "gpt-5.1-codex" }
    ],
    models: [
      "gpt-5-codex",
      { label: "GPT-5.2 Codex", name: "gpt-5.2-codex" }
    ]
  });

  assert.deepEqual(catalog.models, ["gpt-5-codex", "gpt-5.1-codex", "gpt-5.2-codex"]);
  assert.deepEqual(catalog.modelDisplayNames, {
    "gpt-5-codex": "GPT-5 Codex",
    "gpt-5.1-codex": "GPT-5.1 Codex",
    "gpt-5.2-codex": "GPT-5.2 Codex"
  });
  assert.deepEqual(catalog.modelMetadata["gpt-5-codex"], {
    additionalSpeedTiers: [{ id: "fast", label: "Fast" }],
    contextWindow: 272000,
    defaultReasoningLevel: "high",
    effectiveContextWindowPercent: 95,
    maxContextWindow: 300000,
    serviceTiers: [{ id: "auto" }],
    supportsFastMode: true,
    supportedReasoningLevels: [
      { description: "Low", effort: "low" },
      { description: "High", effort: "high" }
    ],
    supportsReasoningSummaries: true
  });
  assert.equal(catalog.modelMetadata["gpt-5.1-codex"], undefined);
  assert.equal(catalog.modelMetadata["gpt-5.2-codex"], undefined);
});

test("Codex model catalog parser does not synthesize context metadata", () => {
  const catalog = codexModelCatalogFromPayloadForTest({
    models: [
      "gpt-5-codex",
      "gpt-5.5",
      "gpt-5.6",
      "gpt-5.6-sol",
      "gpt-5.6-terra-2026-07-28",
      "gpt-50"
    ]
  });

  assert.equal(catalog.modelMetadata, undefined);
});

test("Codex model catalog parser ignores invalid context metadata", () => {
  const catalog = codexModelCatalogFromPayloadForTest({
    models: [
      {
        context_window: -1,
        effective_context_window_percent: 101,
        max_context_window: 0,
        slug: "invalid-context-model"
      }
    ]
  });

  assert.equal(catalog.modelMetadata?.["invalid-context-model"], undefined);
});
