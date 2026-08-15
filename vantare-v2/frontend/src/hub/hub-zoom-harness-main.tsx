import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { useHubResponsiveZoom } from "./use-hub-responsive-zoom";

function ZoomProbe() {
  useHubResponsiveZoom();
  return (
    <>
      <div data-hub-zoom-probe style={{ width: 960, height: 540, background: "#141414", color: "#f5f5f5" }}>
        <h1 style={{ fontSize: 32 }}>Zoom probe</h1>
        <p style={{ fontSize: 16 }}>El texto y los objetos crecen con la resolución.</p>
      </div>
      <div data-hub-zoom-fixed style={{ position: "fixed", top: 8, left: 8, padding: 8, background: "#9B2226" }}>
        fixed
      </div>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ZoomProbe />
  </StrictMode>,
);
