import type { ReactNode } from "react";
import { CompositeApp } from "./overlay/CompositeApp";
import { ObsOverlayApp } from "./overlay/ObsOverlayApp";
import { HubApp } from "./hub/HubApp";
import { OAuthCallbackHandler } from "./hub/auth/OAuthCallbackHandler";
import { registerBuiltinDesignSystems } from "./hub/registry/builtin-systems";
import { AuthSessionBridge } from "./lib/AuthSessionBridge";
import { LicenseProvider } from "./lib/license";

registerBuiltinDesignSystems();

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

export function AppRuntime({ children }: { children?: ReactNode }): React.ReactElement {
  return (
    <AuthSessionBridge>
      <LicenseProvider>
        {children ?? <AppShell />}
      </LicenseProvider>
    </AuthSessionBridge>
  );
}
