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

function isSecretField(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_]/g, "");
  return /^(?:apikey|apitoken|authorization|proxyauthorization|cookie|setcookie|password|token|accesstoken|refreshtoken|secret|clientsecret)$/.test(normalized) ||
    /^x.*(?:apikey|token|secret)$/.test(normalized) ||
    /[-_](?:api[-_]?key|token|secret|password)$/i.test(key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isReference(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(`${webSecretPlaceholder}:`);
}

function mask(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(mask);
  }
  // The local-agent marker is a mode switch the UI compares against, not a credential.
  if (typeof value !== "string" || !value || value === localAgentProviderApiKey || secretsByReference.has(value)) {
    return value;
  }
  const reference = `${webSecretPlaceholder}:${createHmac("sha256", referenceKey).update(value).digest("base64url").slice(0, 22)}`;
  secretsByReference.set(reference, value);
  return reference;
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, isSecretField(key) ? mask(item) : redact(item)]));
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
function restore(value: unknown, restorable: boolean, inSecretField = false): unknown {
  if (isReference(value)) {
    const secret = restorable && inSecretField ? secretsByReference.get(value) : undefined;
    if (secret === undefined) {
      throw new Error(inSecretField && restorable
        ? "A redacted provider credential is no longer known to this server. Reload the configuration or enter the credential again."
        : "A redacted provider credential can only be kept in a credential field. Enter the credential again.");
    }
    return secret;
  }
  if (Array.isArray(value)) {
    return value.map((item) => restore(item, restorable, inSecretField));
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, restore(item, restorable, isSecretField(key))]));
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

function collectStrings(value: unknown, into: Set<string>, secretsOnly: boolean, inSecretField = false): Set<string> {
  if (typeof value === "string") {
    if (!secretsOnly || inSecretField) {
      into.add(value);
    }
  } else if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, into, secretsOnly, inSecretField);
    }
  } else if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      collectStrings(item, into, secretsOnly, isSecretField(key));
    }
  }
  return into;
}

function httpOrigins(value: unknown): Set<string> {
  const origins = new Set<string>();
  for (const text of collectStrings(value, new Set(), false)) {
    if (/^https?:\/\//i.test(text) && URL.canParse(text)) {
      origins.add(new URL(text).origin);
    }
  }
  return origins;
}

// A probe sends the key to the address in the request. A saved key goes only to
// a host its own provider already names, so a probe cannot carry it elsewhere.
export function restoreWebProbeSecrets(request: unknown, current: AppConfig): unknown {
  const secrets = collectStrings(restore(collectReferences(request), true, true), new Set(), false);
  const config = current as unknown as Record<string, unknown>;
  const holders = redactedConfigFields.flatMap((field) => Array.isArray(config[field]) ? config[field] as unknown[] : [config[field]]);
  const requested = httpOrigins(request);
  for (const secret of secrets) {
    const allowed = httpOrigins(holders.filter((holder) => collectStrings(holder, new Set(), true).has(secret)));
    if (requested.size === 0 || [...requested].some((origin) => !allowed.has(origin))) {
      throw new Error("A saved provider credential can only be sent to its own provider's address. Enter the credential again to use it with a new address.");
    }
  }
  return restore(request, true);
}

function collectReferences(value: unknown): string[] {
  return [...collectStrings(value, new Set(), true)].filter(isReference);
}
