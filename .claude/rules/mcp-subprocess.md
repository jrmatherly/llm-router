---
paths:
  - "packages/core/src/mcp/**"
---

The lightweight MCP bundles are stdio subprocesses with a size cap and a list of forbidden imports (config, storage, Electron, UI, SQLite). Both live in `validateLightweightMcpBundles` and `forbiddenLightweightMcpInputs` in `build/esbuild.config.mjs`, which only `npm run build:assets` runs; run it after touching these files.
