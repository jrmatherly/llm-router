import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { guardTestNetwork, isolateTestHome, refusalReport, refusedConnectionFailsRun, refusedConnections } from "./test-home-env.mjs";
import "./test-network-guard.mjs";

// Compiled test bundles import this first. `node --test` on one file runs with
// the developer's real HOME, and the profile service then rewrote
// ~/.claude/settings.json on 2026-10-25, so a run outside run-tests.mjs gets a
// temporary home here.
// Under run-tests.mjs every test file is its own process, and they run at the
// same time. Each takes a folder of its own inside the suite's home: files that
// shared one raced on the persisted keys and config, and a test lost a key it
// had just written.
const ownsHome = !process.env.LLMR_TEST_HOME;
const home = mkdtempSync(path.join(process.env.LLMR_TEST_HOME ?? os.tmpdir(), "llmr-test-home-"));
isolateTestHome(home);
if (!process.env.LLMR_TEST_FILE && process.argv[1]) {
  process.env.LLMR_TEST_FILE = path.relative(process.cwd(), process.argv[1]);
}
const networkLog = process.env.LLMR_TEST_NETWORK_LOG ?? path.join(home, "network-refused.log");
// The bundle is CommonJS, so there is no import.meta.url; both runners start in the repo root.
guardTestNetwork(process.env, path.resolve("build", "test-network-guard.mjs"), networkLog);

if (ownsHome) {
  process.on("exit", () => {
    const refused = refusedConnections(networkLog);
    if (refused.length > 0) {
      console.error([refusalReport(refused), ...refused].join("\n"));
      if (refusedConnectionFailsRun) {
        process.exitCode = 1;
      }
    }
    try {
      rmSync(home, { force: true, maxRetries: 3, recursive: true });
    } catch (error) {
      // On Windows an open database handle refuses the removal; a leftover folder must not fail a passing run.
      console.warn(`could not remove the test home ${home} (${error.code})`);
    }
  });
}
