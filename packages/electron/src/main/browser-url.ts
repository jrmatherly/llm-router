import { isHttpUrl } from "./external-url";

export function normalizeBrowserInput(value: string | undefined, homeUrl: string): string {
  const trimmed = (value || "").trim();
  if (!trimmed || trimmed.toLowerCase() === homeUrl) {
    return homeUrl;
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return isHttpUrl(trimmed) ? trimmed : `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
  }
  if (/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:[/?#]|$)/i.test(trimmed)) {
    return `http://${trimmed}`;
  }
  if (trimmed.includes(".")) {
    return `https://${trimmed}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}
