import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test(".dockerignore excludes local state and rendered secrets", () => {
  const entries = readFileSync(".dockerignore", "utf8").split("\n").map((line) => line.trim());
  for (const entry of [".test-dist", ".codegraph", ".serena", ".remember", ".superpowers", "private", ".claude", "docker/claude-apps-gateway/*.rendered.yaml"]) {
    assert.ok(entries.includes(entry), entry);
  }
  assert.ok(!entries.some((entry) => entry.startsWith("docker/local-ai-gateway")), "the Dockerfile copies docker/local-ai-gateway/*.tgz");
});
