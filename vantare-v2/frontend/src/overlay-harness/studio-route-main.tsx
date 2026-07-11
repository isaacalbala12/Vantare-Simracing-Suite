import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LicenseProvider } from "../lib/license";
import { StudioRoute } from "../hub/overlay-studio/StudioRoute";
import { resetHubMockState, type HubMockSeed } from "./hub-profile-mock-state";
import "../index.css";

function readHarnessSeed(search: string): HubMockSeed {
  const seed = new URLSearchParams(search.startsWith("?") ? search : `?${search}`).get("seed");
  return seed === "active" ? "active" : "empty";
}

resetHubMockState(readHarnessSeed(window.location.search));

document.documentElement.classList.add("osv3-harness");
document.body.classList.add("osv3-harness");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LicenseProvider>
      <StudioRoute liveAvailable={false} />
    </LicenseProvider>
  </StrictMode>,
);