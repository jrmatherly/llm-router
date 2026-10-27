import assert from "node:assert/strict";
import test from "node:test";
import { pollChromeImportJob, type ChromeImportJob } from "@ccr/ui/pages/home/shared/chrome-import.ts";

test("pollChromeImportJob resolves undefined for a missing job", async () => {
  assert.equal(await pollChromeImportJob(async () => undefined, "j1"), undefined);
});

test("pollChromeImportJob resolves undefined when the IPC call rejects", async () => {
  assert.equal(await pollChromeImportJob(async () => { throw new Error("gone"); }, "j1"), undefined);
});

test("pollChromeImportJob passes a live job through", async () => {
  const job = { id: "j1", status: "pending" } as ChromeImportJob;
  assert.equal(await pollChromeImportJob(async () => job, "j1"), job);
});
