import { spawnSync } from "node:child_process";

const GENERATED_FILES = ["packages/core/models.json", "packages/ui/src/generated"];
const DEFAULT_SUITES = ["test:core", "test:ui", "test:electron", "test:cli"].map((suite) => ["npm", ["run", suite]]);
const DEFAULT_E2E = ["npm", ["run", "test:e2e"]];

const root = resolveRoot();
const withE2e = process.argv.includes("--e2e");
const suites = process.env.LLMR_VERIFY_COMMANDS ? JSON.parse(process.env.LLMR_VERIFY_COMMANDS) : DEFAULT_SUITES;

for (const [command, args] of suites) {
  if (!runSuite(command, args)) {
    process.exit(1);
  }
}

if (withE2e) {
  const clean = spawnSync("git", ["diff", "--quiet", "--", ...GENERATED_FILES], { cwd: root, stdio: "ignore" }).status === 0;
  const [command, args] = process.env.LLMR_VERIFY_E2E_COMMAND ? JSON.parse(process.env.LLMR_VERIFY_E2E_COMMAND) : DEFAULT_E2E;
  const passed = runSuite(command, args);
  if (clean) {
    spawnSync("git", ["checkout", "--", ...GENERATED_FILES], { cwd: root, stdio: "inherit" });
    console.log("RESTORED generated files");
  } else {
    console.log("SKIPPED restore: generated files had prior changes");
  }
  process.exit(passed ? 0 : 1);
}

function runSuite(command, args) {
  const label = command === "npm" && args[0] === "run" ? args[1] : [command, ...args].join(" ");
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  console.log(`${result.status === 0 ? "PASS" : "FAIL"} ${label}`);
  return result.status === 0;
}

function resolveRoot() {
  const git = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: "pipe" });
  return git.status === 0 && git.stdout.trim() ? git.stdout.trim() : process.cwd();
}
