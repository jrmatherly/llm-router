import type { IpcMainInvokeEvent } from "electron";

export function isAppRendererFrame(frameUrl: string | undefined, rendererRootUrl: string): boolean {
  try {
    const frame = new URL(frameUrl ?? "");
    const root = new URL(rendererRootUrl);
    // pathToFileURL encodes "~" and Chromium does not, so compare decoded paths.
    return frame.protocol === "file:"
      && root.protocol === "file:"
      && frame.host === root.host
      && decodeURIComponent(frame.pathname).startsWith(decodeURIComponent(root.pathname));
  } catch {
    return false;
  }
}

export function assertAppRendererSender(event: Pick<IpcMainInvokeEvent, "senderFrame">, rendererRootUrl: string): void {
  if (!isAppRendererFrame(event.senderFrame?.url, rendererRootUrl)) {
    throw new Error("This IPC channel is only available to LLM Router windows.");
  }
}
