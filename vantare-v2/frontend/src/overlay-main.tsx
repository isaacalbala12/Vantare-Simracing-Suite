import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { registerBuiltinDesignSystems } from "./hub/registry/builtin-systems";
import { selectOverlayRuntime } from "./overlay-entry-route";

registerBuiltinDesignSystems();

async function mountOverlay(): Promise<void> {
  const runtime = selectOverlayRuntime(window.location.pathname, window.location.search);
  const OverlayApp = runtime === "obs"
    ? (await import("./overlay/ObsOverlayApp")).ObsOverlayApp
    : (await import("./overlay/CompositeApp")).CompositeApp;

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <OverlayApp />
    </StrictMode>,
  );
}

void mountOverlay();
