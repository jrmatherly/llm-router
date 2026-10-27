import type { ChromeLoginImportJob } from "@ccr/core/contracts/app";

export type ChromeImportJob = ChromeLoginImportJob;

export async function pollChromeImportJob(get: (id: string) => Promise<ChromeImportJob | undefined>, id: string): Promise<ChromeImportJob | undefined> {
  return get(id).catch(() => undefined);
}
