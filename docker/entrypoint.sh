#!/bin/sh
set -eu

LLMR_DATA_DIR="${LLMR_DATA_DIR:-/data}"
LLMR_WEB_HOST="${LLMR_WEB_HOST:-127.0.0.1}"
LLMR_WEB_PORT="${LLMR_WEB_PORT:-3459}"
LLMR_NGINX_PORT="${LLMR_NGINX_PORT:-8080}"
LLMR_GATEWAY_HOST="${LLMR_GATEWAY_HOST:-127.0.0.1}"
LLMR_GATEWAY_PORT="${LLMR_GATEWAY_PORT:-3456}"
LLMR_PUBLIC_HOST="${LLMR_PUBLIC_HOST:-127.0.0.1}"
LLMR_PUBLIC_PORT="${LLMR_PUBLIC_PORT:-3458}"
LLMR_PUBLIC_BASE_URL="${LLMR_PUBLIC_BASE_URL:-http://${LLMR_PUBLIC_HOST}:${LLMR_PUBLIC_PORT}}"
LLMR_NO_GATEWAY="${LLMR_NO_GATEWAY:-0}"

LLMR_WEB_AUTH_TOKEN_GENERATED=0
if [ -z "${LLMR_WEB_AUTH_TOKEN:-}" ]; then
  LLMR_WEB_AUTH_TOKEN="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))")"
  LLMR_WEB_AUTH_TOKEN_GENERATED=1
elif [ "${#LLMR_WEB_AUTH_TOKEN}" -lt 32 ]; then
  echo "Warning: LLMR_WEB_AUTH_TOKEN is shorter than 32 characters; use a long random value before exposing the port beyond loopback." >&2
fi
LLMR_WEB_AUTH_TOKEN_QUERY="$(node -e "process.stdout.write(encodeURIComponent(process.argv[1] || ''))" "${LLMR_WEB_AUTH_TOKEN}")"

export HOME="${LLMR_DATA_DIR}"
export LLMR_DATA_DIR
export LLMR_GATEWAY_HOST
export LLMR_GATEWAY_PORT
export LLMR_NGINX_PORT
export LLMR_NO_GATEWAY
export LLMR_PUBLIC_BASE_URL
export LLMR_PUBLIC_HOST
export LLMR_PUBLIC_PORT
export LLMR_WEB_AUTH_TOKEN
export LLMR_WEB_AUTH_TOKEN_QUERY
export LLMR_WEB_HOST
export LLMR_WEB_PORT

CONFIG_DIR="${HOME}/.llm-router"
CONFIG_FILE="${CONFIG_DIR}/config.json"
APP_CONFIG_DB_FILE="${CONFIG_DIR}/config.sqlite"

# A volume first used by a root-run image (4.x and earlier) is owned by root.
if [ ! -w "${LLMR_DATA_DIR}" ] || { [ -e "${CONFIG_DIR}" ] && [ -n "$(find "${CONFIG_DIR}" ! -writable -print -quit)" ]; }; then
  echo "/data is not writable by uid 10001; run: docker run --rm -v <volume>:/data --user 0 <image> chown -R 10001:10001 /data" >&2
  exit 1
fi

mkdir -p "${CONFIG_DIR}" "${CONFIG_DIR}/app-data"

if [ "${LLMR_DOCKER_INIT_CONFIG:-1}" != "0" ] && [ ! -f "${CONFIG_FILE}" ] && [ ! -f "${APP_CONFIG_DB_FILE}" ]; then
  node - <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const configDir = path.join(process.env.HOME, ".llm-router");
const configFile = path.join(configDir, "config.json");
const gatewayHost = process.env.LLMR_GATEWAY_HOST || "0.0.0.0";
const gatewayPort = Number(process.env.LLMR_GATEWAY_PORT || "3456");
const publicBaseUrl = (process.env.LLMR_PUBLIC_BASE_URL || `http://127.0.0.1:${process.env.LLMR_PUBLIC_PORT || "3458"}`).replace(/\/+$/, "");

fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
fs.writeFileSync(configFile, `${JSON.stringify({
  HOST: gatewayHost,
  PORT: gatewayPort,
  gateway: {
    enabled: true,
    host: gatewayHost,
    port: gatewayPort
  },
  routerEndpoint: publicBaseUrl
}, null, 2)}\n`, { mode: 0o600 });
NODE
fi

if [ "${LLMR_DOCKER_SYNC_PUBLIC_ENDPOINT:-1}" != "0" ]; then
  node - <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const configDir = path.join(process.env.HOME, ".llm-router");
