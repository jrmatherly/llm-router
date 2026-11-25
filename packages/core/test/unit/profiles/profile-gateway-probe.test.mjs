import assert from "node:assert/strict";
import test from "node:test";
import { CLAUDE_CODE_AUTH_MODE_ENV } from "@llmr/core/agents/claude-code/auth-mode.ts";
import { createDefaultAppConfig } from "@llmr/core/config/default-config.ts";
import { gatewayService } from "@llmr/core/gateway/service.ts";
import { ensureProfileGateway, ProfileGatewayUnavailableError } from "@llmr/core/profiles/launch-service.ts";

function claudeProfileConfig(authMode = "api-key-helper") {
  const profile = {
    agent: "claude-code",
    enabled: true,
    env: {
      [CLAUDE_CODE_AUTH_MODE_ENV]: authMode
    },
    id: "claude-main",
    model: "Provider/model",
    name: "Claude Main",
    scope: "llmr",
    surface: "cli"
  };
  const config = createDefaultAppConfig();
  config.APIKEY = "profile-token";
  config.APIKEYS = [
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: "profile:claude-main",
      key: "profile-token",
      name: "Profile: Claude Main"
    }
  ];
  config.gateway.host = "127.0.0.1";
  config.gateway.port = 3466;
  config.profile.profiles = [profile];
  return { config, profile };
}

