import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { applyTheme, getStoredThemeId, type VantareTheme } from "./lib/theme";
import vantareV5 from "./themes/vantare-v5.json";
import vantareLite from "./themes/vantare-lite.json";
import { AppBootFallback } from "./AppBootFallback";
const includeOverlayWorkshop =
  import.meta.env.DEV || import.meta.env.VITE_INCLUDE_OVERLAY_WORKSHOP === "true";
const OverlayWorkshopAccessRoute = includeOverlayWorkshop
  ? lazy(async () => ({ default: (await import("./overlay/authoring/OverlayWorkshopDevRoute")).OverlayWorkshopAccessRoute }))
  : null;
const AppRuntime = lazy(async () => ({ default: (await import("./AppShell")).AppRuntime }));

const v5Theme = vantareV5 as unknown as VantareTheme;
const liteTheme = vantareLite as unknown as VantareTheme;

const themeId = getStoredThemeId();
applyTheme(themeId === "vantare-lite" ? liteTheme : v5Theme);

export function App() {
  return (
    <Suspense fallback={<AppBootFallback />}>
      <AppRuntime WorkshopRoute={OverlayWorkshopAccessRoute ?? undefined} />
    </Suspense>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
