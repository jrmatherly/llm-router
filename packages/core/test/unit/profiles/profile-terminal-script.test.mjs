import assert from "node:assert/strict";
import test from "node:test";
import { profileTerminalScript } from "@llmr/core/profiles/launch-service.ts";

test("the terminal script runs the command under the home LLMR runs with and nothing else from its env", () => {
  const script = profileTerminalScript("/Users/a b/.llm-router/bin/llmr 'Claude Main'", {
    ANTHROPIC_API_KEY: "secret",
    HOME: "/Users/a b",
    LLMR_INTERNAL_HOME_DIR: "/tmp/llmr-home",
    LLMR_INTERNAL_EMPTY: ""
  });
  assert.equal(script, [
    "#!/bin/sh",
    "export HOME='/Users/a b'",
    "export LLMR_INTERNAL_HOME_DIR='/tmp/llmr-home'",
    "clear",
    "/Users/a b/.llm-router/bin/llmr 'Claude Main'",
    ""
  ].join("\n"));
});
