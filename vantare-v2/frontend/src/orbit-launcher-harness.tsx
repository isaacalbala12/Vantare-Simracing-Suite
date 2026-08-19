import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { initializeDensity } from "./lib/density";
import { applyTheme, type VantareTheme } from "./lib/theme";
import orbitThemeJson from "./themes/vantare-orbit.json";
import { I18nProvider } from "./i18n/I18nProvider";
import { LicenseProvider } from "./lib/license";
import {
  LauncherStoreProvider,
  createLauncherStore,
  type LauncherBridgeLike,
} from "./hub/launcher/launcher-store";
import type { LauncherApp, LauncherSnapshot } from "./hub/launcher/launcher-contract";
import { OrbitShell } from "./hub/components/orbit/OrbitShell";
import { isOrbitEnabled } from "./hub/orbit/orbit-flag";
import type { Section } from "./hub/navigation";

/**
 * Harness visual del Launcher (briefing 05).
 *
 * Monta la shell Orbit real contra una instantánea del Launcher sembrada aquí:
 * el runtime de Wails no existe en un navegador limpio, así que el puente se
 * sustituye por uno que publica un catálogo de prueba (siete aplicaciones, dos
 * ya detectadas) y dos perfiles reales del contrato. Es dato de prueba del
 * harness, no una capacidad del producto (precedente D-45).
 */
applyTheme(orbitThemeJson as unknown as VantareTheme);
initializeDensity();

function app(
  id: string,
  displayName: string,
  abbreviation: string,
  category: LauncherApp["category"],
  launchMethod: LauncherApp["launchMethod"],
  gradientFrom: string,
  gradientTo: string,
  found = false,
  installed = false,
): LauncherApp {
  return {
    id,
    displayName,
    abbreviation,
    category,
    launchMethod,
    availability: { catalogued: true, found, installed, launchable: found },
    gradientFrom,
    gradientTo,
  };
}

const SNAPSHOT: LauncherSnapshot = {
  revision: 1,
  apps: [
    app("lmu", "Le Mans Ultimate", "LMU", "simulator", "steam-uri", "#f04755", "#77162c", true, true),
    app("obs", "OBS Studio", "OBS", "streaming", "executable", "#4a4f5c", "#1f2229", true),
    app("crewchief", "CrewChief", "CC", "utility", "executable", "#f0a63a", "#8a4a12"),
    app("discord", "Discord", "DC", "utility", "executable", "#7289da", "#3a4a99"),
    app("spotify", "Spotify", "SP", "audio", "executable", "#1db954", "#0e5a2b"),
    app("motec", "MoTeC", "MT", "telemetry", "executable", "#5ccbd5", "#1f5f6a"),
    app("simhub", "SimHub", "SH", "telemetry", "executable", "#c9a2ff", "#5b3aa0"),
  ],
  vantareProfiles: [],
  userProfiles: [
    {
      id: "creator",
      name: "Creador de Contenido",
      description:
        "Simulador, captura y música en tres pasos. Reintenta el paso fallido y deja el resto abierto al salir.",
      isFavorite: true,
      hotkey: "ctrl+alt+l",
      lastLaunchedAt: "2026-07-07T17:42:00Z",
      steps: [
        { appId: "lmu", delay: 0 },
        { appId: "obs", delay: 2 },
        { appId: "spotify", delay: 2 },
      ],
      policy: {
        alreadyRunning: "reuse",
        failure: "continue",
        cancel: "ask",
        exit: "leave",
        retry: "failed",
        maxRetries: 2,
      },
    },
    {
      id: "pro",
      name: "Pro",
      description:
        "Cadena completa con ingeniero de voz y telemetría externa. Cierra lo lanzado al salir del simulador.",
      steps: [
        { appId: "lmu", delay: 0 },
        { appId: "crewchief", delay: 2 },
        { appId: "spotify", delay: 2 },
        { appId: "motec", delay: 2 },
      ],
      policy: {
        alreadyRunning: "restart",
        failure: "stop",
        cancel: "ask",
        exit: "close-started",
        retry: "failed",
        maxRetries: 0,
      },
    },
  ],
  activeChains: [],
  discovery: { scanning: false, lastScanAt: "2026-07-07T17:40:00Z", error: null },
};

const bridge: LauncherBridgeLike = {
  subscribeSnapshot: (listener) => {
    listener(SNAPSHOT);
    return () => undefined;
  },
  requestSnapshot: () => undefined,
  dispatchLauncherCommand: () => undefined,
};

export function Harness() {
  const [section, setSection] = useState<Section>("launcher");
  const [store] = useState(() => createLauncherStore(bridge));
  isOrbitEnabled();

  return (
    <LicenseProvider>
      <I18nProvider>
        <LauncherStoreProvider store={store}>
          <OrbitShell
            activeSection={section}
            onNavigate={(next) => setSection(next as Section)}
            sourceStatus={{ name: "LMU", live: true, available: true } as never}
            testingCenterChannel={null}
            version="v0.3.9"
          >
            <div data-testid="orbit-launcher-harness-workspace" style={{ height: "100%" }} />
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
