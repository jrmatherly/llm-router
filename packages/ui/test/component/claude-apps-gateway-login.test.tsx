import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ClaudeAppsGatewayLoginStartResult, ClaudeAppsGatewayLoginWaitResult } from "@llmr/core/contracts/app.ts";
import { ClaudeAppsGatewaySignInForm } from "@llmr/ui/pages/home/components/claude-apps-gateway-sign-in.tsx";
import { runClaudeAppsGatewayLogin, type ClaudeAppsGatewayLoginApi } from "@llmr/ui/pages/home/shared/claude-apps-gateway-login.ts";

type WaitStep = Partial<ClaudeAppsGatewayLoginWaitResult> | (() => Partial<ClaudeAppsGatewayLoginWaitResult>);

function fakeApi({ calls, waitResults }: { calls: string[]; waitResults: WaitStep[] }): ClaudeAppsGatewayLoginApi {
  return {
    cancelClaudeAppsGatewayLogin: async ({ sessionId }) => {
      calls.push(`cancel:${sessionId}`);
      return { canceled: true };
    },
    openExternal: async (url) => {
      calls.push(`open:${url}`);
    },
    startClaudeAppsGatewayLogin: async ({ gatewayUrl }) => {
      calls.push(`start:${gatewayUrl}`);
      return {
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        gatewayUrl,
        intervalSeconds: 0,
        sessionId: "s1",
        userCode: "WDJB-MJHT",
        verificationUri: `${gatewayUrl}/device`,
        verificationUriComplete: `${gatewayUrl}/device?user_code=WDJB-MJHT`
      };
    },
    waitClaudeAppsGatewayLogin: async ({ sessionId }) => {
      calls.push(`wait:${sessionId}`);
      const step = waitResults.shift() ?? { status: "pending" };
      const result = typeof step === "function" ? step() : step;
      return { confirmed: false, gatewayUrl: "http://127.0.0.1:18080", message: "", models: [], sessionId, status: "pending", ...result };
    }
  };
}

test("login driver starts, opens the browser, polls until confirmed", async () => {
  const calls: string[] = [];
  const api = fakeApi({ calls, waitResults: [{ status: "pending" }, { confirmed: true, models: ["claude-sonnet-4-6"], status: "confirmed" }] });
  const prompts: ClaudeAppsGatewayLoginStartResult[] = [];
  const run = runClaudeAppsGatewayLogin(api, "http://127.0.0.1:18080", {
    onConfirmed: (result) => calls.push(`confirmed:${result.models.join()}`),
    onError: (message) => calls.push(`error:${message}`),
    onPrompt: (prompt) => prompts.push(prompt)
  });
  await run.done;
  assert.equal(prompts[0]?.userCode, "WDJB-MJHT");
  assert.deepEqual(calls, ["start:http://127.0.0.1:18080", "open:http://127.0.0.1:18080/device?user_code=WDJB-MJHT", "wait:s1", "wait:s1", "confirmed:claude-sonnet-4-6"]);
  run.cancel();
  assert.equal(calls.includes("cancel:s1"), false);
});

test("cancel during a pending wait stops polling and cancels the session", async () => {
  const calls: string[] = [];
  let run: ReturnType<typeof runClaudeAppsGatewayLogin> | undefined;
  const api = fakeApi({
    calls,
    waitResults: [() => {
      run?.cancel();
      return { status: "pending" };
    }]
  });
  run = runClaudeAppsGatewayLogin(api, "http://127.0.0.1:18080", {
    onConfirmed: () => calls.push("confirmed"),
    onError: (message) => calls.push(`error:${message}`),
    onPrompt: () => undefined
  });
  await run.done;
  run.cancel();
  assert.equal(calls.at(-1), "cancel:s1");
  assert.equal(calls.filter((call) => call === "wait:s1").length, 1);
  assert.equal(calls.filter((call) => call === "cancel:s1").length, 1);
  assert.equal(calls.some((call) => call.startsWith("error:") || call === "confirmed"), false);
});

test("denied and expired end with an error message", async () => {
  for (const status of ["denied", "expired"] as const) {
    const calls: string[] = [];
    const api = fakeApi({ calls, waitResults: [{ message: `Gateway sign-in ${status}.`, status }] });
    const errors: string[] = [];
    const run = runClaudeAppsGatewayLogin(api, "http://127.0.0.1:18080", {
      onConfirmed: () => calls.push("confirmed"),
      onError: (message) => errors.push(message),
      onPrompt: () => undefined
    });
    await run.done;
    run.cancel();
    assert.deepEqual(errors, [`Gateway sign-in ${status}.`]);
    assert.equal(calls.some((call) => call.startsWith("cancel:")), false);
  }
});

test("a failed start reports the error without polling", async () => {
  const calls: string[] = [];
  const api = { ...fakeApi({ calls, waitResults: [] }), startClaudeAppsGatewayLogin: async () => {
    throw new Error("Claude apps gateway URL must use https:, or http: for a loopback host.");
  } };
  const errors: string[] = [];
  await runClaudeAppsGatewayLogin(api, "http://gw.example.com", { onConfirmed: () => undefined, onError: (message) => errors.push(message), onPrompt: () => undefined }).done;
  assert.equal(errors.length, 1);
  assert.match(errors[0] ?? "", /https/);
  assert.deepEqual(calls, []);
});

test("cancel while start is in flight releases the session without opening the browser", async () => {
  const calls: string[] = [];
  const api = fakeApi({ calls, waitResults: [] });
  const realStart = api.startClaudeAppsGatewayLogin;
  let releaseStart = () => undefined as void;
  api.startClaudeAppsGatewayLogin = (request) => new Promise((resolve) => {
    releaseStart = () => resolve(realStart(request));
  });
  let prompted = false;
  const run = runClaudeAppsGatewayLogin(api, "http://127.0.0.1:18080", {
    onConfirmed: () => calls.push("confirmed"),
    onError: (message: string) => calls.push(`error:${message}`),
    onPrompt: () => {
      prompted = true;
    }
  });
  run.cancel();
  releaseStart();
  await run.done;
  assert.equal(prompted, false);
  assert.deepEqual(calls, ["start:http://127.0.0.1:18080", "cancel:s1"]);
});

test("sign-in form renders the URL field and the Sign in button", () => {
  const html = renderToStaticMarkup(<ClaudeAppsGatewaySignInForm onConfirmed={() => undefined} />);
  assert.match(html, /Sign in to a Claude apps gateway/);
  assert.match(html, /aria-label="Claude apps gateway URL"/);
  assert.match(html, /placeholder="https:\/\/claude-gateway.internal.example.com"/);
  assert.match(html, />Sign in<\/button>/);
});
