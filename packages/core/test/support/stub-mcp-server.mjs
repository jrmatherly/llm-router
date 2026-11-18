import { createInterface } from "node:readline";

const tools = [{ name: "stub_tool", description: "Never called.", inputSchema: { type: "object", properties: {} } }];
createInterface({ input: process.stdin }).on("line", line => {
  const { id, method } = JSON.parse(line);
  if (id === undefined) return;
  const result = method === "tools/list" ? { tools }
    : { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "stub", version: "1" } };
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
});
