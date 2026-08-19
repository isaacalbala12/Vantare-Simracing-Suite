import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { applyTheme, getStoredThemeId, type VantareTheme } from "./lib/theme";
import vantareV5 from "./themes/vantare-v5.json";
import vantareLite from "./themes/vantare-lite.json";
import vantareOrbit from "./themes/vantare-orbit.json";
import { initializeDensity } from "./lib/density";
import { AppBootFallback } from "./AppBootFallback";
const OverlayWorkshopDevRoute = import.meta.env.DEV
  ? lazy(async () => ({ default: (await import("./overlay/authoring/OverlayWorkshopDevRoute")).OverlayWorkshopDevRoute }))
  : null;
const AppRuntime = lazy(async () => ({ default: (await import("./AppShell")).AppRuntime }));

const v5Theme = vantareV5 as unknown as VantareTheme;
const liteTheme = vantareLite as unknown as VantareTheme;
const orbitTheme = vantareOrbit as unknown as VantareTheme;

const themeId = getStoredThemeId();
applyTheme(
  themeId === "vantare-lite"
    ? liteTheme
    : themeId === "vantare-orbit"
      ? orbitTheme
      : v5Theme,
);
initializeDensity();

export function App() {
  const path = window.location.pathname;
  if (import.meta.env.DEV && OverlayWorkshopDevRoute && path === "/workshop") {
    return (
      <Suspense fallback={<AppBootFallback />}>
        <OverlayWorkshopDevRoute />
      </Suspense>
    );
  }
  return <Suspense fallback={<AppBootFallback />}><AppRuntime /></Suspense>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
