# node-forge audit finding: left in place on purpose

Decision date: 2026-10-25. Decided by the repo owner after review.

## The finding

`npm audit` reports one high finding: node-forge 1.4.0, GHSA-86w9-cpqp-85rv (CVE-2026-85393), CVSS 7.5, published 2026-09-03. RSA PKCS#1 v1.5 signature *verification* accepts extra nested DigestAlgorithm elements, so a forged signature can pass `verify`. Vulnerable range `<= 1.4.0`, no patched version.

## Why we leave it

- No fix exists. 1.4.0 is the newest release on npm. Upstream digitalbazaar/forge has five open pull requests for this bug (1152, 1157, 1159, 1160, 1161, newest 2026-10-20), none merged as of the decision date. Last upstream commits (2026-09-22 and 2026-09-25) touch tests and the security policy only.
- The vulnerable path is not reachable here. node-forge is a direct dependency of `packages/core` and `packages/cli` only (nothing transitive), and the sole importer is `packages/core/src/proxy/certificates.ts`. That file generates RSA keys, builds and signs the proxy CA and per-host leaf certificates, and converts PEM and DER. It never calls any forge verify function. Check: `grep -rn "verify" packages/core/src/proxy/certificates.ts` returns nothing.
- npm audit has no ignore list, so the line stays red until forge ships a fix or we drop forge.

## When to revisit

- A node-forge release above 1.4.0 appears: `npm view node-forge version`. Bump it in the root, `packages/core/package.json` and `packages/cli/package.json`, then run typecheck, `npm run test:core` and `npm run test:e2e` (the proxy CA is exercised there).
- If forge stays unreleased and a clean audit matters, the proper fix is to replace it with `@peculiar/x509` (WebCrypto-based X.509 issuance; Node's own `X509Certificate` only parses) plus `node:crypto` for key generation. That is a rewrite of the 275-line certificates module, which has no tests today, so the work must add a test that the CA and a leaf cert chain and that Node accepts them in a TLS handshake.
- Re-run the reachability check before either step: if `certificates.ts` or any new file starts verifying signatures with forge, the finding becomes real and the replacement is no longer optional.
