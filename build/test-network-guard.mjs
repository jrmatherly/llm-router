import { appendFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";

const marker = Symbol.for("llmr.test-network-guard");
const original = net.Socket.prototype.connect;

if (!original[marker]) {
  const guarded = function connect(...args) {
    const first = Array.isArray(args[0]) ? args[0][0] : args[0];
    const target = typeof first === "object" && first !== null ? first : { host: typeof args[1] === "string" ? args[1] : undefined, port: first };
    if (target.path || isLoopback(target.host)) {
      return original.apply(this, args);
    }
    const where = `${target.host}:${target.port}`;
    const log = process.env.LLMR_TEST_NETWORK_LOG;
    if (log) {
      try {
        const owner = process.env.LLMR_TEST_FILE ?? (process.argv[1] ? path.relative(process.cwd(), process.argv[1]) : "");
        appendFileSync(log, `${where}\t${owner}\n`);
      } catch {
        // A child that outlives a direct run's home gets ENOENT here, and connect must not throw.
      }
    }
    const error = Object.assign(new Error(`test network guard: refused ${where}`), { code: "ECONNREFUSED" });
    process.nextTick(() => this.destroy(error));
    return this;
  };
  guarded[marker] = true;
  net.Socket.prototype.connect = guarded;
}

function isLoopback(host) {
  if (!host) {
    return true;
  }
  const name = String(host).toLowerCase().replace(/^\[(.*)\]$/, "$1");
  return name === "localhost" || name === "::1" || name === "0.0.0.0" || name === "::" || /^127\./.test(name) || /^::ffff:127\./.test(name);
}
