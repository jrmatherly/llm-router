import type { IncomingHttpHeaders } from "node:http";
import type { RefusedKeyRequest, RefusedKeyRequests } from "@llmr/core/contracts/app";
import { inferGatewayClient } from "@llmr/core/gateway/http/io";

export type RefusedKeyRequestInput = {
  at?: string;
  headers: IncomingHttpHeaders;
  reason: string;
  route: string;
};

const maxRecentRefusedKeyRequests = 5;
const maxClientLength = 60;
const maxRouteLength = 120;
const maxReasonLength = 120;

export function createRefusedKeyRequestLog() {
  let count = 0;
  let recent: RefusedKeyRequest[] = [];
  return {
    record(input: RefusedKeyRequestInput): void {
      count += 1;
      recent = newestRefusedKeyRequests([refusedKeyRequestEntry(input), ...recent]);
    },
    snapshot(): RefusedKeyRequests {
      return { count, recent };
    }
  };
}

let parentLog = createRefusedKeyRequestLog();
let foldedChildCount = 0;
let foldedChildRecent: RefusedKeyRequest[] = [];
let currentChild: RefusedKeyRequests = { count: 0, recent: [] };

export function recordRefusedKeyRequest(input: RefusedKeyRequestInput): void {
  parentLog.record(input);
}

export function mergeChildRefusedKeyRequests(snapshot: RefusedKeyRequests): void {
  currentChild = {
    count: Math.max(0, Math.floor(snapshot.count)),
    recent: newestRefusedKeyRequests(snapshot.recent.map(boundedRefusedKeyRequest))
  };
}

// A new child starts counting at zero, so the last child's count moves into the base.
export function foldChildRefusedKeyRequests(): void {
  foldedChildCount += currentChild.count;
  foldedChildRecent = newestRefusedKeyRequests([...currentChild.recent, ...foldedChildRecent]);
  currentChild = { count: 0, recent: [] };
}

export function refusedKeyRequests(): RefusedKeyRequests {
  const parent = parentLog.snapshot();
  return {
    count: parent.count + foldedChildCount + currentChild.count,
    recent: newestRefusedKeyRequests([...parent.recent, ...currentChild.recent, ...foldedChildRecent])
  };
}

export function resetRefusedKeyRequestsForTest(): void {
  parentLog = createRefusedKeyRequestLog();
  foldedChildCount = 0;
  foldedChildRecent = [];
  currentChild = { count: 0, recent: [] };
}

function refusedKeyRequestEntry(input: RefusedKeyRequestInput): RefusedKeyRequest {
  return boundedRefusedKeyRequest({
    at: input.at ?? new Date().toISOString(),
    client: inferGatewayClient(undefined, input.headers) ?? "unknown",
    reason: input.reason,
    route: input.route
  });
}

function boundedRefusedKeyRequest(entry: RefusedKeyRequest): RefusedKeyRequest {
  return {
    at: String(entry.at).slice(0, 32),
    client: String(entry.client).slice(0, maxClientLength),
    reason: String(entry.reason).slice(0, maxReasonLength),
    route: String(entry.route).split(/[?#]/, 1)[0].slice(0, maxRouteLength)
  };
}

function newestRefusedKeyRequests(entries: RefusedKeyRequest[]): RefusedKeyRequest[] {
  return [...entries]
    .sort((left, right) => right.at.localeCompare(left.at))
    .slice(0, maxRecentRefusedKeyRequests);
}
