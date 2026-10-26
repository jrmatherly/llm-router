import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs as parseNodeArgs } from "node:util";

const versionedFiles = [
  "package.json",
  "package-lock.json",
  "packages/cli/package.json",
  "packages/core/package.json",
  "packages/electron/package.json",
  "packages/ui/package.json"
];
const checks = [["npm", ["run", "typecheck"]], ["npm", ["run", "test:architecture"]]];

export function parseReleaseArgs(argv) {
  const { positionals, values } = parseNodeArgs({
    allowPositionals: true,
    args: argv,
    options: {
      "dry-run": { default: false, type: "boolean" },
      "skip-checks": { default: false, type: "boolean" }
    },
    strict: true
  });
  if (positionals.length !== 1) {
    throw new Error("usage: npm run release -- <major|minor|patch|x.y.z> [--dry-run] [--skip-checks]");
  }
  return { dryRun: values["dry-run"], skipChecks: values["skip-checks"], spec: positionals[0] };
}

export function nextVersion(current, spec) {
  const parts = current.split(".").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0)) {
    throw new Error(`current version ${current} is not x.y.z`);
  }
  const [major, minor, patch] = parts;
  const bumped = { major: `${major + 1}.0.0`, minor: `${major}.${minor + 1}.0`, patch: `${major}.${minor}.${patch + 1}` }[spec];
  if (bumped) {
    return bumped;
  }
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(spec)) {
    throw new Error(`version ${spec} is not major, minor, patch or x.y.z`);
  }
  const next = spec.split(".").map(Number);
  const higher = next[0] > major || (next[0] === major && (next[1] > minor || (next[1] === minor && next[2] > patch)));
  if (!higher) {
    throw new Error(`version ${spec} is not above the current ${current}`);
  }
  return spec;
}

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], ...options }).trim();
}

function preflight(version) {
  const failures = [];
  if (run("git", ["branch", "--show-current"]) !== "main") {
    failures.push("not on main");
  }
  if (run("git", ["status", "--porcelain"])) {
    failures.push("working tree is not clean");
  }
  run("git", ["fetch", "--quiet", "origin", "main", "--tags"]);
  if (run("git", ["rev-parse", "HEAD"]) !== run("git", ["rev-parse", "origin/main"])) {
    failures.push("main is not at origin/main");
  }
  if (run("git", ["tag", "--list", `v${version}`])) {
    failures.push(`tag v${version} already exists`);
  }
  if (failures.length) {
    throw new Error(`release preflight failed: ${failures.join("; ")}`);
  }
}

function main(argv) {
  const args = parseReleaseArgs(argv);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  process.chdir(root);
  const current = JSON.parse(readFileSync("package.json", "utf8")).version;
  const version = nextVersion(current, args.spec);
  const tag = `v${version}`;
  console.log(`${current} -> ${version}${args.dryRun ? " (dry run)" : ""}`);
  preflight(version);
  if (args.dryRun) {
    console.log(`would bump ${versionedFiles.join(", ")}, run ${checks.map(([, a]) => a.join(" ")).join(" and ")}, commit "chore: release ${tag}", tag ${tag}, push main and the tag`);
    return;
  }
  run("npm", ["version", version, "--workspaces", "--include-workspace-root", "--no-git-tag-version", "--ignore-scripts", "--package-lock-only"]);
  try {
    for (const [command, commandArgs] of args.skipChecks ? [] : checks) {
      run(command, commandArgs, { stdio: "inherit" });
    }
  } catch (error) {
    run("git", ["checkout", "--", ...versionedFiles]);
    throw error;
  }
  run("git", ["add", ...versionedFiles]);
  run("git", ["commit", "--quiet", "-m", `chore: release ${tag}`]);
  run("git", ["tag", "-a", tag, "-m", tag]);
  run("git", ["push", "--atomic", "origin", "main", tag], { stdio: "inherit" });
  console.log(`pushed ${tag}; the Release workflow builds the GitHub release and the Docker release follows it: gh run list --workflow=release.yml`);
}

if (process.argv[1] && path.basename(process.argv[1]) === "release.mjs") {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
