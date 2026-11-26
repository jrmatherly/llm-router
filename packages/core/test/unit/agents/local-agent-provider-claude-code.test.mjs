import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { claudeCodeCandidate, importClaudeCodeProvider } from "@llmr/core/agents/local-providers/claude-code.ts";
import { closeRequestLogRuntime, flushRequestLogRuntime, getRequestLogs, requestLogRuntime } from "@llmr/core/observability/request-log-store.ts";
import { checkGatewayProviderConnectivity, probeGatewayProvider } from "@llmr/core/providers/probe.ts";
import { withEnv } from "../../support/with-env.mjs";

const skip = process.platform === "win32";

// A home with no login, and a `security` that records every call, so no test can reach the real Keychain.
function withoutLogin(t) {
  const dir = mkdtempSync(path.join(tmpdir(), "llmr-claude-code-no-login-"));
  const calls = path.join(dir, "security-calls");
  writeFileSync(path.join(dir, "security"), `#!/bin/sh\necho "$1" >> "${calls}"\nexit 44\n`);
  chmodSync(path.join(dir, "security"), 0o755);
  withEnv(t, { CLAUDE_SECURESTORAGE_CONFIG_DIR: dir, HOME: dir, PATH: `${dir}${path.delimiter}${process.env.PATH}` });
  t.after(() => rmSync(dir, { force: true, recursive: true }));
  return { securityCalled: () => existsSync(calls) };
}

test("the Claude Code candidate is importable on a machine with no login, and nothing asks the Keychain", { skip }, (t) => {
  const home = withoutLogin(t);
  assert.deepEqual(claudeCodeCandidate(), {
    detail: "Forwards the login Claude Code sends. Usable only from a Claude Code profile in Claude login mode. Nothing is stored.",
    id: "claude-code-api",
    importable: true,
    kind: "claude-code",
    models: ["claude-sonnet-5"],
    name: "Claude Code API",
    protocol: "anthropic_messages",
    status: "available"
  });
  assert.equal(home.securityCalled(), false);
});

test("importing Claude Code stores no login in its plugins", { skip }, async (t) => {
  const home = withoutLogin(t);
  const result = await importClaudeCodeProvider(claudeCodeCandidate(), []);
  assert.equal(result.provider.name, "Claude Code API");
  assert.deepEqual(result.providerPlugins.map((plugin) => plugin.key.replace(/^.*-(claude-code-oauth(?:-internal)?)$/, "$1")), ["claude-code-oauth", "claude-code-oauth-internal"]);
  assert.equal(result.providerPlugins.some((plugin) => "auth" in plugin), false);
  assert.equal(JSON.stringify(result.providerPlugins).includes("authorization"), false);
  assert.equal(home.securityCalled(), false);
});

test("probing the Claude Code provider sends no request", { skip }, async (t) => {
  const home = withoutLogin(t);
  let requests = 0;
  const stub = createServer((_request, response) => {
    requests += 1;
    response.writeHead(500).end();
  });
  await new Promise((resolve) => stub.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => stub.close(resolve)));
  const baseUrl = `http://127.0.0.1:${stub.address().port}`;
  const probe = await probeGatewayProvider({
    apiKey: "llmr-local-agent-login",
    baseUrl,
    forceRefresh: true,
    mode: "models",
    models: ["claude-sonnet-5"],
    providerPlugins: [{ key: "llmr-local-agent-claude-code-api-claude-code-oauth", providerName: "Claude Code API" }],
    protocols: ["anthropic_messages"]
  });
  assert.equal(requests, 0);
  assert.deepEqual(probe.models, ["claude-sonnet-5"]);
  assert.equal(probe.detectedProtocol, "anthropic_messages");
  assert.equal(probe.protocols[0].supported, false);
  assert.match(probe.protocols[0].message, /^Not checked\./);
  assert.equal(home.securityCalled(), false);
});

test("a connectivity check of the Claude Code provider records no request-log row", { skip }, async (t) => {
  withoutLogin(t);
  requestLogRuntime.options.workerFile = path.resolve(__dirname, "../../../runtime/request-log-worker.js");
  t.after(() => closeRequestLogRuntime());
  const stub = createServer((_request, response) => response.writeHead(500).end());
  await new Promise((resolve) => stub.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => stub.close(resolve)));
  const check = (apiKey) => checkGatewayProviderConnectivity({
    apiKey,
    candidates: [{ baseUrl: `http://127.0.0.1:${stub.address().port}`, name: "Claude Code API", protocols: ["anthropic_messages"], source: "custom" }],
    forceRefresh: true,
    models: ["claude-sonnet-5"],
    providerPlugins: [{ key: "llmr-local-agent-claude-code-api-claude-code-oauth", providerName: "Claude Code API" }],
    protocols: ["anthropic_messages"]
  }, { requestLog: { enabled: true } });
  const rows = async () => {
    const flushed = await flushRequestLogRuntime(10_000);
    assert.equal(flushed.timedOut, false, "the request log did not flush in 10 seconds");
    return (await getRequestLogs({ pageSize: 10 })).items.length;
  };
  const before = await rows();

  await check("llmr-local-agent-login");
  assert.equal(await rows(), before);
  await check("sk-other-key-0001");
  assert.equal(await rows(), before + 1, "a provider with its own key does get a row");
});
