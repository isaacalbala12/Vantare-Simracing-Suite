import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "../i18n/I18nProvider";
import { OrbitShell } from "../hub/components/orbit/OrbitShell";
import { ChainRunnerProvider } from "../hub/launcher/chain-store";
import { LauncherStoreProvider } from "../hub/launcher/launcher-store";
import { LicenseProvider } from "../lib/license";
import { resetHubMockState, type HubMockSeed } from "./hub-profile-mock-state";
import "../index.css";

function readHarnessSeed(search: string): HubMockSeed {
  const seed = new URLSearchParams(search.startsWith("?") ? search : `?${search}`).get("seed");
  return seed === "active" ? "active" : "empty";
}

resetHubMockState(readHarnessSeed(window.location.search));

document.documentElement.classList.add("osv3-harness");
document.body.classList.add("osv3-harness", "hub");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <LicenseProvider>
        <ChainRunnerProvider>
          <LauncherStoreProvider>
            <OrbitShell activeSection="profiles" onNavigate={() => undefined} version="0.1.0.4" />
          </LauncherStoreProvider>
        </ChainRunnerProvider>
      </LicenseProvider>
    </I18nProvider>
  </StrictMode>,
);
