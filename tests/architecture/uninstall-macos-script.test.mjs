import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { agentLeftover, bundlesClaimingSchemes, parseUninstallArgs, planUninstall, proxyPointsAtLoopback, schemes } from "../../scripts/uninstall-macos.mjs";

function sourceString(file, name) {
  const match = new RegExp(`export const ${name} = "([^"]+)"`).exec(readFileSync(file, "utf8"));
  assert.ok(match, `${name} in ${file}`);
  return match[1];
}

test("the uninstaller tracks the app's own backup suffixes and link scheme", () => {
  const backups = "packages/core/src/profiles/backup-files.ts";
  for (const name of ["backupMarker", "originalBackupSuffix", "originalMissingSuffix"]) {
    const suffix = sourceString(backups, name);
    assert.match(`settings.json${suffix}${name === "backupMarker" ? "2026-10-27T00-00-00-000Z" : ""}`, agentLeftover, name);
  }
  assert.ok(schemes.includes(sourceString("packages/core/src/contracts/deep-link.ts", "appDeepLinkProtocol")));
});

function scratch(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "llmr-uninstall-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const home = path.join(root, "home");
  const applications = path.join(root, "Applications");
  const files = {
    ".claude/settings.json": "{}",
    ".claude/settings.json.ccr-backup-2026-10-26T05-16-29-585Z": "{}",
    ".claude/.claude.json.ccr-original-missing": "",
    ".codex/config.toml": "",
    ".codex/ccr-model-catalog.json": "{}",
    ".codex/claude-code-router.config.toml": "",
    ".codex/auth.json": "{}",
    ".llm-router/config.sqlite": "",
    ".llm-router/bin/llmr": "",
    "Library/Application Support/LLM Router/x": "",
    "Library/Preferences/com.apple.LaunchServices/com.apple.launchservices.secure.plist": "plist"
  };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(home, file)), { recursive: true });
    writeFileSync(path.join(home, file), content);
  }
  mkdirSync(path.join(applications, "LLM Router.app"), { recursive: true });
  mkdirSync(path.join(applications, "Claude Code Router.app"), { recursive: true });
  mkdirSync(path.join(home, ".claude-code-router"), { recursive: true });
  const strayCopy = path.join(root, "Trash/files/LLM Router.app_1");
  mkdirSync(strayCopy, { recursive: true });
  return { applications, home, strayCopy };
}

function fakeSystem(overrides = {}) {
  const calls = [];
  let handlers = [7, 12];
  return {
    calls,
    system: {
      appRunning: () => false,
      caInstalled: () => false,
      handlerIndexes: (_plist, wanted) => {
        calls.push(["handlerIndexes", wanted]);
        return handlers;
      },
      localProxyActive: () => false,
      registeredBundles: () => [...(overrides.strayCopies ?? []), "/Volumes/LLM Router 4.3.2-arm64/LLM Router.app"],
      removeHandler: (_plist, index) => {
        calls.push(["removeHandler", index]);
        handlers = handlers.filter((value) => value !== index);
      },
      tar: (archive, _cwd, entries, excludes) => {
        writeFileSync(archive, "");
        calls.push(["tar", path.basename(archive), entries.sort(), excludes]);
      },
      unregister: (bundle) => calls.push(["unregister", bundle]),
      ...overrides
    }
  };
}

test("parseUninstallArgs is a dry run that deletes data unless told otherwise", () => {
  assert.deepEqual(parseUninstallArgs([]), { help: false, includeLegacy: false, keepData: false, yes: false });
  assert.deepEqual(parseUninstallArgs(["--yes", "--keep-data", "--include-legacy"]), { help: false, includeLegacy: true, keepData: true, yes: true });
  assert.throws(() => parseUninstallArgs(["--purge"]), /--purge/);
});

test("bundlesClaimingSchemes finds every bundle that claims ccr or llmr, wherever it lives", () => {
  const dump = [
    "path:                       /Applications/LLM Router.app (0x7738)",
    "claimed schemes:            llmr:",
    "--------------------------------------------------------------------------------",
    "path:                       /Users/x/.local/share/Trash/files/Claude Code Router.app (0x7170)",
    "claimed schemes:            ccr:, x-other:",
    "--------------------------------------------------------------------------------",
    "path:                       /Applications/Xcode.app (0x10)",
    "claimed schemes:            xcode:, ccrx:"
  ].join("\n");
  assert.deepEqual(bundlesClaimingSchemes(dump), ["/Applications/LLM Router.app", "/Users/x/.local/share/Trash/files/Claude Code Router.app"]);
});

