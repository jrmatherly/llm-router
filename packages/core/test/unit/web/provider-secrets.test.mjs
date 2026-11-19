import assert from "node:assert/strict";
import test from "node:test";
import { redactWebConfig, redactWebRpcValue, redactWebSecrets, rejectWebSecretReferences, restoreWebConfigSecrets, restoreWebProbeSecrets, webSecretPlaceholder } from "@llmr/core/web/provider-secrets.ts";

function sampleConfig() {
  return {
    APIKEY: "client-key",
    APIKEYS: [{ id: "local", key: "client-key" }],
    Providers: [
      {
        account: { connectors: [{ auth: "provider-api-key", endpoint: "https://provider.example/account", headers: { Authorization: "Bearer account-secret" }, type: "http-json" }] },
        api_base_url: "https://provider.example/v1",
        apiKey: "provider-secret",
        credentials: [{ api_key: "first-key", name: "First" }, { api_key: "second-key", name: "Second" }],
        extraHeaders: { Authorization: ["header-one", "header-two"], "x-visible": "visible" },
        id: "provider",
        models: [],
        name: "Provider"
      },
      { api_base_url: "http://127.0.0.1:1/v1", api_key: "llmr-local-agent-login", id: "local", models: [], name: "Local" }
    ],
    providerPlugins: [{ auth: { headers: { "x-api-key": "plugin-secret" } }, name: "plugin" }],
    toolHub: { llm: { apiKey: "provider-secret", model: "alpha" } }
  };
}

const secrets = /provider-secret|first-key|second-key|header-one|header-two|account-secret|plugin-secret/;

test("#1835 the web config hides provider secrets and keeps everything else", () => {
  const config = sampleConfig();
  const masked = redactWebConfig(config);
  assert.doesNotMatch(JSON.stringify(masked), secrets);
  assert.deepEqual(config, sampleConfig(), "redaction must not change the config it was given");
  assert.ok(masked.Providers[0].apiKey.startsWith(`${webSecretPlaceholder}:`));
  assert.equal(masked.Providers[0].extraHeaders["x-visible"], "visible");
  assert.equal(masked.Providers[0].account.connectors[0].auth, "provider-api-key");
  assert.equal(masked.Providers[1].api_key, "llmr-local-agent-login", "the local-agent marker is not a secret");
  assert.equal(masked.APIKEY, "client-key");
  assert.equal(masked.APIKEYS[0].key, "client-key");
  assert.notEqual(masked.Providers[0].credentials[0].api_key, masked.Providers[0].credentials[1].api_key);
  assert.equal(masked.toolHub.llm.apiKey, masked.Providers[0].apiKey, "one secret has one reference");
  assert.deepEqual(redactWebConfig(masked), masked, "a reference is not masked again");
});

test("#1835 an unchanged masked config restores to the stored one", () => {
  const config = sampleConfig();
  assert.deepEqual(restoreWebConfigSecrets(redactWebConfig(config)), config);
});

test("#1835 a reference follows its secret when the UI moves, renames or copies it", () => {
  const masked = redactWebConfig(sampleConfig());
  const [provider] = masked.Providers;
  const edited = {
    ...masked,
    Providers: [{
      ...provider,
      api_key: provider.apiKey,
      apiKey: undefined,
      credentials: [{ ...provider.credentials[1], name: "Renamed" }, provider.credentials[0]],
      extraHeaders: { "X-Api-Key": provider.extraHeaders.Authorization[0] },
      id: "renamed-provider"
    }],
    toolHub: { llm: { apiKey: provider.credentials[0].api_key } }
  };
  const restored = restoreWebConfigSecrets(edited);
  assert.equal(restored.Providers[0].api_key, "provider-secret");
  assert.deepEqual(restored.Providers[0].credentials.map((item) => [item.name, item.api_key]), [["Renamed", "second-key"], ["First", "first-key"]]);
  assert.equal(restored.Providers[0].extraHeaders["X-Api-Key"], "header-one");
  assert.equal(restored.toolHub.llm.apiKey, "first-key");
});

test("#1835 a probe request restores a saved key and keeps a typed one", () => {
  const config = sampleConfig();
  const masked = redactWebConfig(config);
  assert.equal(restoreWebProbeSecrets({ apiKey: masked.Providers[0].apiKey, baseUrl: "https://provider.example/v1" }).apiKey, "provider-secret");
  assert.equal(restoreWebProbeSecrets({ apiKey: "typed-key", baseUrl: "https://elsewhere.example" }).apiKey, "typed-key");
  assert.deepEqual(restoreWebProbeSecrets({ connector: masked.Providers[0].account.connectors[0] }).connector, config.Providers[0].account.connectors[0]);
  assert.throws(() => restoreWebProbeSecrets({ baseUrl: masked.Providers[0].apiKey }), /only be kept in a credential field/);
});

