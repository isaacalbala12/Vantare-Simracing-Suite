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
 * Harness visual del Roadmap (briefing 10).
 *
 * Monta la shell Orbit real en la vista `roadmap`. La pantalla trae la fuente
 * manual por red y, cuando no hay red, cae en la copia empaquetada y lo dice:
 * el harness no siembra ningún dato propio.
 */
applyTheme(orbitThemeJson as unknown as VantareTheme);
initializeDensity();

export function Harness() {
  const [section, setSection] = useState<Section>("roadmap");
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
            version="v0.3.10"
          >
            <div data-testid="orbit-roadmap-harness-workspace" style={{ height: "100%" }} />
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
