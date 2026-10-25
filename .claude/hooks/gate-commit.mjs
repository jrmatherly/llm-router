import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COMMIT_COMMAND = /(^|[\s;&|])(rtk\s+)?git(\s+-[A-Za-z]\S*(\s+\S+)?)*\s+commit\b/;
const DEFAULT_CHECKS = [["npm", ["run", "typecheck"]], ["npm", ["run", "test:architecture"]]];

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  block("commit gate could not parse its hook input");
}

const isCommit = input.tool_name !== "Bash" || COMMIT_COMMAND.test(String(input.tool_input?.command ?? ""));
if (!isCommit) {
  process.exit(0);
}

const root = resolveRoot(input.cwd);
if (packageName(root) !== packageName(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".."))) {
  process.exit(0);
}
if (!existsSync(path.join(root, "node_modules"))) {
  block(`run npm ci in ${root} before committing`);
}

const checks = process.env.CCR_GATE_COMMANDS ? JSON.parse(process.env.CCR_GATE_COMMANDS) : DEFAULT_CHECKS;
for (const [command, args] of checks) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: "pipe" });
  if (result.status !== 0) {
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? `${result.error.message}\n` : ""}`;
    const tail = output.trimEnd().split("\n").slice(-20).join("\n");
    block(`commit gate: ${[command, ...args].join(" ")} failed (status ${result.status})\n${tail}`);
  }
}

process.exit(0);

function resolveRoot(cwd) {
  if (cwd) {
    const git = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", stdio: "pipe" });
    if (git.status === 0 && git.stdout.trim()) {
      return git.stdout.trim();
    }
    return cwd;
  }
  return process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
}

function packageName(dir) {
  try {
    return JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")).name;
  } catch {
    return undefined;
  }
}

function block(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}
