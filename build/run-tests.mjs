import electron from "electron";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { guardTestNetwork, isolateTestHome, refusalReport, refusedConnectionFailsRun, refusedConnections } from "./test-home-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const testsOutDir = path.join(projectRoot, ".test-dist");
const testProjects = {
  architecture: { runtime: "node" },
  cli: { runtime: "node" },
  core: { runtime: "node" },
  electron: { runtime: "electron" },
  ui: { runtime: "node" }
};
const requestedProjects = process.argv.slice(2);
const projects = requestedProjects.length === 0 ? Object.keys(testProjects) : requestedProjects;

for (const project of projects) {
  if (!testProjects[project]) {
    throw new Error(`Unknown test project: ${project}`);
  }
}

for (const project of projects) {
  await runProject(project);
}

async function runProject(project) {
  const testFiles = findCompiledTests(path.join(testsOutDir, project, "test"));
  if (testFiles.length === 0) {
    console.log(`No ${project} tests found.`);
    return;
  }

  const testHome = mkdtempSync(path.join(os.tmpdir(), `llmr-${project}-test-home-`));
  const runtime = testProjects[project].runtime;
  const executable = runtime === "electron" ? electron : process.execPath;
  const networkLog = path.join(testHome, "network-refused.log");
  const env = guardTestNetwork({
    ...isolateTestHome(testHome, { ...process.env }),
    ...(runtime === "electron" ? { ELECTRON_RUN_AS_NODE: "1" } : {})
  }, path.join(__dirname, "test-network-guard.mjs"), networkLog);
  delete env.LLMR_TEST_FILE;
  console.log(`\nRunning ${project} tests with ${runtime}...`);

  try {
    await new Promise((resolve, reject) => {
      const child = spawn(executable, ["--test", ...testFiles], {
        cwd: projectRoot,
        env,
        stdio: "inherit"
      });

      child.on("error", reject);
      child.on("exit", (code, signal) => {
        const refused = refusedConnections(networkLog);
        if (refused.length > 0) {
          console.log([`${project}: ${refusalReport(refused)}`, ...refused].join("\n"));
          if (refusedConnectionFailsRun) {
            reject(new Error(`${project} tests connected to an outside host`));
            return;
          }
        }
        if (signal) {
          reject(new Error(`${project} tests exited from signal ${signal}`));
          return;
        }
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`${project} tests exited with code ${code ?? 1}`));
      });
    });
  } finally {
    try {
      rmSync(testHome, { force: true, maxRetries: 3, recursive: true });
    } catch {
      // On Windows a handle still open refuses the removal; it must not hide the suite's result.
    }
  }
}

function findCompiledTests(dir) {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return findCompiledTests(file);
    }
    return entry.isFile() && entry.name.endsWith(".test.js") ? [file] : [];
  }).sort();
}
