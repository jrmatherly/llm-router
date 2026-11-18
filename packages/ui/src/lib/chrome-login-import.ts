import type { ChromeLoginImportJob } from "@llmr/core/contracts/app";

export function chromeLoginImportFailureMessage(job: ChromeLoginImportJob): string {
  if (!job.result) {
    return "Chrome import failed.";
  }
  const firstError = job.result.errors?.[0];
  return `Chrome import failed: ${job.result.imported} imported, ${job.result.skipped} skipped.${firstError ? ` First error: ${firstError}` : ""}`;
}
