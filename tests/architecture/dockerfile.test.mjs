import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the runtime image runs as llmr and checks the management server", () => {
  const dockerfile = readFileSync("Dockerfile", "utf8");
  assert.match(dockerfile, /^USER llmr$/m);
  assert.match(dockerfile, /HEALTHCHECK[\s\S]*\/api\/ccr\/rpc/);
});

test("every base image is pinned by digest", () => {
  const images = [...readFileSync("Dockerfile", "utf8").matchAll(/^ARG \w*NODE_IMAGE=(\S+)$/gm)].map((match) => match[1]);
  assert.equal(images.length, 2);
  for (const image of images) assert.match(image, /@sha256:[0-9a-f]{64}$/);
});

test("compose publishes the management port on loopback only", () => {
  assert.match(readFileSync("docker-compose.yml", "utf8"), /^\s+- "127\.0\.0\.1:3458:8080"$/m);
});

test("a manual Docker release moves latest only when asked", () => {
  const workflow = readFileSync(".github/workflows/docker-release.yml", "utf8");
  assert.doesNotMatch(workflow, /default: v\d/);
  assert.doesNotMatch(workflow, /^\s+\$\{\{ env\.IMAGE_NAME \}\}:latest$/m);
  assert.match(workflow, /github\.event_name == 'workflow_run' \|\| inputs\.latest/);
});
