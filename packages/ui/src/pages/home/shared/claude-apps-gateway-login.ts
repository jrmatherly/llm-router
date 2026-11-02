import type { ClaudeAppsGatewayLoginStartResult, ClaudeAppsGatewayLoginWaitResult } from "@llmr/core/contracts/app";
import { formatAppError } from "./i18n";

export type ClaudeAppsGatewayLoginApi = Pick<
  NonNullable<Window["llmr"]>,
  "cancelClaudeAppsGatewayLogin" | "openExternal" | "startClaudeAppsGatewayLogin" | "waitClaudeAppsGatewayLogin"
>;

export type ClaudeAppsGatewayLoginEvents = {
  onConfirmed: (result: ClaudeAppsGatewayLoginWaitResult) => void;
  onError: (message: string) => void;
  onPrompt: (start: ClaudeAppsGatewayLoginStartResult) => void;
};

export function runClaudeAppsGatewayLogin(
  api: ClaudeAppsGatewayLoginApi,
  gatewayUrl: string,
  events: ClaudeAppsGatewayLoginEvents
): { cancel: () => void; done: Promise<void> } {
  let canceled = false;
  let sessionId: string | undefined;
  let finished = false;

  function releaseSession() {
    if (sessionId && !finished) {
      finished = true;
      void api.cancelClaudeAppsGatewayLogin({ sessionId }).catch(() => undefined);
    }
  }

  const done = (async () => {
    try {
      const start = await api.startClaudeAppsGatewayLogin({ gatewayUrl });
      sessionId = start.sessionId;
      if (canceled) {
        releaseSession();
        return;
      }
      events.onPrompt(start);
      await api.openExternal(start.verificationUriComplete);
      while (!canceled) {
        const result = await api.waitClaudeAppsGatewayLogin({ sessionId });
        if (canceled || result.status === "pending") continue;
        finished = true;
        if (result.status === "confirmed") {
          events.onConfirmed(result);
        } else {
          events.onError(result.message);
        }
        return;
      }
    } catch (error) {
      if (canceled) return;
      releaseSession();
      events.onError(formatAppError(error));
    }
  })();

  return {
    cancel: () => {
      if (canceled) return;
      canceled = true;
      releaseSession();
    },
    done
  };
}
