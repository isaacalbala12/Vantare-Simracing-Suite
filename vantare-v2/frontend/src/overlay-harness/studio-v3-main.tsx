import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LicenseProvider } from "../lib/license";
import "../index.css";
import { OverlayStudioV3HarnessPage } from "./OverlayStudioV3Harness";

document.documentElement.classList.add("osv3-harness");
document.body.classList.add("osv3-harness");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LicenseProvider>
      <OverlayStudioV3HarnessPage search={window.location.search} />
    </LicenseProvider>
  </StrictMode>,
);