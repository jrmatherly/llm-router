import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @typedef {{ adminWriteKey: string; dexPort: number; gatewayPort: number; jwtSecret: string; loadTest: boolean; upstreamApiKey?: string; upstreamBaseUrl: string }} GatewayConfigOptions
 */

const postgresUrl = "postgres://gw:pw@127.0.0.1:15432/gateway";
const oidcClient = { id: "llmr-dev", secret: "llmr-dev-secret" };

/** @param {GatewayConfigOptions} options */
export function renderGatewayConfig(options) {
  if (options.adminWriteKey.length < 32 || Buffer.byteLength(options.jwtSecret) < 32) {
    throw new Error("admin write key and JWT secret must be at least 32 characters");
  }
  if (!options.loadTest && !options.upstreamApiKey) {
    throw new Error("an LLMR client key is required; pass --api-key <key> or use --load-test");
  }
  const upstream = options.loadTest
    ? [
      "upstreams:",
      "  - provider: anthropic",
      "    auth:",
      "      api_key: load-test-unused",
      "load_test_mode:",
      "  enabled: true",
      "  reply_seconds: 0"
    ]
    : [
      "upstreams:",
      "  - provider: anthropic",
      `    base_url: ${options.upstreamBaseUrl}`,
      "    auth:",
      `      api_key: ${options.upstreamApiKey}`,
      "    forward_user_identity: true"
    ];
  return [
    "listen:",
    "  host: 127.0.0.1",
    `  port: ${options.gatewayPort}`,
    `  public_url: http://127.0.0.1:${options.gatewayPort}`,
    "oidc:",
    `  issuer: http://127.0.0.1:${options.dexPort}`,
    `  client_id: ${oidcClient.id}`,
    `  client_secret: ${oidcClient.secret}`,
    "  userinfo_fallback: true",
    "  scopes: [openid, profile, email, offline_access, groups]",
    "session:",
    `  jwt_secret: ${options.jwtSecret}`,
    "  ttl_hours: 8",
    "store:",
    `  postgres_url: ${postgresUrl}`,
    ...upstream,
    "auto_include_builtin_models: true",
    "admin:",
    "  write_keys:",
    "    - id: dev",
    `      key: ${options.adminWriteKey}`,
    "  admin_groups: [authors]",
    ""
  ].join("\n");
}

/** @param {Pick<GatewayConfigOptions, "dexPort" | "gatewayPort">} options */
export function renderDexConfig(options) {
  return [
    `issuer: http://127.0.0.1:${options.dexPort}`,
    "storage:",
    "  type: memory",
    "web:",
    "  http: 0.0.0.0:5556",
    "oauth2:",
    "  skipApprovalScreen: true",
    "connectors:",
    "  - type: mockCallback",
    "    id: mock",
    "    name: Mock",
    "staticClients:",
    `  - id: ${oidcClient.id}`,
    `    secret: ${oidcClient.secret}`,
    "    name: LLMR dev gateway",
    "    redirectURIs:",
    `      - http://127.0.0.1:${options.gatewayPort}/oauth/callback`,
    ""
  ].join("\n");
}

/** @param {string[]} argv */
export function parseArgs(argv) {
  const parsed = { dexPort: 15556, gatewayPort: 18080, loadTest: false, upstreamApiKey: undefined, upstreamBaseUrl: "http://127.0.0.1:3456" };
  const valueFlags = {
    "--api-key": (value) => { parsed.upstreamApiKey = value; },
    "--dex-port": (value) => { parsed.dexPort = parsePort(value, "--dex-port"); },
    "--port": (value) => { parsed.gatewayPort = parsePort(value, "--port"); },
    "--upstream": (value) => { parsed.upstreamBaseUrl = value; }
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--load-test") {
      parsed.loadTest = true;
      continue;
    }
    const assign = valueFlags[flag];
    if (!assign || argv[index + 1] === undefined) {
      throw new Error(`unknown or incomplete flag ${flag}; expected --load-test, --upstream <url>, --api-key <key>, --port <n>, --dex-port <n>`);
    }
    assign(argv[index + 1]);
    index += 1;
  }
  return parsed;
}

function parsePort(value, flag) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${flag} needs a port number, got ${value}`);
  }
  return port;
}

function main(argv) {
  const args = parseArgs(argv);
  try {
    execFileSync("sh", ["-c", "command -v claude"], { stdio: "ignore" });
  } catch {
    console.error("claude is not on PATH; install Claude Code 2.1.282 or later, which ships the gateway subcommand.");
    process.exit(1);
  }
  const harnessDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "docker", "claude-apps-gateway");
  const composeFile = path.join(harnessDir, "compose.yaml");
  const secrets = { adminWriteKey: randomBytes(32).toString("base64url"), jwtSecret: randomBytes(32).toString("base64url") };
  const gatewayYaml = renderGatewayConfig({ ...args, ...secrets });
  const env = { ...process.env, CLAUDE_GATEWAY_ALLOW_LOOPBACK: "1", DEX_PORT: String(args.dexPort) };
  writeFileSync(path.join(harnessDir, "dex.rendered.yaml"), renderDexConfig(args));
  execFileSync("docker", ["compose", "-f", composeFile, "up", "-d", "--wait"], { env, stdio: "inherit" });
  const gatewayFile = path.join(harnessDir, "gateway.rendered.yaml");
  writeFileSync(gatewayFile, gatewayYaml, { mode: 0o600 });
  console.log(`gateway config: ${gatewayFile}`);
  console.log(`admin write key (shown once): ${secrets.adminWriteKey}`);
  console.log(`postgres: ${postgresUrl}`);
  console.log("A new JWT secret was generated; tokens from earlier runs are invalid.");
  console.log(args.loadTest ? "load-test mode: the gateway answers /v1/messages itself" : `upstream: ${args.upstreamBaseUrl}`);
  const child = spawn("claude", ["gateway", "--config", gatewayFile], { env, stdio: "inherit" });
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}

if (process.argv[1] && path.basename(process.argv[1]) === "claude-apps-gateway-dev.mjs") {
  main(process.argv.slice(2));
}
