import { useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { Events } from '@wailsio/runtime';
import { V52Shell } from './components/V52Shell';
import { DashboardPage } from './pages/DashboardPage';
import { OverlaysStudioPage } from './pages/OverlaysStudioPage';
import { SettingsPage } from './pages/SettingsPage';
import { EngineerPage } from './pages/EngineerPage';
import { LauncherPage } from './pages/LauncherPage';
import { TelemetryPage } from './pages/TelemetryPage';
import { type Section, isSection } from './navigation';
import { LicenseProvider, useLicense } from '../lib/license';
import { LoginScreen } from './auth/LoginScreen';
import { PaywallScreen } from './auth/PaywallScreen';
import { LicenseBanner } from './auth/LicenseBanner';
import { UnconfiguredScreen } from './auth/UnconfiguredScreen';
import { getSession } from '../lib/supabase-auth';
import { BetaWelcome, type BetaUserRole } from './onboarding/BetaWelcome';

type SourceStatus = {
  kind: string;
  name: string;
  live: boolean;
  available: boolean;
};

// LicenseGate is the production blocker for the beta pública: no se permite
// uso normal de la app sin sesión válida. Google OAuth es el acceso mínimo
// recomendado y está promovido a botón principal en LoginScreen.
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
  if (!result || result.state === 'anonymous') {
    return (
      <LoginScreen
        onLoggedIn={(accessToken) => {
          if (!accessToken) return;
          Events.Emit('license:validate', { sessionToken: accessToken });
        }}
      />
    );
  }
  // Unconfigured is a backend configuration error (missing Supabase env
  // vars in the release build). It must never block the user behind a
  // paywall. Show an actionable message instead.
  if (result.state === 'unconfigured') {
    return <UnconfiguredScreen />;
  }
  if (
    result.state === 'expired' ||
    result.state === 'device-limit'
  ) {
    return <PaywallScreen email={result.email} result={result} />;
  }
  return (
    <>
      <LicenseBanner />
      {children}
    </>
  );
}

// LicenseBridge reenvía el access_token de Supabase al servicio Go. Si no hay
// sesión (build sin env vars, mocks, offline), NO refresca con token vacío
// para evitar pisar el resultado de un OAuth callback exitoso. El
// LicenseProvider ya emite license:validate con token vacío en mount; el
// OAuth callback emitirá license:validate con el token real cuando complete.
function LicenseBridge() {
  const { refresh } = useLicense();
  useEffect(() => {
    let cancelled = false;
    getSession()
      .then((session) => {
        if (cancelled) return;
        if (session?.access_token) {
          Events.Emit('license:validate', {
            sessionToken: session.access_token,
          });
        }
        // If there is no session in the WebView's Supabase client, do NOT
        // call refresh(). The initial license:validate with an empty token
        // already ran on LicenseProvider mount, and the OAuth callback will
        // emit license:validate with the real token when it completes.
        // Calling refresh() here would race with the OAuth callback and
        // could overwrite an authenticated state with anonymous.
      })
      .catch(() => {
        // Supabase config error (missing env vars, etc.) — do not refresh.
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);
  return null;
}

function HubShell() {
  const [section, setSection] = useState<Section>('dashboard');
  const [version, setVersion] = useState<string | null>(null);
  const [sourceStatus, setSourceStatus] = useState<SourceStatus | null>(null);
  const [showBetaWelcome, setShowBetaWelcome] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [hasActiveProfile, setHasActiveProfile] = useState(false);
  const [pendingRecommendedAutoStart, setPendingRecommendedAutoStart] = useState<"recommended-auto" | null>(null);
  const settingsRef = useRef<Record<string, unknown> | null>(null);

  useEffect(() => {
    document.body.classList.add('hub');
    const unsub = Events.On('app:version', (event: { data: { version?: string } }) => {
      setVersion(event.data.version ?? null);
    });
    const unsubSource = Events.On('telemetry:source-status', (event: { data: SourceStatus }) => {
      setSourceStatus(event.data);
    });
    const unsubSettings = Events.On('settings', (event: { data: Record<string, unknown> }) => {
      settingsRef.current = event.data ?? null;
      const completed = event.data?.betaWelcomeCompleted === true;
      setShowBetaWelcome(!completed);
      const activeId = event.data?.activeOverlayProfileId;
      setHasActiveProfile(typeof activeId === "string" && activeId.length > 0);
      setSettingsLoaded(true);
    });
    Events.Emit('app:version:get');
    Events.Emit('telemetry:source-status:get');
    Events.Emit('settings:get');
    return () => {
      document.body.classList.remove('hub');
      unsub?.();
      unsubSource?.();
      unsubSettings?.();
    };
  }, []);

  const handleNavigate = useCallback((id: string) => {
    if (isSection(id)) {
      setSection(id);
    }
  }, []);

  const handleBetaWelcomeClose = useCallback((role: BetaUserRole) => {
    setShowBetaWelcome(false);
    const base = settingsRef.current;
    if (base) {
      Events.Emit('settings:save', {
        ...base,
        betaWelcomeCompleted: true,
        betaUserRole: role,
      });
    }
  }, []);

  const handleUseRecommended = useCallback(() => {
    setPendingRecommendedAutoStart("recommended-auto");
    setSection("profiles");
  }, []);

  const handleAutoStartHandled = useCallback(() => {
    setPendingRecommendedAutoStart(null);
  }, []);

  return (
    <V52Shell
      activeSection={section}
      onNavigate={handleNavigate}
      version={version}
      sourceStatus={sourceStatus}
    >
      {settingsLoaded && showBetaWelcome && (
        <BetaWelcome onComplete={handleBetaWelcomeClose} />
      )}
      {section === "dashboard" && (
        <DashboardPage
          onNavigate={handleNavigate}
          hasActiveProfile={hasActiveProfile}
          onUseRecommended={handleUseRecommended}
        />
      )}
      {section === "profiles" && (
        <OverlaysStudioPage
          pendingRecommendedAutoStart={pendingRecommendedAutoStart}
          onAutoStartHandled={handleAutoStartHandled}
        />
      )}
      {section === "launcher" && <LauncherPage />}
      {section === "setup" && <SettingsPage />}
      {section === "engineer" && <EngineerPage />}
      {section === "telemetry" && <TelemetryPage />}
    </V52Shell>
  );
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