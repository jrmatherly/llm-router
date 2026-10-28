ARG NODE_IMAGE=node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205
ARG RUNTIME_NODE_IMAGE=node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205

FROM ${NODE_IMAGE} AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/cli/package.json packages/cli/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/electron/package.json packages/electron/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN npm ci

COPY . .
RUN if ls docker/local-ai-gateway/*.tgz >/dev/null 2>&1; then \
    npm install --no-save docker/local-ai-gateway/*.tgz; \
  fi
RUN npm run build:docker

FROM ${NODE_IMAGE} AS production-deps
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
RUN npm ci --omit=dev --workspace=@llm-router/core --include-workspace-root=false \
  && npm cache clean --force

FROM ${RUNTIME_NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    LLMR_DATA_DIR=/data \
    LLMR_WEB_HOST=127.0.0.1 \
    LLMR_WEB_PORT=3459 \
    LLMR_NGINX_PORT=8080 \
    LLMR_GATEWAY_HOST=127.0.0.1 \
    LLMR_GATEWAY_PORT=3456 \
    LLMR_PUBLIC_HOST=127.0.0.1 \
    LLMR_PUBLIC_PORT=3458

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates libstdc++6 nginx \
  && rm -rf /var/lib/apt/lists/* \
  && rm -f /etc/nginx/sites-enabled/default /etc/nginx/conf.d/default.conf \
  && rm -rf \
    /opt/yarn-* \
    /usr/local/bin/corepack \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /usr/local/bin/yarn \
    /usr/local/bin/yarnpkg \
    /usr/local/include/node \
    /usr/local/lib/node_modules/corepack \
    /usr/local/lib/node_modules/npm \
    /usr/local/share/doc \
    /usr/local/share/man

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY --from=production-deps /app/node_modules node_modules

COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/packages/ui/dist/renderer /usr/share/nginx/html
COPY docker/entrypoint.sh /usr/local/bin/llmr-docker-entrypoint
COPY docker/pm2.config.cjs docker/pm2.config.cjs

# nginx runs unprivileged, so the pid comes from pm2's -g flag and the user directive is dropped.
RUN chmod +x /usr/local/bin/llmr-docker-entrypoint \
  && groupadd --gid 10001 llmr \
  && useradd --uid 10001 --gid 10001 --home-dir /data --no-create-home --shell /usr/sbin/nologin llmr \
  && sed -i -e '/^user /d' -e '/^pid /d' /etc/nginx/nginx.conf \
  && mkdir -p /data /run/nginx /var/lib/nginx /var/log/nginx \
  && chown -R llmr:llmr /data /run/nginx /var/lib/nginx /var/log/nginx /etc/nginx/conf.d

USER llmr

VOLUME ["/data"]
EXPOSE 8080

# A gateway with no models answers /health with 502, so health is nginx plus the management server.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --start-interval=2s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.LLMR_NGINX_PORT || '8080') + '/api/llmr/rpc', { body: '{}', headers: { 'content-type': 'application/json' }, method: 'POST' }).then((r) => process.exit([200, 401].includes(r.status) ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["llmr-docker-entrypoint"]
