import type { WebContents } from "electron";
import { openHttpExternal } from "./external-url";

export function guardRendererNavigation(
  webContents: Pick<WebContents, "on" | "setWindowOpenHandler">,
  allowedUrlPrefix: string,
  open: (url: string) => Promise<void>
): void {
  webContents.setWindowOpenHandler(({ url }) => {
    openHttpExternal(url, open);
    return { action: "deny" };
  });
  webContents.on("will-navigate", (event, url) => {
    if (url.startsWith(allowedUrlPrefix)) {
      return;
    }
    event.preventDefault();
    if (!openHttpExternal(url, open)) {
      console.warn(`[navigation-guard] Blocked navigation to ${url}`);
    }
  });
}
