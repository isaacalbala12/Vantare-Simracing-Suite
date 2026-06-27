import { useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { Events } from "@wailsio/runtime";
import { ScrollableMain } from "../components/ScrollableMain";
import { Topbar } from "../components/Topbar";
import { UpdateBanner } from "../components/UpdateBanner";
import { DashboardPage } from "./DashboardPage";
import { OverlaysStudioPage } from "./OverlaysStudioPage";
import { SettingsPage } from "./SettingsPage";
import { EngineerPage } from "./EngineerPage";
import { LicenseProvider, useLicense } from "../../lib/license";
import { LoginScreen } from "../auth/LoginScreen";
import { PaywallScreen } from "../auth/PaywallScreen";
import { LicenseBanner } from "../auth/LicenseBanner";

type Section = "dashboard" | "profiles" | "telemetry" | "setup" | "engineer";

type SourceStatus = {
  kind: string;
  name: string;
  live: boolean;
  available: boolean;
};

function LicenseGate({ children }: { children: ReactNode }) {
  const { result, loading } = useLicense();
  if (loading) {
    return (
      <div
        data-testid="license-loading"
        className="flex h-screen items-center justify-center bg-[#0a0a0a] text-white"
      >
        <p className="font-mono text-xs uppercase tracking-widest text-vantare-textDim">
          Cargando licencia...
        </p>
      </div>
    );
  }
  if (!result || result.state === "anonymous") {
    return (
      <LoginScreen
        onLoggedIn={(accessToken) => {
          if (accessToken) {
            Events.Emit("license:validate", { sessionToken: accessToken });
          } else {
            // Fallback for any caller that cannot provide a token.
            Events.Emit("license:validate", {});
          }
        }}
      />
    );
  }
  if (
    result.state === "authenticated-no-entitlement" ||
    result.state === "expired" ||
    result.state === "device-limit"
  ) {
    return <PaywallScreen email={result.email} />;
  }
  return (
    <>
      <LicenseBanner />
      {children}
    </>
  );
}

function HubShell() {
  const [section, setSection] = useState<Section>("dashboard");
  const [version, setVersion] = useState<string | null>(null);
  const [sourceStatus, setSourceStatus] = useState<SourceStatus | null>(null);

  useEffect(() => {
    document.body.classList.add("hub");
    const unsub = Events.On("app:version", (event: { data: { version?: string } }) => {
      setVersion(event.data.version ?? null);
    });
    const unsubSource = Events.On("telemetry:source-status", (event: { data: SourceStatus }) => {
      setSourceStatus(event.data);
    });
    Events.Emit("app:version:get");
    Events.Emit("telemetry:source-status:get");
    return () => {
      document.body.classList.remove("hub");
      unsub?.();
      unsubSource?.();
    };
  }, []);

  const handleNavigate = useCallback((id: string) => {
    setSection(id as Section);
  }, []);

  return (
    <div className="h-screen premium-bg relative flex flex-col">
      <Topbar activeSection={section} onNavigate={handleNavigate} version={version} sourceStatus={sourceStatus} />
      <UpdateBanner />
      <ScrollableMain className="flex-1 pt-0">
        {section === "dashboard" && <DashboardPage />}
        {section === "profiles" && <OverlaysStudioPage />}
        {section === "setup" && <SettingsPage />}
        {section === "engineer" && <EngineerPage />}
        {section === "telemetry" && (
          <div className="flex items-center justify-center h-[60vh] text-vantare-textMuted text-sm font-mono">
            Telemetría — próxima actualización
          </div>
        )}
      </ScrollableMain>
    </div>
  );
}

// LicenseBridge forwards the Session's access_token to the Go service so
// license validation can authenticate against Supabase. The bridge is
// isolated from the gate so a missing Supabase session (no env vars in dev,
// test mocks, offline) cannot block the UI from rendering its current state.
function LicenseBridge() {
  const { refresh } = useLicense();
  useEffect(() => {
    let cancelled = false;
    import("../../lib/supabase-auth")
      .then(({ getSession }) => getSession())
      .then((session) => {
        if (cancelled) return;
        if (session?.access_token) {
          Events.Emit("license:validate", {
            sessionToken: session.access_token,
          });
        } else {
          refresh();
        }
      })
      .catch(() => {
        if (!cancelled) refresh();
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);
  return null;
}

export function HubApp() {
  return (
    <LicenseProvider>
      <LicenseBridge />
      <LicenseGate>
        <HubShell />
      </LicenseGate>
    </LicenseProvider>
  );
}