---
paths:
  - "packages/core/src/gateway/**"
---

`gateway/service.ts` is a re-export facade; gateway modules never import it. `gateway/core-runtime/config-compiler.ts` has no filesystem persistence. `packages/core/test/architecture/gateway-service-architecture.test.mjs` checks both, plus a 20-line cap on `service.ts`; read it before restructuring and run `npm run test:core`. New protocol features go in `gateway/features/`.
