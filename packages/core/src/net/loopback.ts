import { networkInterfaces } from "node:os";

const loopbackAddresses = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export function isLoopbackAddress(address: string | undefined): boolean {
  return loopbackAddresses.has(address ?? "");
}

export function isLoopbackHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "0:0:0:0:0:0:0:1" ||
    normalized.startsWith("127.");
}

export function isLocalHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return isLoopbackHostname(normalized) || Object.values(networkInterfaces()).some((entries) =>
    entries?.some((entry) => entry.address.toLowerCase() === normalized)
  );
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
}
