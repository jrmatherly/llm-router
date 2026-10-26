import assert from "node:assert/strict";
import test from "node:test";
import { parseArgs, renderDexConfig, renderGatewayConfig } from "../../scripts/claude-apps-gateway-dev.mjs";

const base = { adminWriteKey: "a".repeat(32), dexPort: 15556, gatewayPort: 18080, jwtSecret: "b".repeat(48) };

test("rendered gateway.yaml points the anthropic upstream at LLMR with identity forwarding", () => {
  const yaml = renderGatewayConfig({ ...base, loadTest: false, upstreamApiKey: "llmr-key", upstreamBaseUrl: "http://127.0.0.1:3456" });
  assert.match(yaml, /host: 127\.0\.0\.1/);
  assert.match(yaml, /issuer: http:\/\/127\.0\.0\.1:15556/);
  assert.match(yaml, /provider: anthropic/);
  assert.match(yaml, /base_url: "http:\/\/127\.0\.0\.1:3456"/);
  assert.match(yaml, /api_key: "llmr-key"/);
  assert.match(yaml, /forward_user_identity: true/);
  assert.match(yaml, /admin_groups: \[authors\]/);
  assert.doesNotMatch(yaml, /load_test_mode/);
});

test("--load-test replaces the upstream call with a canned reply", () => {
  const yaml = renderGatewayConfig({ ...base, loadTest: true, upstreamBaseUrl: "http://127.0.0.1:3456" });
  assert.match(yaml, /load_test_mode:\n\s+enabled: true\n\s+reply_seconds: 0/);
  assert.doesNotMatch(yaml, /forward_user_identity/);
});

test("renderer refuses secrets below the gateway's floors and a missing upstream key", () => {
  assert.throws(() => renderGatewayConfig({ ...base, adminWriteKey: "short", loadTest: true, upstreamBaseUrl: "x" }), /32/);
  assert.throws(() => renderGatewayConfig({ ...base, jwtSecret: "short", loadTest: true, upstreamBaseUrl: "x" }), /32/);
  assert.throws(() => renderGatewayConfig({ ...base, loadTest: false, upstreamBaseUrl: "x" }), /--api-key/);
});

test("gateway and Dex configs move ports together", () => {
  const options = { ...base, dexPort: 15557, gatewayPort: 18090, loadTest: true, upstreamBaseUrl: "x" };
  const gateway = renderGatewayConfig(options);
  const dex = renderDexConfig(options);
  assert.match(gateway, /public_url: http:\/\/127\.0\.0\.1:18090/);
  assert.match(gateway, /issuer: http:\/\/127\.0\.0\.1:15557/);
  assert.match(dex, /issuer: http:\/\/127\.0\.0\.1:15557/);
  assert.match(dex, /redirectURIs:\n\s+- http:\/\/127\.0\.0\.1:18090\/oauth\/callback/);
  assert.match(dex, /type: mockCallback/);
});

test("parseArgs defaults and flags", () => {
  assert.deepEqual(parseArgs([]), { dexPort: 15556, gatewayPort: 18080, loadTest: false, upstreamApiKey: undefined, upstreamBaseUrl: "http://127.0.0.1:3456" });
  const parsed = parseArgs(["--load-test", "--port", "18090", "--dex-port", "15557", "--upstream", "http://10.0.0.5:3456", "--api-key", "k"]);
  assert.deepEqual(parsed, { dexPort: 15557, gatewayPort: 18090, loadTest: true, upstreamApiKey: "k", upstreamBaseUrl: "http://10.0.0.5:3456" });
  assert.throws(() => parseArgs(["--bogus"]), /--bogus/);
});
