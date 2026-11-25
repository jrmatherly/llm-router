import { randomInt } from "node:crypto";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { connect, createServer } from "node:net";
import path from "node:path";

const reservedPorts = new Set();

// Test files run in separate processes, so the Set alone cannot keep two of
// them off one port. A file made with "wx" can. run-tests.mjs names the folder
// and removes it with the suite's home.
const claimDir = process.env.LLMR_TEST_PORT_CLAIMS;

function claimPort(port) {
  if (!claimDir) return true;
  mkdirSync(claimDir, { recursive: true });
  try {
    closeSync(openSync(path.join(claimDir, String(port)), "wx"));
    return true;
  } catch (error) {
    if (error.code === "EEXIST") return false;
    throw error;
  }
}

// A port-0 bind or an outbound connection takes its port from the OS ephemeral
// range (32768 and up on Linux, 49152 and up on macOS). A port probed there and
// released can be taken before the caller binds it, so reserve below the range.
export async function reserveLoopbackPort() {
  let lastError;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const port = 20000 + randomInt(12000);
    if (reservedPorts.has(port) || !claimPort(port)) {
      continue;
    }
    lastError = await new Promise((resolve) => {
      const server = createServer();
      server.once("error", resolve);
      server.listen(port, "127.0.0.1", () => server.close(() => resolve(undefined)));
    });
    if (!lastError) {
      reservedPorts.add(port);
      return port;
    }
  }
  throw new Error("No free loopback port below the ephemeral range", { cause: lastError });
}

export async function waitForTcpListener(server, timeoutMs = 1000) {
  const address = server.address();
  if (!address || typeof address !== "object") {
    throw new Error("TCP listener does not have a bound address");
  }

  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      await new Promise((resolve, reject) => {
        const socket = connect(address.port, "127.0.0.1");
        const timer = setTimeout(() => {
          socket.destroy();
          reject(new Error(`Timed out connecting to TCP listener on port ${address.port}`));
        }, Math.max(1, deadline - Date.now()));
        socket.once("connect", () => {
          clearTimeout(timer);
          socket.end();
          resolve();
        });
        socket.once("error", (error) => {
          clearTimeout(timer);
          socket.destroy();
          reject(error);
        });
      });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError ?? new Error(`Timed out waiting for TCP listener on port ${address.port}`);
}
