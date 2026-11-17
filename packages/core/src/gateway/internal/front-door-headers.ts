const frontDoorHeaderNames = new Set([
  "cdn-loop",
  "fastly-client-ip",
  "forwarded",
  "remote-user",
  "true-client-ip",
  "via",
  "x-client-ip",
  "x-cluster-client-ip",
  "x-envoy-external-address",
  "x-original-forwarded-for",
  "x-real-ip",
  "x-remote-user",
  "x-vercel-forwarded-for",
  "x-webauth-user"
]);

const frontDoorHeaderPrefixes = [
  "cf-",
  "tailscale-user-",
  "x-amzn-oidc-",
  "x-auth-request-",
  "x-forwarded-",
  "x-goog-authenticated-user-",
  "x-goog-iap-",
  "x-ms-client-principal",
  "x-ms-token-",
  "x-pomerium-"
];

// Headers a reverse proxy, CDN or identity-aware proxy adds in front of LLMR. They carry
// the caller's IP, identity or access tokens for LLMR's own front door, so a provider must
// never receive them from a client request. Takes a lower-cased name.
export function isFrontDoorHeader(name: string): boolean {
  return frontDoorHeaderNames.has(name) || frontDoorHeaderPrefixes.some((prefix) => name.startsWith(prefix));
}
