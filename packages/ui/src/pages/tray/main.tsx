import { createRoot } from "react-dom/client";
import { TrayApp } from "./TrayApp";
import { TrayDetailApp } from "./TrayDetailApp";

const trayParams = new URLSearchParams(window.location.search);
const trayMode = trayParams.get("mode");
const trayProvider = trayParams.get("provider")?.trim() || undefined;

createRoot(document.getElementById("root") as HTMLElement).render(
  trayMode === "detail" ? <TrayDetailApp provider={trayProvider} /> : <TrayApp />
);
