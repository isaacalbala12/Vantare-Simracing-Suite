import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { initializeDensity } from "./lib/density";
import { applyTheme, type VantareTheme } from "./lib/theme";
import orbitThemeJson from "./themes/vantare-orbit.json";
import { I18nProvider } from "./i18n/I18nProvider";
import { LicenseProvider } from "./lib/license";
import { LauncherStoreProvider } from "./hub/launcher/launcher-store";
import { OrbitShell } from "./hub/components/orbit/OrbitShell";
import { isOrbitEnabled } from "./hub/orbit/orbit-flag";
import {
  createHubProfile,
  resetHubMockState,
  setActiveHubProfile,
} from "./overlay-harness/hub-profile-mock-state";
import type { Section } from "./hub/navigation";

/**
 * Harness visual de Inicio (briefing 03).
 *
 * Monta la shell Orbit real contra el runtime simulado (`VITE_RUNTIME_MOCK`):
 * el calendario de `calendar-visual-mock-data` trae series y previsiones, y el
 * perfil activo se siembra aquí con los tres widgets del documento por defecto,
 * de modo que el mini-lienzo pinta los widgets reales del sistema V3.
 */
applyTheme(orbitThemeJson as unknown as VantareTheme);
initializeDensity();

resetHubMockState();
const created = createHubProfile("Clean Overlay");
if (!("error" in created)) {
  setActiveHubProfile(created.id, created.file);
}

export function Harness() {
  const [section, setSection] = useState<Section>("dashboard");
  isOrbitEnabled();

  return (
    <LicenseProvider>
      <I18nProvider>
        <LauncherStoreProvider>
          <OrbitShell
            activeSection={section}
            onNavigate={(next) => setSection(next as Section)}
            sourceStatus={{ name: "LMU", live: true, available: true } as never}
            testingCenterChannel={null}
            version="v0.3.9"
          >
            <div data-testid="orbit-home-harness-workspace" style={{ height: "100%" }} />
          </OrbitShell>
        </LauncherStoreProvider>
      </I18nProvider>
    </LicenseProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
