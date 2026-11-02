import type { ClaudeAppsGatewayLoginStartResult } from "@llmr/core/contracts/app";
import { runClaudeAppsGatewayLogin } from "../shared/claude-apps-gateway-login";
import { Button, CircleAlert, Input, LoaderCircle, useEffect, useRef, useState } from "../shared/index";

export function ClaudeAppsGatewaySignInForm({ onConfirmed }: { onConfirmed: () => void }) {
  const [gatewayUrl, setGatewayUrl] = useState("");
  const [loginPrompt, setLoginPrompt] = useState<ClaudeAppsGatewayLoginStartResult | undefined>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [running, setRunning] = useState(false);
  const login = useRef<ReturnType<typeof runClaudeAppsGatewayLogin> | undefined>(undefined);

  useEffect(() => () => login.current?.cancel(), []);

  function signIn() {
    const api = window.llmr;
    if (!api || !gatewayUrl.trim() || running) {
      return;
    }
    login.current?.cancel();
    setError("");
    setNotice("");
    setLoginPrompt(undefined);
    setRunning(true);
    const run = runClaudeAppsGatewayLogin(api, gatewayUrl.trim(), {
      onConfirmed: () => {
        setLoginPrompt(undefined);
        setNotice("Gateway sign-in confirmed.");
        onConfirmed();
      },
      onError: (message) => {
        setLoginPrompt(undefined);
        setError(message);
      },
      onPrompt: setLoginPrompt
    });
    login.current = run;
    void run.done.finally(() => {
      if (login.current === run) {
        login.current = undefined;
        setRunning(false);
      }
    });
  }

  return (
    <div className="mb-2 space-y-2 rounded-md border border-border bg-background px-2.5 py-2">
      <div className="text-[12px] font-semibold text-foreground">Sign in to a Claude apps gateway</div>
      <div className="flex min-w-0 items-center gap-2">
        <Input
          aria-label="Claude apps gateway URL"
          className="h-8 min-w-0 flex-1 text-[12px]"
          disabled={running}
          onChange={(event) => setGatewayUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              signIn();
            }
          }}
          placeholder="https://claude-gateway.internal.example.com"
          value={gatewayUrl}
        />
        <Button className="h-8 px-2" disabled={running || !gatewayUrl.trim()} onClick={signIn} type="button" variant="outline">
          {running ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
          Sign in
        </Button>
      </div>
      {loginPrompt ? (
        <div className="text-[12px] text-muted-foreground">
          Enter this code in the browser: <span className="font-mono font-semibold text-foreground">{loginPrompt.userCode}</span>
        </div>
      ) : null}
      {notice ? <div className="text-[12px] text-muted-foreground">{notice}</div> : null}
      {error ? (
        <div className="flex items-start gap-2 text-[12px] text-destructive">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p className="break-all">{error}</p>
        </div>
      ) : null}
    </div>
  );
}
