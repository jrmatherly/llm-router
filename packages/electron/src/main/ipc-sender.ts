import type { IpcMainInvokeEvent } from "electron";

// pathToFileURL encodes "~" and keeps the drive letter's case; Chromium does neither, so compare decoded paths.
function comparablePath(url: URL): string {
  return decodeURIComponent(url.pathname).replace(/^\/[a-z]:/i, (drive) => drive.toLowerCase());
}

export function isAppRendererFrame(frameUrl: string | undefined, rendererRootUrl: string): boolean {
  try {
    const frame = new URL(frameUrl ?? "");
    const root = new URL(rendererRootUrl);
    const framePath = comparablePath(frame);
    const rootPath = comparablePath(root);
    return frame.protocol === "file:"
      && root.protocol === "file:"
      && frame.host === root.host
      && !/(^|[\\/])\.\.([\\/]|$)/.test(framePath)
      && framePath.startsWith(rootPath.endsWith("/") ? rootPath : `${rootPath}/`);
  } catch {
    return false;
  }
}

export function assertAppRendererSender(event: Pick<IpcMainInvokeEvent, "senderFrame">, rendererRootUrl: string): void {
  const frameUrl = event.senderFrame?.url;
  if (!isAppRendererFrame(frameUrl, rendererRootUrl)) {
    console.warn(`[ipc] Rejected a call from ${frameUrl ?? "a frame that is gone"}; expected a frame under ${rendererRootUrl}`);
    throw new Error("This IPC channel is only available to LLM Router windows.");
  }
}
