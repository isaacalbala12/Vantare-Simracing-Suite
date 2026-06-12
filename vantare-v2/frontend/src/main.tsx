import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { CompositeApp } from "./overlay/CompositeApp";
import { ObsOverlayApp } from "./overlay/ObsOverlayApp";
import { HubApp } from "./hub/HubApp";

// Routing:
//  /overlay?profile=... → ObsOverlayApp (OBS Browser Source, no Wails dep)
//  /#/hub              → HubApp
//  /                   → CompositeApp (Wails desktop overlay)
function App() {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  if (path.startsWith("/overlay") || params.get("obs") === "1") {
    return <ObsOverlayApp />;
  }
  const hash = window.location.hash.slice(1) || "/";
  if (hash.startsWith("/hub")) {
    return <HubApp />;
  }
  return <CompositeApp />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
