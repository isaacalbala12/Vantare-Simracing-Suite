import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { OverlayParityHarnessPage } from "./OverlayParityHarness";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <OverlayParityHarnessPage search={window.location.search} />
  </StrictMode>,
);