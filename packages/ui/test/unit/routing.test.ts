import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRoutingRuleRows,
  normalizeRouteScriptSampleRequest,
  normalizeRouterRules
} from "@llmr/ui/pages/home/shared/routing.ts";
import {
  createRoutingRuleDraft,
  createRoutingRuleDraftFromRule,
  isRoutingRuleDraftSubmittable,
  routingRuleFromDraft
} from "@llmr/ui/pages/home/shared/providers.ts";
import { appConfigFixture } from "../fixtures/index.ts";

test("global routing rows omit Claude Code and Codex built-in profile routes", () => {
  const config = appConfigFixture();
  config.profile.profiles = [
    {
      agent: "claude-code",
      enabled: true,
      id: "claude",
      model: "Provider/claude-sonnet",
      name: "Claude",
      scope: "llmr"
    },
    {
      agent: "codex",
      enabled: true,
      id: "codex",
      model: "uuroute/gpt-5.5",
      name: "Codex",
      scope: "llmr"
    }
  ];

  assert.deepEqual(buildRoutingRuleRows(config), []);
});

test("routing UI preserves the Node.js script file and timeout", () => {
  const rules = normalizeRouterRules([{
    enabled: true,
    id: "node-script",
    name: "Node script",
    script: {
      apiVersion: 1,
      file: "/tmp/route-script.js",
      language: "javascript",
      permissions: {
        environment: ["ROUTER_TOKEN"],
        filesystem: { read: ["~/.config/router"], write: ["~/.cache/router"] },
        network: ["https://api.example.com/v1"]
      },
      readPaths: ["request.body.metadata"],
      timeoutMs: 3500
    },
    type: "script"
  }]);

  assert.equal(rules?.[0]?.type, "script");
  const draft = createRoutingRuleDraftFromRule(rules![0]);
  assert.equal(draft.type, "script");
  assert.equal(draft.scriptFile, "/tmp/route-script.js");
  assert.equal(draft.scriptTimeoutMs, "3500");
  assert.deepEqual(draft.rewrites, []);
  assert.deepEqual(rules?.[0]?.script, {
    apiVersion: 1,
    file: "/tmp/route-script.js",
    language: "javascript",
    timeoutMs: 3500
  });
});

test("script routing drafts do not depend on request rewrite rows", () => {
  const draft = createRoutingRuleDraft();
  draft.name = "Script";
  draft.type = "script";
  draft.scriptFile = "/tmp/route-script.js";
  draft.rewrites = [];
  assert.equal(isRoutingRuleDraftSubmittable(draft), true);

  draft.rewrites = [{
    id: "incomplete",
    key: "request.body.temperature",
    match: "",
    operation: "set",
    value: ""
  }];
  assert.equal(isRoutingRuleDraftSubmittable(draft), true);
});

test("route script test JSON accepts request headers and body together", () => {
  assert.deepEqual(normalizeRouteScriptSampleRequest({
    body: { messages: [{ role: "user", content: "hello" }], model: "Provider/alpha" },
    headers: {
      authorization: "Bearer test",
      "x-tags": ["one", "two"]
    },
    method: "POST",
    url: "/v1/messages"
  }), {
    body: { messages: [{ role: "user", content: "hello" }], model: "Provider/alpha" },
    headers: {
      authorization: "Bearer test",
      "x-tags": ["one", "two"]
    },
    method: "POST",
    url: "/v1/messages"
  });
  assert.throws(
    () => normalizeRouteScriptSampleRequest({ body: {}, headers: { invalid: 123 } }),
    /headers/i
  );
});

