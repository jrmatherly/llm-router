import type { GatewayMcpStdioMessageMode } from "@llmr/core/contracts/app";

export const stdioFramingHint = "This server is set to Content-Length framing. MCP servers use newline JSON unless they document otherwise. Set its stdio message mode to newline-json.";

export function withStdioFramingHint(
  message: string,
  server: { stdioMessageMode?: GatewayMcpStdioMessageMode },
  handshakeDone: boolean
): string {
  return server.stdioMessageMode === "content-length" && !handshakeDone ? `${message} ${stdioFramingHint}` : message;
}
