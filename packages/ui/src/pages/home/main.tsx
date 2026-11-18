import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root element not found");
}

createRoot(container).render(
  <React.StrictMode>
    <div style={{ height: "100%", minHeight: 0, minWidth: 0, width: "100%" }}>
      <App />
    </div>
  </React.StrictMode>
);
