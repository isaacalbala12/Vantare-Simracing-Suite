import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { applyTheme, getStoredThemeId, type VantareTheme } from "./lib/theme";
import vantareV5 from "./themes/vantare-v5.json";
import vantareLite from "./themes/vantare-lite.json";
import { CompositeApp } from "./overlay/CompositeApp";
import { ObsOverlayApp } from "./overlay/ObsOverlayApp";
import { HubApp } from "./hub/HubApp";
import { OAuthCallbackHandler } from "./hub/auth/OAuthCallbackHandler";
import { registerBuiltinDesignSystems } from "./hub/registry/builtin-systems";
import { AuthSessionBridge } from "./lib/AuthSessionBridge";
registerBuiltinDesignSystems();

const OverlayWorkshopDevRoute = import.meta.env.DEV
  ? lazy(async () => ({ default: (await import("./overlay/authoring/OverlayWorkshopDevRoute")).OverlayWorkshopDevRoute }))
  : null;

const v5Theme = vantareV5 as unknown as VantareTheme;
const liteTheme = vantareLite as unknown as VantareTheme;

const themeId = getStoredThemeId();
applyTheme(themeId === "vantare-lite" ? liteTheme : v5Theme);

export function App() {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  if (import.meta.env.DEV && OverlayWorkshopDevRoute && path === "/workshop") {
    return (
      <Suspense fallback={null}>
        <OverlayWorkshopDevRoute />
      </Suspense>
    );
  }
  if (path.startsWith("/overlay") || params.get("obs") === "1") {
    return <ObsOverlayApp />;
  }
  const hash = window.location.hash.slice(1) || "/";
  if (hash.startsWith("/auth/callback")) {
    return <OAuthCallbackHandler />;
  }
  if (hash.startsWith("/hub")) {
    return <HubApp />;
  }
  return <CompositeApp />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
		<AuthSessionBridge>
			<App />
		</AuthSessionBridge>
  </StrictMode>,
);
