import { createHmac, randomBytes } from "node:crypto";
import { localAgentProviderApiKey } from "@llmr/core/agents/local-providers/shared";
import type { AppConfig } from "@llmr/core/contracts/app";

export const webSecretPlaceholder = "[LLMR REDACTED]";

// Client gateway keys (APIKEY, APIKEYS) stay readable for the API Keys page.
const redactedConfigFields = ["Providers", "providerPlugins", "toolHub"] as const;

// A reference names the secret, not its place in the config, so it survives the
// UI moving it between credential fields or renaming what holds it. The key is per
// process, so a reference cannot be used to test a guess at the secret offline.
const referenceKey = randomBytes(32);
const secretsByReference = new Map<string, string>();

function isSecretField(key: string, parentKey?: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_]/g, "");
  return ["cookie", "setcookie", "heliconeauth"].includes(normalized) ||
    /(?:authorization|token|secret|password|passphrase|apikeys?|privatekey|accesskey|secretkey|subscriptionkey|functionskey|authkey)$/.test(normalized) ||
    /^[A-Z0-9]+(?:_[A-Z0-9]+)*_(?:KEYS?|PAT)(?:_\d+)?$/.test(key) ||
    (key === "key" && parentKey === "query");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasReference(value: unknown): value is string {
  return typeof value === "string" && value.includes(`${webSecretPlaceholder}:`);
}

function mask(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(mask);
  }
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mask(item)]));
  }
  // The local-agent marker is a mode switch the UI compares against, not a credential.
  if (typeof value !== "string" || !value || value === localAgentProviderApiKey || secretsByReference.has(value)) {
    return value;
  }
  const reference = `${webSecretPlaceholder}:${createHmac("sha256", referenceKey).update(value).digest("base64url").slice(0, 22)}`;
  secretsByReference.set(reference, value);
  return reference;
}

function redact(value: unknown, parentKey?: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, parentKey));
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, isSecretField(key, parentKey) ? mask(item) : redact(item, key)]));
}

export function redactWebSecrets(value: unknown): unknown {
  return redact(value);
}

export function redactWebConfig(config: AppConfig): AppConfig {
  const redacted: Record<string, unknown> = { ...config };
  for (const field of redactedConfigFields) {
    if (field in redacted) {
      redacted[field] = redact(redacted[field]);
    }
  }
  return redacted as AppConfig;
}

export function redactWebRpcValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactWebRpcValue);
  }
  if (!isRecord(value)) {
    return value;
  }
  if (Array.isArray(value.Providers)) {
    return redactWebConfig(value as AppConfig);
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactWebRpcValue(item)]));
}

// A reference is restored only where a response would mask it again. Anywhere
// else it would let a caller read the secret back through a visible field.
function restore(value: unknown, restorable: boolean, inSecretField = false, parentKey?: string): unknown {
  if (hasReference(value)) {
    const secret = restorable && inSecretField ? secretsByReference.get(value) : undefined;
    if (secret === undefined) {
      throw new Error(inSecretField && restorable
        ? "A redacted provider credential is no longer known to this server. Reload the configuration or enter the credential again."
        : "A redacted provider credential can only be kept in a credential field. Enter the credential again.");
    }
    return secret;
  }
  if (Array.isArray(value)) {
    return value.map((item) => restore(item, restorable, inSecretField, parentKey));
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, restore(item, restorable, inSecretField || isSecretField(key, parentKey), key)]));
}

export function rejectWebSecretReferences(value: unknown): void {
  restore(value, false);
}

export function restoreWebConfigSecrets(config: unknown): unknown {
  if (!isRecord(config)) {
    rejectWebSecretReferences(config);
    return config;
  }
  return Object.fromEntries(Object.entries(config).map(([field, item]) => [
    field,
    restore(item, (redactedConfigFields as readonly string[]).includes(field))
  ]));
}

// A probe sends the key to the address in its request, and nothing here checks
// that address: a caller with the management token can already run a command
// on this host through a saved MCP server, so a check would stop nobody.
export function restoreWebProbeSecrets(request: unknown): unknown {
  return restore(request, true);
}