test("#1835 only a config or a probe may carry a reference", () => {
  const masked = redactWebConfig(sampleConfig());
  assert.throws(() => rejectWebSecretReferences([{ apiKey: masked.Providers[0].apiKey }]), /only be kept in a credential field/);
  assert.doesNotThrow(() => rejectWebSecretReferences([{ apiKey: "typed-key" }, "text", 7, null]));
});

test("#1835 secrets named like environment variables are hidden and a stored value that looks like a reference is too", () => {
  const lookalike = `${webSecretPlaceholder}:not-issued-by-this-server`;
  const config = { Providers: [{ api_key: lookalike, id: "p", name: "P" }], toolHub: { mcpServers: [{ env: { GITHUB_TOKEN: "env-secret", MAX_TOKENS: "4096", OPENAI_API_KEY: "env-key" } }] } };
  const masked = redactWebConfig(config);
  assert.doesNotMatch(JSON.stringify(masked), /env-secret|env-key|not-issued/);
  assert.equal(masked.toolHub.mcpServers[0].env.MAX_TOKENS, "4096");
  assert.deepEqual(restoreWebConfigSecrets(masked), config);
});

test("#1835 a secret nested under a credential field is hidden and restored", () => {
  const config = { Providers: [{ id: "p", name: "P", token: { nested: ["deep-secret"], value: "object-secret" } }] };
  const masked = redactWebConfig(config);
  assert.doesNotMatch(JSON.stringify(masked), /deep-secret|object-secret/);
  assert.deepEqual(restoreWebConfigSecrets(masked), config);
});

test("#1835 a reference inside other text is refused, not saved as the credential", () => {
  const masked = redactWebConfig(sampleConfig());
  const embedded = `Bearer ${masked.Providers[0].apiKey}`;
  assert.throws(() => restoreWebConfigSecrets({ ...masked, Providers: [{ ...masked.Providers[0], extraHeaders: { Authorization: embedded } }] }), /no longer known/);
  assert.throws(() => restoreWebConfigSecrets({ ...masked, Providers: [{ ...masked.Providers[0], extraHeaders: { "X-Custom": embedded } }] }), /only be kept in a credential field/);
});

test("#1835 an import result is masked whatever its shape", () => {
  const result = redactWebSecrets({ provider: { apiKey: "import-key", name: "Imported" }, providerPlugins: [{ auth: { headers: { authorization: "Bearer import-token" } } }] });
  assert.doesNotMatch(JSON.stringify(result), /import-key|import-token/);
  assert.equal(result.provider.name, "Imported");
  assert.equal(restoreWebProbeSecrets({ apiKey: result.provider.apiKey }).apiKey, "import-key");
});

test("#1835 every config in an RPC result is masked, wherever it sits", () => {
  const result = redactWebRpcValue({ config: sampleConfig(), list: [sampleConfig()], other: { apiKey: "not-a-config" } });
  assert.doesNotMatch(JSON.stringify([result.config, result.list]), secrets);
  assert.equal(result.other.apiKey, "not-a-config");
});

test("#1835 a reference cannot be read back through a field the response shows", () => {
  const masked = redactWebConfig(sampleConfig());
  const reference = masked.Providers[0].apiKey;
  const visible = /only be kept in a credential field/;
  assert.throws(() => restoreWebConfigSecrets({ ...masked, Providers: [{ ...masked.Providers[0], name: reference }] }), visible);
  assert.throws(() => restoreWebConfigSecrets({ ...masked, Providers: [{ ...masked.Providers[0], extraHeaders: { "x-visible": reference } }] }), visible);
  assert.throws(() => restoreWebConfigSecrets({ ...masked, proxy: { password: reference } }), visible, "outside the masked fields a response would show it");
  assert.throws(() => restoreWebConfigSecrets({ Providers: {}, agent: { headers: { Authorization: reference } } }), visible, "the masked fields are fixed, whatever shape Providers has");
  assert.throws(() => restoreWebConfigSecrets([{ api_key: reference }]), visible);
});

test("#1835 a reference this server never issued is refused", () => {
  assert.throws(() => restoreWebConfigSecrets({ Providers: [{ api_key: `${webSecretPlaceholder}:unknown` }] }), /no longer known/);
});
