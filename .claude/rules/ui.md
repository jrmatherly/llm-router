---
paths:
  - "packages/ui/**"
---

The renderer is a browser bundle built by `createRendererBuildOptions` in `build/esbuild.config.mjs`. It may import core modules that have no `node:`, `better-sqlite3` or Electron dependency (today `@ccr/core/contracts/*`, `providers/presets/*`, `providers/url`, `providers/new-api`, `media/models`, `config/default-config`); anything else fails `npm run build:assets`. The backend is reached only through `window.ccr` (`web-client-bridge.ts` in the browser, the Electron preload in the app). Shared controls live in `components/ui/` (React plus Tailwind 4; `baseui` only through `lib/baseui-provider.tsx`). The bridge load order is checked by `tests/architecture/ui-build-contract.test.mjs`.
