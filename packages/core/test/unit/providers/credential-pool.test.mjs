import assert from "node:assert/strict";
import test from "node:test";
import {
  readProviderCredentialCooldown,
  recordProviderCredentialOutcome
} from "@llmr/core/providers/credential-pool.ts";
import {
  providerCredentialInternalName,
  providerCredentialRuntimeId
} from "@llmr/core/providers/runtime-topology.ts";

let fixtureSequence = 0;

function fixture() {
  fixtureSequence += 1;
  const first = { apiKey: "first-key", id: "first" };
  const second = { apiKey: "second-key", id: "second" };
  const provider = {
    credentials: [first, second],
    models: ["model-a"],
    name: `Credential Test ${fixtureSequence}`
  };
  const protocol = "openai_chat_completions";
  const internalName = providerCredentialInternalName(provider, protocol, first);
  return {
    attempt: {
      credentialChain: [internalName],
      credentialProtocol: protocol,
      logicalProvider: internalName
    },
    config: { Providers: [provider], virtualModelProfiles: [] },
    first,
    provider,
    second
  };
}

test("provider credential failures cool down the attempted credential and success clears it", () => {
  const { attempt, config, first, provider } = fixture();

  recordProviderCredentialOutcome(config, "POST", attempt, 503, new Headers());
  const cooldown = readProviderCredentialCooldown(provider, first);
  assert.equal(cooldown?.reason, "HTTP 503");
  assert.ok((cooldown?.until ?? 0) > Date.now());

  recordProviderCredentialOutcome(config, "POST", attempt, 204, new Headers());
  assert.equal(readProviderCredentialCooldown(provider, first), undefined);
});

test("upstream credential response identity takes precedence over the planned chain", () => {
  const { attempt, config, first, provider, second } = fixture();
  const headers = new Headers({
    "x-llmr-provider-credential-id": providerCredentialRuntimeId(provider, second)
  });

  recordProviderCredentialOutcome(config, "POST", attempt, 429, headers);

  assert.equal(readProviderCredentialCooldown(provider, first), undefined);
  assert.equal(readProviderCredentialCooldown(provider, second)?.reason, "HTTP 429");

  recordProviderCredentialOutcome(config, "POST", attempt, 200, headers);
  assert.equal(readProviderCredentialCooldown(provider, second), undefined);
});

function chainFixture(fallbackCount) {
  const { attempt, config, first, provider, second } = fixture();
  const chain = [first, second].map((credential) => providerCredentialInternalName(provider, attempt.credentialProtocol, credential));
  const answeredBySecond = new Headers({
    "x-llmr-provider-credential-id": providerCredentialRuntimeId(provider, second),
    ...(fallbackCount ? { "x-gateway-fallback-count": String(fallbackCount) } : {})
  });
  return { answeredBySecond, attempt: { ...attempt, credentialChain: chain }, config, first, provider, second };
}

test("#1923 a credential the core fell back from is cooled down", () => {
  const { answeredBySecond, attempt, config, first, provider, second } = chainFixture(1);

  recordProviderCredentialOutcome(config, "POST", attempt, 200, answeredBySecond);

  assert.equal(readProviderCredentialCooldown(provider, first)?.reason, "skipped by credential fallback");
  assert.equal(readProviderCredentialCooldown(provider, second), undefined);
});

test("#1923 a credential ahead of the one that answered is left alone when the core did not fall back", () => {
  const { answeredBySecond, attempt, config, first, provider, second } = chainFixture();

  recordProviderCredentialOutcome(config, "POST", attempt, 200, answeredBySecond);

  assert.equal(readProviderCredentialCooldown(provider, first), undefined);
  assert.equal(readProviderCredentialCooldown(provider, second), undefined);
});