test("a full uninstall backs up first, then removes apps, handlers, agent leftovers and data", (t) => {
  const { applications, home, strayCopy } = scratch(t);
  const { calls, system } = fakeSystem({ strayCopies: [strayCopy] });
  const plan = planUninstall({ applications, home, now: new Date("2026-10-27T18:00:00Z"), system });

  assert.deepEqual(plan.blockers, []);
  assert.match(plan.steps[0].describe, /^Back up 6 item/);
  for (const step of plan.steps) step.run();

  assert.deepEqual(calls[0], ["handlerIndexes", ["llmr"]], "only the current scheme without --include-legacy");
  assert.ok(existsSync(path.join(applications, "Claude Code Router.app")), "upstream app untouched without --include-legacy");
  assert.ok(existsSync(path.join(home, ".claude-code-router")), "upstream data untouched without --include-legacy");
  assert.deepEqual(calls.find(([kind]) => kind === "tar"), ["tar", "data.tgz", [
    ".claude/.claude.json.ccr-original-missing",
    ".claude/settings.json.ccr-backup-2026-10-26T05-16-29-585Z",
    ".codex/ccr-model-catalog.json",
    ".codex/claude-code-router.config.toml",
    ".llm-router",
    "Library/Application Support/LLM Router"
  ], [".llm-router/bin", ".llm-router/models.json"]]);
  assert.deepEqual(calls.filter(([kind]) => kind === "removeHandler"), [["removeHandler", 12], ["removeHandler", 7]], "highest index first so earlier indexes stay valid");
  assert.deepEqual(calls.filter(([kind]) => kind === "unregister").map(([, bundle]) => bundle), [path.join(applications, "LLM Router.app"), strayCopy], "stray copies are unregistered; stale registrations for unmounted DMGs are skipped");
  const backupDir = path.join(home, "llmr-uninstall-backup-2026-10-27T18-00-00-000Z");
  assert.ok(existsSync(path.join(backupDir, "launchservices.plist")), "LaunchServices preferences copied before editing");
  assert.equal(statSync(backupDir).mode & 0o777, 0o700, "backup folder is owner-only");
  for (const file of ["data.tgz", "launchservices.plist"]) {
    assert.equal(statSync(path.join(backupDir, file)).mode & 0o777, 0o600, `${file} is owner-only`);
  }

  for (const gone of [".llm-router", "Library/Application Support/LLM Router", ".claude/settings.json.ccr-backup-2026-10-26T05-16-29-585Z", ".codex/ccr-model-catalog.json"]) {
    assert.equal(existsSync(path.join(home, gone)), false, gone);
  }
  assert.equal(existsSync(path.join(applications, "LLM Router.app")), false);
  for (const kept of [".claude/settings.json", ".codex/config.toml", ".codex/auth.json"]) {
    assert.ok(existsSync(path.join(home, kept)), kept);
  }
});

test("--include-legacy also removes Claude Code Router builds, data and the ccr handler", (t) => {
  const { applications, home } = scratch(t);
  const { calls, system } = fakeSystem();
  const plan = planUninstall({ applications, home, includeLegacy: true, system });
  for (const step of plan.steps) step.run();

  assert.deepEqual(calls[0], ["handlerIndexes", ["llmr", "ccr"]]);
  assert.equal(existsSync(path.join(applications, "Claude Code Router.app")), false);
  assert.equal(existsSync(path.join(home, ".claude-code-router")), false);
});

test("a note says so when LaunchServices writes the handlers back", (t) => {
  const { applications, home } = scratch(t);
  const plan = planUninstall({ applications, home, system: fakeSystem({ handlerIndexes: () => [3], removeHandler: () => {} }).system });
  for (const step of plan.steps) step.run();
  assert.match(plan.notes.join("\n"), /wrote the link handlers back/);
});

test("proxyPointsAtLoopback pairs each enable flag with its own host", () => {
  assert.equal(proxyPointsAtLoopback("  HTTPEnable : 1\n  HTTPPort : 3456\n  HTTPProxy : 127.0.0.1\n"), true);
  assert.equal(proxyPointsAtLoopback("  HTTPEnable : 1\n  HTTPProxy : proxy.corp\n  SOCKSEnable : 0\n  SOCKSProxy : 127.0.0.1\n"), false);
  assert.equal(proxyPointsAtLoopback("  HTTPSEnable : 0\n  HTTPSProxy : 127.0.0.1\n"), false);
});

test("--keep-data leaves ~/.llm-router and backs up only the agent leftovers", (t) => {
  const { applications, home } = scratch(t);
  const { calls, system } = fakeSystem();
  const plan = planUninstall({ applications, home, keepData: true, system });
  for (const step of plan.steps) step.run();

  assert.ok(existsSync(path.join(home, ".llm-router/config.sqlite")));
  assert.equal(calls.find(([kind]) => kind === "tar")[2].some((entry) => entry.startsWith(".llm-router")), false);
  assert.match(plan.notes.join("\n"), /Kept ~\/\.llm-router/);
});

test("a running app or an agent config still pointing at the gateway blocks the uninstall", (t) => {
  const { applications, home } = scratch(t);
  writeFileSync(path.join(home, ".claude/settings.json"), JSON.stringify({ env: { ANTHROPIC_BASE_URL: "http://127.0.0.1:3456" } }));
  const plan = planUninstall({ applications, home, system: fakeSystem({ appRunning: () => true }).system });
  assert.equal(plan.blockers.length, 2);
  assert.match(plan.blockers[0], /running/);
  assert.match(plan.blockers[1], /\.claude\/settings\.json still points at LLM Router/);
});

test("a settings file that merely mentions the repo path does not block", (t) => {
  const { applications, home } = scratch(t);
  writeFileSync(path.join(home, ".claude/settings.json"), JSON.stringify({ permissions: { allow: ["Read(/Users/me/dev/llm-router/**)"] } }));
  assert.deepEqual(planUninstall({ applications, home, system: fakeSystem().system }).blockers, []);
});

test("a dry run changes nothing", (t) => {
  const { applications, home } = scratch(t);
  const { calls, system } = fakeSystem();
  planUninstall({ applications, home, system });
  assert.deepEqual(calls.filter(([kind]) => kind !== "handlerIndexes"), []);
  assert.ok(existsSync(path.join(home, ".llm-router")));
  assert.ok(existsSync(path.join(applications, "LLM Router.app")));
});
