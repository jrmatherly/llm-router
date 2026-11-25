import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs as parseNodeArgs } from "node:util";

/**
 * @typedef {{ adminWriteKey: string; dexPort: number; gatewayPort: number; jwtSecret: string; loadTest: boolean; upstreamApiKey?: string; upstreamBaseUrl: string }} GatewayConfigOptions
 */

const postgresUrl = "postgres://gw:pw@127.0.0.1:15432/gateway";
const oidcClient = { id: "llmr-dev", secret: "llmr-dev-secret" };

/** @param {GatewayConfigOptions} options */
export function renderGatewayConfig(options) {
  if (options.adminWriteKey.length < 32 || Buffer.byteLength(options.jwtSecret) < 32) {
    throw new Error("admin write key must be at least 32 characters and the JWT secret at least 32 bytes");
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
      `    base_url: ${JSON.stringify(options.upstreamBaseUrl)}`,
      "    auth:",
      `      api_key: ${JSON.stringify(options.upstreamApiKey)}`,
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
  const { values } = parseNodeArgs({
    args: argv,
    options: {
      "api-key": { type: "string" },
      "dex-port": { default: "15556", type: "string" },
      keep: { default: false, type: "boolean" },
      "load-test": { default: false, type: "boolean" },
      port: { default: "18080", type: "string" },
      upstream: { default: "http://127.0.0.1:3456", type: "string" }
    },
    strict: true
  });
  return {
    dexPort: parsePort(values["dex-port"], "--dex-port"),
    gatewayPort: parsePort(values.port, "--port"),
    keep: values.keep,
    loadTest: values["load-test"],
    upstreamApiKey: values["api-key"],
    upstreamBaseUrl: values.upstream
  };
}

const gatewayEnvPassThrough = ["CLAUDE_GATEWAY_DRAIN_TIMEOUT_MS", "CLAUDE_GATEWAY_LOG_FORMAT", "CLAUDE_GATEWAY_LOG_LEVEL", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY"];

/**
 * @param {NodeJS.ProcessEnv} base
 * @param {string} stateDir
 * @returns {NodeJS.ProcessEnv}
 */
export function gatewayChildEnv(base, stateDir) {
  /** @type {NodeJS.ProcessEnv} */
  const env = { CLAUDE_CONFIG_DIR: path.join(stateDir, "claude"), CLAUDE_GATEWAY_ALLOW_LOOPBACK: "1", HOME: stateDir, PATH: base.PATH };
  for (const name of gatewayEnvPassThrough) {
    if (base[name] !== undefined) env[name] = base[name];
  }
  return env;
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
  const harnessDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "docker", "claude-apps-gateway");
  const stateDir = path.join(harnessDir, ".state");
  mkdirSync(stateDir, { mode: 0o700, recursive: true });
  const gatewayEnv = gatewayChildEnv(process.env, stateDir);
  try {
    execFileSync("claude", ["--version"], { env: gatewayEnv, stdio: "ignore" });
  } catch (error) {
    if (!args.keep) rmSync(stateDir, { force: true, recursive: true });
    throw error?.code === "ENOENT" ? new Error("claude is not on PATH; install Claude Code.") : error;
  }
  const composeFile = path.join(harnessDir, "compose.yaml");
  const dexFile = path.join(harnessDir, "dex.rendered.yaml");
  const gatewayFile = path.join(harnessDir, "gateway.rendered.yaml");
  const teardownHint = `containers may still be running: docker compose -f ${composeFile} down -v`;
  const secrets = { adminWriteKey: randomBytes(32).toString("base64url"), jwtSecret: randomBytes(32).toString("base64url") };
  const gatewayYaml = renderGatewayConfig({ ...args, ...secrets });
  // Docker finds its plugins and socket through the caller's home, so compose keeps the caller's environment.
  const composeEnv = { ...process.env, DEX_PORT: String(args.dexPort) };
  let composeStarted = false;
  let cleanedUp = false;
  const cleanUp = () => {
    if (cleanedUp) return true;
    cleanedUp = true;
    if (args.keep) {
      console.log(`--keep: ${teardownHint}`);
      return true;
    }
    let containersRemoved = !composeStarted;
    if (composeStarted) {
      try {
        execFileSync("docker", ["compose", "-f", composeFile, "down", "-v"], { env: composeEnv, stdio: "inherit" });
        containersRemoved = true;
      } catch {
        console.error(`docker compose down failed; ${teardownHint}`);
      }
    }
    for (const file of [gatewayFile, dexFile, stateDir]) rmSync(file, { force: true, recursive: true });
    console.log(containersRemoved ? "removed the harness containers, volume, rendered files and state directory" : "removed the rendered files and state directory");
    return containersRemoved;
  };
  /** @type {import("node:child_process").ChildProcess | undefined} */
  let child;
  // Registered before compose runs: without a handler, a signal during the blocking `up` ends this process with nothing cleaned up.
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      if (child) {
        child.kill(signal === "SIGHUP" ? "SIGTERM" : signal);
      } else {
        process.exit(cleanUp() ? 130 : 1);
      }
    });
  }
  try {
    writeFileSync(dexFile, renderDexConfig(args));
    writeFileSync(gatewayFile, gatewayYaml, { mode: 0o600 });
    composeStarted = true;
    execFileSync("docker", ["compose", "-f", composeFile, "up", "-d", "--wait"], { env: composeEnv, stdio: "inherit" });
  } catch (error) {
    const dockerMissing = error?.syscall === "spawnSync docker";
    if (dockerMissing) composeStarted = false;
    cleanUp();
    throw dockerMissing ? new Error("docker is not on PATH") : composeStarted ? new Error("docker compose failed") : error;
  }
  console.log(`gateway config: ${gatewayFile}`);
  console.log(`admin write key (shown once): ${secrets.adminWriteKey}`);
  console.log(`postgres: ${postgresUrl}`);
  console.log("A new JWT secret was generated; tokens from earlier runs are invalid.");
  console.log(args.loadTest ? "load-test mode: the gateway answers /v1/messages itself" : `upstream: ${args.upstreamBaseUrl}`);
  child = spawn("claude", ["gateway", "--config", gatewayFile], { env: gatewayEnv, stdio: "inherit" });
  child.on("error", (error) => {
    console.error(`failed to start claude gateway: ${error.message}`);
    cleanUp();
    process.exit(1);
  });
  child.on("exit", (code, signal) => {
    console.log("gateway stopped");
    const cleaned = cleanUp();
    process.exit(!cleaned ? 1 : signal === "SIGINT" || signal === "SIGTERM" ? 0 : code ?? 1);
  });
}

if (process.argv[1] && path.basename(process.argv[1]) === "claude-apps-gateway-dev.mjs") {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
