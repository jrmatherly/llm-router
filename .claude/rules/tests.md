---
paths:
  - "packages/*/test/**"
  - "tests/**"
---

`node:test` plus `node:assert/strict`, except the Playwright `*.spec.ts` files in `tests/e2e/`. `*.test.mjs` for core and cli; mostly `*.test.ts` or `*.test.tsx` for electron and UI, with a few `*.test.mjs`. A test that pins an issue carries its number in its name (`#1822 ...`). UI component tests render with `renderToStaticMarkup`. Run one file with the single-file command in `AGENTS.md`. A test cannot reach a host that is not loopback, so it serves its own fixture on `127.0.0.1` or stubs `fetch`.
