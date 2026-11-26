import type { ProfileClientApplyStatus } from "@llmr/core/contracts/app";

export function profileStatusNotices(statuses: ProfileClientApplyStatus[]): { errors: string[]; notices: string[] } {
  return {
    errors: statuses.filter((status) => !status.ok).map((status) => status.message),
    notices: statuses.filter((status) => status.ok && (status.copy || (!status.enabled && status.changed))).map((status) => status.message)
  };
}
