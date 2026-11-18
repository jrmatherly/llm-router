import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { chromeLoginImportInternalsForTest } from "@llmr/electron/main/chrome-login-import.ts";

type Reply = { body: string; headers: http.IncomingHttpHeaders; status: number };
type SendOptions = { body?: string; headers?: http.OutgoingHttpHeaders; method?: string };

function open(url: string, options: SendOptions = {}): { reply: Promise<Reply>; request: http.ClientRequest } {
  const request = http.request(url, { agent: false, headers: options.headers, method: options.method ?? "GET" });
  const reply = new Promise<Reply>((resolve, reject) => {
    request.on("error", reject);
    request.on("response", (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => resolve({ body: Buffer.concat(chunks).toString("utf8"), headers: response.headers, status: response.statusCode ?? 0 }));
    });
  });
  return { reply, request };
}

function send(url: string, options: SendOptions = {}): Promise<Reply> {
  const { reply, request } = open(url, options);
  request.end(options.body);
  return reply;
}

const createJob = () => chromeLoginImportInternalsForTest.createService().createJob({ domains: ["example.com"] });
const postJson = (url: string, body: string) => send(url, { body, headers: { "content-type": "application/json" }, method: "POST" });

test("job JSON has no CORS header and rejects web origins", async () => {
  const job = await createJob();
  const plain = await send(job.importUrl);
  assert.equal(plain.status, 200);
  assert.equal(plain.headers["access-control-allow-origin"], undefined);
  assert.equal((await send(job.importUrl, { headers: { origin: "https://evil.example" } })).status, 403);
  assert.equal((await send(job.importUrl, { headers: { origin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop" } })).status, 200);
  assert.equal((await send(job.importUrl, { method: "OPTIONS" })).status, 405);
  for (const origin of ["https://evil.example", "null"]) {
    const reply = await send(`${job.importUrl}/cookies`, { body: '{"cookies":[{"name":"a","value":"b"}]}', headers: { "content-type": "text/plain", origin }, method: "POST" });
    assert.equal(reply.status, 403, origin);
  }
});

test("the confirm page sends its CSP", async () => {
  const job = await createJob();
  const page = await send(job.confirmUrl);
  assert.equal(page.status, 200);
  assert.match(String(page.headers["content-type"]), /^text\/html/);
  assert.match(String(page.headers["content-security-policy"]), /script-src 'none'/);
});

test("a second POST during an import gets 409 and a failed POST leaves the job pending", async () => {
  const job = await createJob();
  const cookiesUrl = `${job.importUrl}/cookies`;
  const held = open(cookiesUrl, { headers: { "content-type": "application/json", "transfer-encoding": "chunked" }, method: "POST" });
  held.request.write('{"cookies":');

  let conflict: Reply | undefined;
  for (let attempt = 0; attempt < 50 && !conflict; attempt += 1) {
    const reply = await postJson(cookiesUrl, "{}");
    if (reply.status === 409) {
      conflict = reply;
    } else {
      assert.equal(reply.status, 500);
      await delay(10);
    }
  }
  assert.ok(conflict, "no POST was refused while the first was open");
  assert.equal(JSON.parse(conflict.body).error.message, "Chrome login import job is importing.");

  held.request.end("]");
  assert.equal((await held.reply).status, 500);
  assert.equal(JSON.parse((await send(job.importUrl)).body).job.status, "pending");
  assert.equal((await postJson(cookiesUrl, "{}")).status, 500);
});

test("an import that skips every entry fails the job", async () => {
  const job = await createJob();
  const reply = await postJson(`${job.importUrl}/cookies`, JSON.stringify({
    cookies: [{ domain: "evil.example", name: "sid", value: "1" }],
    localStorage: [{ items: { a: "1" }, origin: "https://evil.example" }]
  }));
  assert.equal(reply.status, 200);
  const body = JSON.parse(reply.body);
  assert.equal(body.result.imported, 0);
  assert.equal(body.result.skipped, 2);
  assert.equal(body.job.status, "failed");
  assert.equal(JSON.parse((await send(job.importUrl)).body).job.status, "failed");
  const again = await postJson(`${job.importUrl}/cookies`, '{"cookies":[{"domain":"example.com","name":"sid","value":"1"}]}');
  assert.equal(again.status, 409);
  assert.equal(JSON.parse(again.body).error.message, "Chrome login import job is failed.");
});

function fakeSessions(rejectName: string) {
  const calls = { flushed: 0, set: [] as string[] };
  const partitionSession = () => ({
    cookies: {
      flushStore: async () => { calls.flushed += 1; },
      set: async (details: { name: string }) => {
        calls.set.push(details.name);
        if (details.name === rejectName) {
          throw new Error("rejected by the cookie store");
        }
      }
    }
  });
  return { calls, partitionSession };
}

const exampleCookie = (name: string, domain = ".example.com") => ({ domain, name, path: "/", value: "1" });

test("a partly skipped import completes and flushes the cookie store", async () => {
  const { calls, partitionSession } = fakeSessions("bad");
  const job = await chromeLoginImportInternalsForTest.createService(partitionSession as any).createJob({ domains: ["example.com"] });
  const reply = await postJson(`${job.importUrl}/cookies`, JSON.stringify({
    cookies: [exampleCookie("sid"), exampleCookie("bad"), exampleCookie("other", "evil.example")]
  }));
  const body = JSON.parse(reply.body);
  assert.equal(reply.status, 200);
  assert.equal(body.result.imported, 1);
  assert.equal(body.result.skipped, 2);
  assert.equal(body.job.status, "completed");
  assert.deepEqual(calls.set, ["sid", "bad"]);
  assert.equal(calls.flushed, 1);
});

test("an import whose every write is rejected fails with the errors, and still flushes", async () => {
  const { calls, partitionSession } = fakeSessions("sid");
  const job = await chromeLoginImportInternalsForTest.createService(partitionSession as any).createJob({ domains: ["example.com"] });
  const body = JSON.parse((await postJson(`${job.importUrl}/cookies`, JSON.stringify({ cookies: [exampleCookie("sid")] }))).body);
  assert.equal(body.result.imported, 0);
  assert.equal(body.job.status, "failed");
  assert.match(body.result.errors[0], /sid: rejected by the cookie store/);
  assert.equal(calls.flushed, 1);
});
