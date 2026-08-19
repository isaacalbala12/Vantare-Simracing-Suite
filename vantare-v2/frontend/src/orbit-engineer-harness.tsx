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
import type { Section } from "./hub/navigation";

/**
 * Harness visual de Ingeniero (briefing 08).
 *
 * Monta la shell Orbit real contra el runtime simulado: la configuración y los
 * mensajes de radio llegan por `engineer:status` / `engineer:notification`,
 * igual que en el hub. El motor de voz del sistema no existe en Chromium
 * headless: la pantalla lo dice sola («Sin voces instaladas»).
 */
applyTheme(orbitThemeJson as unknown as VantareTheme);
initializeDensity();

export function Harness() {
  const [section, setSection] = useState<Section>("engineer");
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
            <div data-testid="orbit-engineer-harness-workspace" style={{ height: "100%" }} />
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