test("existing profile gateway uses health before the optional root probe", async () => {
  const previousFetch = globalThis.fetch;
  const paths = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    paths.push(url.pathname);
    if (url.pathname === "/health") {
      return Response.json({
        core: "http://127.0.0.1:3467",
        status: "running",
        timestamp: "2026-01-01T00:00:00.000Z"
      });
    }
    if (url.pathname === "/v1/models") {
      assert.equal(new Headers(init.headers).get("authorization"), "Bearer profile-token");
      return Response.json({ data: [], object: "list" });
    }
    if (url.pathname === "/") {
      throw new TypeError("root probe connection reset");
    }
    throw new Error(`Unexpected gateway probe: ${url.pathname}`);
  };

  try {
    const { config, profile } = claudeProfileConfig();
    const result = await ensureProfileGateway(config, profile, "Local subscription router", {
      reuseExisting: true,
      startIfMissing: false
    });

    assert.equal(result.APIKEY, "profile-token");
    assert.deepEqual(paths, ["/health", "/v1/models"]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("existing profile gateway falls back to the root identity response", async () => {
  const previousFetch = globalThis.fetch;
  const paths = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    paths.push(url.pathname);
    if (url.pathname === "/health") {
      return Response.json({ status: "unknown" }, { status: 404 });
    }
    if (url.pathname === "/") {
      return Response.json({ name: "llm-router" });
    }
    if (url.pathname === "/v1/models") {
      return Response.json({ data: [], object: "list" });
    }
    throw new Error(`Unexpected gateway probe: ${url.pathname}`);
  };

  try {
    const { config, profile } = claudeProfileConfig();
    const result = await ensureProfileGateway(config, profile, "Local subscription router", {
      reuseExisting: true,
      startIfMissing: false
    });

    assert.equal(result.APIKEY, "profile-token");
    assert.deepEqual(paths, ["/health", "/", "/v1/models"]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("existing profile gateway rejects WIF profiles when the root identity lacks the token endpoint", async () => {
  const previousFetch = globalThis.fetch;
  const paths = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    paths.push(url.pathname);
    if (url.pathname === "/health") {
      return Response.json({
        core: "http://127.0.0.1:3467",
        status: "running",
        timestamp: "2026-01-01T00:00:00.000Z"
      });
    }
    if (url.pathname === "/v1/models") {
      return Response.json({ data: [], object: "list" });
    }
    if (url.pathname === "/") {
      return Response.json({
        endpoints: ["GET /v1/models"],
        name: "llm-router"
      });
    }
    throw new Error(`Unexpected gateway probe: ${url.pathname}`);
  };

  try {
    const { config, profile } = claudeProfileConfig("wif");
    await assert.rejects(
      ensureProfileGateway(config, profile, "Local subscription router", {
        reuseExisting: true,
        startIfMissing: false
      }),
      /does not advertise the Claude Code WIF token endpoint/
    );

    assert.deepEqual(paths, ["/health", "/v1/models", "/"]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("existing profile gateway retries a transient transport failure", async () => {
  const previousFetch = globalThis.fetch;
  const paths = [];
  let modelAttempts = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    paths.push(url.pathname);
    if (url.pathname === "/health") {
      return Response.json({
        core: "http://127.0.0.1:3467",
        status: "running",
        timestamp: "2026-01-01T00:00:00.000Z"
      });
    }
    if (url.pathname === "/v1/models") {
      modelAttempts += 1;
      if (modelAttempts === 1) {
        throw new TypeError("fetch failed", { cause: { code: "ECONNRESET" } });
      }
      return Response.json({ data: [], object: "list" });
    }
    throw new Error(`Unexpected gateway probe: ${url.pathname}`);
  };

  try {
    const { config, profile } = claudeProfileConfig();
    const result = await ensureProfileGateway(config, profile, "Local subscription router", {
      reuseExisting: true,
      startIfMissing: false
    });

    assert.equal(result.APIKEY, "profile-token");
    assert.equal(modelAttempts, 2);
    assert.deepEqual(paths, ["/health", "/v1/models", "/v1/models"]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("unavailable profile gateway reports the probe failure reason", async () => {
  const previousFetch = globalThis.fetch;
  const paths = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    paths.push(url.pathname);
    if (url.pathname === "/health") {
      throw new TypeError("health probe timed out");
    }
    if (url.pathname === "/") {
      throw new TypeError("root probe connection reset");
    }
    throw new Error(`Unexpected gateway probe: ${url.pathname}`);
  };

  try {
    const { config, profile } = claudeProfileConfig();
    await assert.rejects(
      ensureProfileGateway(config, profile, "Local subscription router", {
        reuseExisting: true,
        startIfMissing: false
      }),
      (error) => {
        assert.equal(error?.name, "ProfileGatewayUnavailableError");
        assert.match(error.message, /health probe timed out/);
        return true;
      }
    );
    assert.deepEqual(paths, ["/health", "/health", "/health", "/", "/", "/"]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("an app profile's gateway is started with every stored key and the open still gets the profile's key", async (t) => {
  const { config, profile } = claudeProfileConfig();
  config.APIKEY = "primary-token";
  config.APIKEYS = [
    { createdAt: "2026-01-01T00:00:00.000Z", id: "primary", key: "primary-token" },
    { ...config.APIKEYS[0], limits: { rpm: 5 } }
  ];
  const start = t.mock.method(gatewayService, "start", async () => ({ state: "running" }));

  const result = await ensureProfileGateway(config, profile, "OpenCode App");

  assert.equal(start.mock.callCount(), 1);
  const started = start.mock.calls[0].arguments[0];
  assert.equal(started.APIKEY, "primary-token");
  assert.deepEqual(started.APIKEYS.map((apiKey) => apiKey.id), ["primary", "profile:claude-main"]);
  assert.deepEqual(started.APIKEYS[1].limits, { rpm: 5 });
  assert.equal(result.APIKEY, "profile-token");
  assert.deepEqual(result.APIKEYS.map((apiKey) => apiKey.key), ["profile-token"]);
});

function twoKeyProfileConfig() {
  const { config, profile } = claudeProfileConfig();
  config.APIKEY = "primary-token";
  config.APIKEYS = [{ createdAt: "2026-01-01T00:00:00.000Z", id: "primary", key: "primary-token" }, config.APIKEYS[0]];
  return { config, profile };
}

function stubGateway(t, answerModels) {
  const previousFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const token = new Headers(init.headers).get("authorization")?.replace("Bearer ", "");
    const answer = answerModels(url.pathname === "/v1/models" ? token : undefined);
    if (answer === "down") throw new TypeError("fetch failed");
    if (url.pathname === "/health") {
      return Response.json({ core: "http://127.0.0.1:3467", status: "running", timestamp: "2026-01-01T00:00:00.000Z" });
    }
    if (url.pathname === "/v1/models") return Response.json({ data: [], object: "list" }, { status: answer });
    throw new Error(`Unexpected gateway probe: ${url.pathname}`);
  };
}

test("a profile launch waits for the gateway to accept the profile's own key", async (t) => {
  let profileProbes = 0;
  let primaryProbes = 0;
  stubGateway(t, (token) => {
    if (token === "primary-token") primaryProbes += 1;
    if (token !== "profile-token") return 200;
    profileProbes += 1;
    return profileProbes > 2 ? 200 : 401;
  });
  const notice = t.mock.method(console, "warn", () => {});
  stderrIsTerminal(t, true);
  const { config, profile } = twoKeyProfileConfig();

  const result = await ensureProfileGateway(config, profile, "Local subscription router", { profileKeyWaitMs: 5000, reuseExisting: true, startIfMissing: false });

  assert.equal(result.APIKEY, "profile-token");
  assert.equal(profileProbes, 3);
  assert.equal(primaryProbes, 1);
  assert.equal(notice.mock.callCount(), 1);
  assert.match(String(notice.mock.calls[0].arguments[0]), /Waiting for the gateway to accept the key of profile "Claude Main"/);
});

test("a launch whose stderr is not a terminal waits without the waiting line", async (t) => {
  let profileProbes = 0;
  stubGateway(t, (token) => {
    if (token !== "profile-token") return 200;
    profileProbes += 1;
    return profileProbes > 1 ? 200 : 401;
  });
  const notice = t.mock.method(console, "warn", () => {});
  stderrIsTerminal(t, false);
  const { config, profile } = twoKeyProfileConfig();

  const result = await ensureProfileGateway(config, profile, "Local subscription router", { profileKeyWaitMs: 5000, reuseExisting: true, startIfMissing: false });

  assert.equal(result.APIKEY, "profile-token");
  assert.equal(profileProbes, 2);
  assert.equal(notice.mock.callCount(), 0);
});

function stderrIsTerminal(t, value) {
  const previous = process.stderr.isTTY;
  process.stderr.isTTY = value;
  t.after(() => {
    process.stderr.isTTY = previous;
  });
}

test("a gateway that restarts during the wait is waited for, not replaced", async (t) => {
  let profileProbes = 0;
  let failedRequests = 0;
  // Down from the moment it accepts the other key until after the first poll, 500 ms later.
  let downUntil = 0;
  stubGateway(t, (token) => {
    if (Date.now() < downUntil) {
      failedRequests += 1;
      return "down";
    }
    if (token === "primary-token") {
      downUntil = Date.now() + 750;
      return 200;
    }
    if (token !== "profile-token") return 200;
    profileProbes += 1;
    return profileProbes > 1 ? 200 : 401;
  });
  t.mock.method(console, "warn", () => {});
  const start = t.mock.method(gatewayService, "start", async () => ({ state: "error" }));
  const { config, profile } = twoKeyProfileConfig();

  const result = await ensureProfileGateway(config, profile, "Local subscription router", { profileKeyWaitMs: 5000, reuseExisting: true });

  assert.equal(result.APIKEY, "profile-token");
  assert.ok(failedRequests > 0);
  assert.equal(start.mock.callCount(), 0);
});

test("a profile launch is refused when the gateway does not accept the profile's own key", { timeout: 5000 }, async (t) => {
  stubGateway(t, (token) => token === "profile-token" ? 401 : 200);
  const start = t.mock.method(gatewayService, "start", async () => ({ state: "error" }));
  const { config, profile } = twoKeyProfileConfig();

  await assert.rejects(
    ensureProfileGateway(config, profile, "Claude Main", { profileKeyWaitMs: 0, reuseExisting: true, startIfMissing: false }),
    (error) => {
      assert.equal(error instanceof ProfileGatewayUnavailableError, false);
      assert.match(error.message, /does not accept the API key for Claude Main/);
      assert.match(error.message, /quit LLMR Desktop and open it again/);
      assert.doesNotMatch(error.message, /run llmr start to refresh/);
      assert.doesNotMatch(error.message, /profile-token|primary-token/);
      return true;
    }
  );
  assert.equal(start.mock.callCount(), 0);
});

test("a profile launch is refused once the wait for the profile's own key runs out", { timeout: 5000 }, async (t) => {
  let profileProbes = 0;
  stubGateway(t, (token) => {
    if (token !== "profile-token") return 200;
    profileProbes += 1;
    return 401;
  });
  const notice = t.mock.method(console, "warn", () => {});
  stderrIsTerminal(t, true);
  const { config, profile } = twoKeyProfileConfig();

  await assert.rejects(
    ensureProfileGateway(config, profile, "Claude Main", { profileKeyWaitMs: 400, reuseExisting: true, startIfMissing: false }),
    /does not accept the API key for Claude Main/
  );
  assert.equal(profileProbes, 2);
  assert.equal(notice.mock.callCount(), 1);
});

test("a gateway that is gone when the wait runs out is reported as not running, the error a launch with no gateway gets", { timeout: 10000 }, async (t) => {
  let down = false;
  stubGateway(t, (token) => {
    if (down) return "down";
    if (token === "primary-token") down = true;
    return token === "profile-token" ? 401 : 200;
  });
  t.mock.method(console, "warn", () => {});
  const start = t.mock.method(gatewayService, "start", async () => ({ state: "error" }));
  const { config, profile } = twoKeyProfileConfig();

  await assert.rejects(
    ensureProfileGateway(config, profile, "Claude Main", { profileKeyWaitMs: 400, reuseExisting: true }),
    (error) => {
      assert.equal(error instanceof ProfileGatewayUnavailableError, true);
      assert.match(error.message, /^LLMR gateway is not running at http:\/\/127\.0\.0\.1:3466: .+\. Start LLMR Desktop or run llmr start before opening Claude Main\.$/);
      assert.doesNotMatch(error.message, /does not accept the API key/);
      return true;
    }
  );
  assert.equal(start.mock.callCount(), 0);
});

test("a gateway found on the port after a failed start must accept the profile's own key", { timeout: 5000 }, async (t) => {
  let gatewayUp = false;
  stubGateway(t, (token) => {
    if (!gatewayUp) return "down";
    return token === "profile-token" ? 401 : 200;
  });
  const start = t.mock.method(gatewayService, "start", async () => {
    gatewayUp = true;
    return { lastError: "listen EADDRINUSE: address already in use 127.0.0.1:3456", state: "error" };
  });
  const { config, profile } = twoKeyProfileConfig();

  await assert.rejects(
    ensureProfileGateway(config, profile, "Claude Main", { profileKeyWaitMs: 0, reuseExisting: true }),
    /does not accept the API key for Claude Main/
  );
  assert.equal(start.mock.callCount(), 1);
});

function recordRequests(t) {
  const previousFetch = globalThis.fetch;
  const requests = [];
  t.after(() => {
    globalThis.fetch = previousFetch;
  });
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    throw new TypeError("fetch failed");
  };
  return requests;
}

test("a profile with no key of its own is refused and never opened on another key", async (t) => {
  const requests = recordRequests(t);
  const { config, profile } = twoKeyProfileConfig();
  config.APIKEYS = [config.APIKEYS[0]];

  await assert.rejects(
    ensureProfileGateway(config, profile, "Claude Main", { reuseExisting: true, startIfMissing: false }),
    /No LLMR API key was found for profile "Claude Main"\. Re-save the profile and try again\./
  );
  assert.deepEqual(requests, []);
});

test("a profile whose key has expired is refused at once with the expiry", async (t) => {
  const requests = recordRequests(t);
  const { config, profile } = twoKeyProfileConfig();
  config.APIKEYS[1] = { ...config.APIKEYS[1], expiresAt: "2026-02-01T00:00:00.000Z" };

  await assert.rejects(
    ensureProfileGateway(config, profile, "Claude Main", { reuseExisting: true, startIfMissing: false }),
    (error) => {
      assert.equal(error.message, 'The API key of profile "Claude Main" expired on 2026-02-01T00:00:00.000Z. Give it a later expiry on the API Keys page, then open the profile again.');
      return true;
    }
  );
  assert.deepEqual(requests, []);
});
