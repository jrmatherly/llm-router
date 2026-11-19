import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type ServiceState = {
  authToken: string;
  host?: string;
  pid: number;
  profileManaged: boolean;
  serviceToken?: string;
  startedAt: string;
  startGateway: boolean;
  tokenGenerated: boolean;
  url: string;
};

export function readServiceState(file: string): ServiceState | undefined {
  if (!existsSync(file)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<ServiceState>;
    const pid = Number(parsed.pid);
    const authToken = typeof parsed.authToken === "string" ? parsed.authToken.trim() : "";
    if (!Number.isInteger(pid) || pid <= 0 || typeof parsed.url !== "string" || !authToken) {
      return undefined;
    }
    const serviceToken = typeof parsed.serviceToken === "string" ? parsed.serviceToken.trim() : "";
    return {
      authToken,
      ...(typeof parsed.host === "string" ? { host: parsed.host } : {}),
      pid,
      profileManaged: parsed.profileManaged === true,
      ...(serviceToken ? { serviceToken } : {}),
      startedAt: parsed.startedAt || "",
      startGateway: parsed.startGateway !== false,
      tokenGenerated: parsed.tokenGenerated === true,
      url: parsed.url
    };
  } catch {
    return undefined;
  }
}

export function writeServiceState(state: ServiceState, file: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

export function serviceAuthToken(state: Pick<ServiceState, "authToken">): string {
  return state.authToken.trim();
}
