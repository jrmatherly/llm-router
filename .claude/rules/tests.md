---
paths:
  - "packages/*/test/**"
  - "tests/**"
---

`node:test` plus `node:assert/strict`. `*.test.mjs` for core, electron and cli; `*.test.ts` or `*.test.tsx` for UI. Name a test after the issue it pins (`#1822 ...`). UI component tests render with `renderToStaticMarkup`. Run one file with the single-file command in `AGENTS.md`. Tests that assert desktop behavior use `withDesktopRuntime` from `packages/core/test/support/desktop-runtime.mjs`.
