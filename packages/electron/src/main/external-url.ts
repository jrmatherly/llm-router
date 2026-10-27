export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function openHttpExternal(url: string, open: (url: string) => Promise<void>): boolean {
  if (!isHttpUrl(url)) {
    return false;
  }
  open(url).catch((error) => console.warn("[external-url]", error));
  return true;
}