test("#1868 UI edits preserve a script prefilter and empty pass-through rewrites", () => {
  const condition = { left: "request.body.model", operator: "starts-with" as const, right: "lane/" };
  const script = { enabled: true, id: "filtered", name: "Filtered", type: "script" as const, condition,
    script: { apiVersion: 1 as const, language: "javascript" as const, file: "/tmp/route.js", timeoutMs: 2000 } };
  const draft = createRoutingRuleDraftFromRule(script);
  assert.equal(isRoutingRuleDraftSubmittable(draft), true);
  assert.deepEqual(routingRuleFromDraft(draft, [], script).condition, condition);
  const pass = { enabled: true, id: "pass", name: "Pass", type: "condition" as const, condition };
  const passDraft = createRoutingRuleDraftFromRule(pass);
  assert.deepEqual(passDraft.rewrites, []);
  assert.equal(isRoutingRuleDraftSubmittable(passDraft), true);
  assert.deepEqual(routingRuleFromDraft(passDraft, [], pass).rewrites, []);
});

test("a condition on a path the editor cannot show keeps its path and takes the editor's operator and value", () => {
  const condition = { left: "request.tokenCount", operator: ">" as const, right: "100000" };
  const script = { enabled: true, id: "big", name: "Big", type: "script" as const, condition,
    script: { apiVersion: 1 as const, language: "javascript" as const, file: "/tmp/route.js", timeoutMs: 2000 } };
  const draft = { ...createRoutingRuleDraftFromRule(script), name: "Renamed" };
  assert.equal(draft.conditionField, "");
  assert.equal(isRoutingRuleDraftSubmittable(draft), true);
  assert.deepEqual(routingRuleFromDraft(draft, [], script).condition, condition);
  assert.deepEqual(
    routingRuleFromDraft({ ...draft, conditionOperator: "<", conditionRight: " 200000 " }, [], script).condition,
    { left: "request.tokenCount", operator: "<", right: "200000" }
  );
  const cleared = { ...draft, conditionRight: "" };
  assert.equal(isRoutingRuleDraftSubmittable(cleared), true);
  assert.equal(routingRuleFromDraft(cleared, [], script).condition, undefined);

  const pass = { enabled: true, id: "pass", name: "Pass", type: "condition" as const, condition };
  const passDraft = createRoutingRuleDraftFromRule(pass);
  assert.equal(isRoutingRuleDraftSubmittable(passDraft), true);
  assert.deepEqual(routingRuleFromDraft(passDraft, [], pass).condition, condition);
  assert.equal(isRoutingRuleDraftSubmittable({ ...passDraft, conditionRight: "" }), false);
});

test("a half-filled script prefilter blocks the save, and clearing the field removes the prefilter", () => {
  const condition = { left: "request.body.model", operator: "starts-with" as const, right: "lane/" };
  const script = { enabled: true, id: "filtered", name: "Filtered", type: "script" as const, condition,
    script: { apiVersion: 1 as const, language: "javascript" as const, file: "/tmp/route.js", timeoutMs: 2000 } };
  const draft = createRoutingRuleDraftFromRule(script);
  assert.equal(isRoutingRuleDraftSubmittable({ ...draft, conditionRight: "" }), false);
  assert.equal(isRoutingRuleDraftSubmittable({ ...draft, conditionField: "" }), false);
  const cleared = { ...draft, conditionField: "", conditionRight: "" };
  assert.equal(isRoutingRuleDraftSubmittable(cleared), true);
  assert.equal(routingRuleFromDraft(cleared, [], script).condition, undefined);
});

test("a script rule's unreadable prefilter stays flagged through the editor's config round trip", () => {
  const raw = { enabled: true, id: "typo", name: "Typo", type: "script",
    condition: { left: "request.body.model", operator: "startsWith", right: "lane/" },
    script: { apiVersion: 1, language: "javascript", file: "/tmp/route.js", timeoutMs: 2000 } };
  const [rule] = normalizeRouterRules([raw]) ?? [];
  assert.equal(rule.condition, undefined);
  assert.equal(rule.conditionInvalid, true);
  assert.equal(normalizeRouterRules([rule])?.[0].conditionInvalid, true);
  assert.equal(routingRuleFromDraft(createRoutingRuleDraftFromRule(rule), [], rule).conditionInvalid, undefined);
});
