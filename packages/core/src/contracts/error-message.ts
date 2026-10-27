export function formatErrorMessage(error: unknown): string {
  return cleanErrorMessage(error instanceof Error ? error.message : String(error));
}

function cleanErrorMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) {
    return message;
  }
  const inner = trimmed.match(/^Error invoking remote method '[^']+': (?:Error: )?([\s\S]+)$/)?.[1]
    ?? trimmed.match(/^([\s\S]*?)\s+Checked:\s+[\s\S]+$/)?.[1];
  return inner === undefined ? trimmed : cleanErrorMessage(inner);
}
