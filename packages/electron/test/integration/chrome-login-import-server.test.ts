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