const configFile = path.join(configDir, "config.json");
const appConfigDbFile = path.join(configDir, "config.sqlite");
const gatewayHost = process.env.LLMR_GATEWAY_HOST || "127.0.0.1";
const gatewayPort = Number(process.env.LLMR_GATEWAY_PORT || "3456");
const publicBaseUrl = (process.env.LLMR_PUBLIC_BASE_URL || `http://127.0.0.1:${process.env.LLMR_PUBLIC_PORT || "3458"}`).replace(/\/+$/, "");

function syncConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  value.HOST = gatewayHost;
  value.PORT = gatewayPort;
  const existingGateway = value.gateway && typeof value.gateway === "object" && !Array.isArray(value.gateway)
    ? value.gateway
    : {};
  const { coreHost: _coreHost, corePort: _corePort, ...publicGateway } = existingGateway;
  value.gateway = {
    ...publicGateway,
    enabled: true,
    host: gatewayHost,
    port: gatewayPort
  };
  value.routerEndpoint = publicBaseUrl;
  return value;
}

function syncJsonFile() {
  if (!fs.existsSync(configFile)) {
    return;
  }
  const parsed = JSON.parse(fs.readFileSync(configFile, "utf8"));
  fs.writeFileSync(configFile, `${JSON.stringify(syncConfig(parsed), null, 2)}\n`, { mode: 0o600 });
}

function syncSqliteConfig() {
  if (!fs.existsSync(appConfigDbFile)) {
    return;
  }
  let Database;
  try {
    Database = require("better-sqlite3");
  } catch {
    return;
  }
  const db = new Database(appConfigDbFile);
  try {
    const row = db.prepare("select value_json from app_config where key = ?").get("default");
    if (!row?.value_json) {
      return;
    }
    const parsed = JSON.parse(row.value_json);
    db.prepare("update app_config set value_json = ?, updated_at = ? where key = ?")
      .run(JSON.stringify(syncConfig(parsed)), new Date().toISOString(), "default");
  } finally {
    db.close();
  }
}

syncJsonFile();
syncSqliteConfig();
NODE
fi

cat > /etc/nginx/conf.d/default.conf <<EOF
server {
  listen ${LLMR_NGINX_PORT};
  server_name _;
  root /usr/share/nginx/html;
  index pages/home/index.html;
  absolute_redirect off;

  client_max_body_size 8m;

  # The management token is never put in a response. A token the user supplies
  # in the query string is passed on to the page, which reads it from the URL.
  location = / {
    return 302 /pages/home/index.html\$is_args\$args;
  }

  location = /pages/home/index.html {
    try_files /pages/home/index.html =404;
  }

  location = /api/llmr/rpc {
    proxy_http_version 1.1;
    proxy_set_header Host ${LLMR_WEB_HOST}:${LLMR_WEB_PORT};
    proxy_set_header Origin http://${LLMR_WEB_HOST}:${LLMR_WEB_PORT};
    proxy_set_header Referer http://${LLMR_WEB_HOST}:${LLMR_WEB_PORT}/;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Host \$host;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_pass http://${LLMR_WEB_HOST}:${LLMR_WEB_PORT};
  }

  location = /health {
    proxy_http_version 1.1;
    proxy_set_header Host ${LLMR_GATEWAY_HOST}:${LLMR_GATEWAY_PORT};
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Host \$host;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_pass http://${LLMR_GATEWAY_HOST}:${LLMR_GATEWAY_PORT};
  }

  location ~ ^/(v1|v1beta|mcp|messages|chat/completions|responses|interactions)(/|$) {
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    proxy_set_header Connection "";
    proxy_set_header Host ${LLMR_GATEWAY_HOST}:${LLMR_GATEWAY_PORT};
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Host \$host;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_pass http://${LLMR_GATEWAY_HOST}:${LLMR_GATEWAY_PORT};
  }

  location / {
    try_files \$uri \$uri/ /pages/home/index.html;
  }
}
EOF

# A generated token is only reachable through the container logs.
if [ "${LLMR_WEB_AUTH_TOKEN_GENERATED}" = "1" ]; then
  echo "LLMR management UI: ${LLMR_PUBLIC_BASE_URL%/}/?llmr_web_token=${LLMR_WEB_AUTH_TOKEN_QUERY}"
fi

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

if [ -x /app/node_modules/.bin/pm2-runtime ]; then
  exec /app/node_modules/.bin/pm2-runtime docker/pm2.config.cjs
fi

exec /app/packages/core/node_modules/.bin/pm2-runtime docker/pm2.config.cjs
