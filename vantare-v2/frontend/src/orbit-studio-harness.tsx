import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { initializeDensity } from "./lib/density";
import { applyTheme, type VantareTheme } from "./lib/theme";
import orbitThemeJson from "./themes/vantare-orbit.json";
import { I18nProvider } from "./i18n/I18nProvider";
import { LicenseProvider } from "./lib/license";
import { ChainRunnerProvider } from "./hub/launcher/chain-store";
import { LauncherStoreProvider } from "./hub/launcher/launcher-store";
import { OrbitShell } from "./hub/components/orbit/OrbitShell";
import { isOrbitEnabled } from "./hub/orbit/orbit-flag";
import { StudioRoute } from "./hub/overlay-studio/StudioRoute";
import { widgetTypeRegistry } from "./overlay/core/widget-registry";
import type { WidgetType } from "./overlay/core/profile-document";
import {
  createHubProfile,
  loadHubDocument,
  resetHubMockState,
  saveHubDocument,
  setActiveHubProfile,
} from "./overlay-harness/hub-profile-mock-state";
import type { Section } from "./hub/navigation";

/**
 * Harness visual del Studio Orbit (briefing 04).
 *
 * Monta la shell Orbit real con `StudioRoute` dentro, contra el runtime
 * simulado: el perfil por defecto trae tres widgets reales (delta, relative,
 * standings). `?stress=1` reescribe ese documento con veinte widgets de nombre
 * largo, que es el modo estrés del briefing; el modo estrés vive aquí y no en
 * producción porque es una siembra de datos, no una función del Studio.
 */
applyTheme(orbitThemeJson as unknown as VantareTheme);
initializeDensity();

// `delta` no entra en el ciclo: el documento V3 solo admite uno por layout, y
// repetirlo hace que el perfil no valide.
const STRESS_TYPES: WidgetType[] = [
  "standings",
  "relative",
  "pedals",
  "racing-flags",
  "track-weather",
  "car-damage-numbers",
  "race-schedule",
  "head-to-head",
  "input-telemetry",
];

resetHubMockState();
const created = createHubProfile("Clean Overlay");
if (!("error" in created)) {
  setActiveHubProfile(created.id, created.file);

  const stress = new URLSearchParams(window.location.search).get("stress") === "1";
  if (stress) {
    const stored = loadHubDocument(created.file);
    if (stored) {
      stored.document.layouts.general = {
        type: "general",
        widgets: Array.from({ length: 20 }, (_, index) => {
          const type = index === 0 ? "delta" : STRESS_TYPES[index % STRESS_TYPES.length];
          const widget = widgetTypeRegistry.get(type).createDefault(`stress-${index}`);
          widget.name = `Widget de prueba con un nombre larguísimo para el modo estrés ${index + 1}`;
          widget.layout = {
            ...widget.layout,
            x: 40 + (index % 5) * 360,
            y: 40 + Math.floor(index / 5) * 250,
            zIndex: index + 1,
          };
          return widget;
        }),
      };
      saveHubDocument(created.file, stored.document, stored.revision);
    }
  }
}

export function Harness() {
  const [section, setSection] = useState<Section>("profiles");
  isOrbitEnabled();

  return (
    <LicenseProvider>
      <I18nProvider>
        <ChainRunnerProvider>
          <LauncherStoreProvider>
            <OrbitShell
              activeSection={section}
              onNavigate={(next) => setSection(next as Section)}
              sourceStatus={{ name: "LMU", live: true, available: true } as never}
              testingCenterChannel={null}
              version="v0.3.9"
            >
              <StudioRoute liveAvailable={false} />
            </OrbitShell>
          </LauncherStoreProvider>
        </ChainRunnerProvider>
      </I18nProvider>
    </LicenseProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
