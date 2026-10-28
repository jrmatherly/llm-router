import assert from "node:assert/strict";
import test from "node:test";
import { shouldEnableClaudeAppDesignCdp } from "@llmr/core/agents/claude-app/cdp.ts";

test("Claude App Design CDP is opt-in even when Claude Design is configured", (t) => {
  const previous = process.env.LLMR_CLAUDE_APP_DESIGN_CDP;
  t.after(() => {
    if (previous === undefined) {
      delete process.env.LLMR_CLAUDE_APP_DESIGN_CDP;
    } else {
      process.env.LLMR_CLAUDE_APP_DESIGN_CDP = previous;
    }
  });

  delete process.env.LLMR_CLAUDE_APP_DESIGN_CDP;
  assert.equal(shouldEnableClaudeAppDesignCdp(true), false);
  assert.equal(shouldEnableClaudeAppDesignCdp(false), false);

  process.env.LLMR_CLAUDE_APP_DESIGN_CDP = "true";
  assert.equal(shouldEnableClaudeAppDesignCdp(false), true);

  process.env.LLMR_CLAUDE_APP_DESIGN_CDP = "off";
  assert.equal(shouldEnableClaudeAppDesignCdp(true), false);
});
