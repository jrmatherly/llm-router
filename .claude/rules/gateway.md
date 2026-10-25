---
paths:
  - "packages/core/src/gateway/**"
---

`gateway/service.ts` is a re-export facade; gateway modules never import it. `gateway/core-runtime/config-compiler.ts` has no filesystem persistence. The exact file list and size limits live in `packages/core/test/architecture/gateway-service-architecture.test.mjs`; read it before restructuring and run `npm run test:core`. New protocol features go in `gateway/features/`.
