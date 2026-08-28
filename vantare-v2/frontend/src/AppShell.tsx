import { lazy } from "react";
import { HubApp } from "./hub/HubApp";
import { OAuthCallbackHandler } from "./hub/auth/OAuthCallbackHandler";
import { registerBuiltinDesignSystems } from "./hub/registry/builtin-systems";
import { AuthSessionBridge } from "./lib/AuthSessionBridge";

registerBuiltinDesignSystems();

const CompositeApp = lazy(async () => ({
  default: (await import("./overlay/CompositeApp")).CompositeApp,
}));
const ObsOverlayApp = lazy(async () => ({
  default: (await import("./overlay/ObsOverlayApp")).ObsOverlayApp,
}));

export function AppShell(): React.ReactElement {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
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

export function AppRuntime(): React.ReactElement {
  return <AuthSessionBridge><AppShell /></AuthSessionBridge>;
}
