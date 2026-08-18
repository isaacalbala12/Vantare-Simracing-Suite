import { I18nProvider } from "../i18n/I18nProvider";
import { useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { Events } from '@wailsio/runtime';
import { V52Shell } from './components/V52Shell';
import { OrbitShell } from './components/orbit/OrbitShell';
import { isOrbitEnabled } from './orbit/orbit-flag';
import { DashboardPage } from './pages/DashboardPage';
import { OverlaysStudioPage } from './pages/OverlaysStudioPage';
import { SettingsPage } from './pages/SettingsPage';
import { EngineerPage } from './pages/EngineerPage';
import { LauncherPage } from './pages/LauncherPage';
import { TelemetryPage } from './pages/TelemetryPage';
import { StrategyPlannerPage } from './strategy/StrategyPlannerPage';
import { RoadmapPage } from './pages/RoadmapPage';
import { CalendarPage } from './pages/CalendarPage';
import { TestingCenterPage } from './testing-center/TestingCenterPage';
import { resolveTestingCenterChannel } from './testing-center/channel-access';
import { submitTestingCenterReport } from './testing-center/report-submission-client';
import { wailsTestingCenterClient } from './testing-center/wails-testing-center-client';
import { testingCenterFeedbackClient } from './testing-center/candidate-feedback-client';
import type { VantareBuildChannel } from './testing-center/contracts';
import { type Section, isSection } from './navigation';
import { LicenseProvider, useLicense } from '../lib/license';
import { LoginScreen } from './auth/LoginScreen';
import { PaywallScreen } from './auth/PaywallScreen';
import { LicenseBanner } from './auth/LicenseBanner';
import { UnconfiguredScreen } from './auth/UnconfiguredScreen';
import { BetaWelcome, type BetaUserRole } from './onboarding/BetaWelcome';
import { CalendarReminderBanner } from './calendar/CalendarReminderBanner';
import type { CalendarReminderPayload } from '../calendar/calendar-types';
import { HubErrorBoundary } from './HubErrorBoundary';
import { ChainRunnerProvider } from './launcher/chain-store';
import { LauncherStoreProvider } from './launcher/launcher-store';
import { useHubResponsiveZoom } from './use-hub-responsive-zoom';
import {
  telemetrySourceStatusEvent,
  telemetrySourceStatusRequestEvent,
  type TelemetrySourceStatus,
} from '../telemetry-transport/source-status';

// LicenseGate is the production blocker for the beta pública: no se permite
// uso normal de la app sin sesión válida. Google OAuth es el acceso mínimo
// recomendado y está promovido a botón principal en LoginScreen.
function LicenseGate({ children }: { children: ReactNode }) {
  const { result, loading } = useLicense();
  // Una vez que el Hub se ha renderizado, no se desmonta jamas por un cambio de
  // estado de licencia. Antes cada transicion cambiaba de rama, y cambiar de
  // rama destruye todo el subarbol: el Hub entero -- Studio, lienzo, widgets --
  // se reconstruia desde cero en cada revalidacion. Los bloqueos posteriores se
  // pintan como capa superpuesta, que impide interactuar igual que antes pero
  // conserva el estado de React.
  const hasRenderedHub = useRef(false);

  // Pantalla bloqueante que corresponde al estado actual, o null si se puede
  // usar la aplicacion.
  const blocking = loading
    ? null
    : !result || result.state === 'anonymous'
      ? (
        <LoginScreen
          onLoggedIn={(tokens) => {
            if (!tokens?.accessToken) return;
            Events.Emit('license:validate', {
              sessionToken: tokens.accessToken,
              refreshToken: tokens.refreshToken ?? '',
            });
          }}
        />
      )
      // Unconfigured is a backend configuration error (missing Supabase env
      // vars in the release build). It must never block the user behind a
      // paywall. Show an actionable message instead.
      : result.state === 'unconfigured'
        ? <UnconfiguredScreen />
        : result.state === 'expired' || result.state === 'device-limit'
          ? <PaywallScreen email={result.email} result={result} />
          : null;

  if (!hasRenderedHub.current) {
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
    if (blocking) {
      return blocking;
    }
    hasRenderedHub.current = true;
  }

  return (
    <>
      <LicenseBanner />
      {children}
      {blocking ? (
        <div
          data-testid="license-blocked-overlay"
          className="fixed inset-0 z-[9999] overflow-auto bg-[#0a0a0a]"
        >
          {blocking}
        </div>
      ) : null}
    </>
  );
}

function HubShell() {
  const { result: licenseResult } = useLicense();
  // El flag se lee una vez por montaje: `?orbit=1` lo enciende y lo persiste.
  const [orbitEnabled] = useState(() => isOrbitEnabled());
  const [section, setSection] = useState<Section>('dashboard');
  const [version, setVersion] = useState<string | null>(null);
  const [buildChannel, setBuildChannel] = useState<VantareBuildChannel | null>(null);
  const [sourceStatus, setSourceStatus] = useState<TelemetrySourceStatus | null>(null);
  const [showBetaWelcome, setShowBetaWelcome] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [pendingRecommendedAutoStart, setPendingRecommendedAutoStart] = useState<"recommended-auto" | null>(null);
  const [reminder, setReminder] = useState<CalendarReminderPayload | null>(null);
  const settingsRef = useRef<Record<string, unknown> | null>(null);
  const testingCenterChannel = resolveTestingCenterChannel(buildChannel, licenseResult?.capabilities);

  const visibleSection: Section = section === "testing-center" && !testingCenterChannel
    ? "dashboard"
    : section;

  useEffect(() => {
    document.body.classList.add('hub');
    const unsub = Events.On('app:version', (event: { data: { version?: string; buildChannel?: string } }) => {
      setVersion(event.data.version ?? null);
      const channel = event.data.buildChannel;
      setBuildChannel(channel === 'nightly' || channel === 'testers' || channel === 'master' ? channel : null);
    });
    const unsubSource = Events.On(telemetrySourceStatusEvent, (event: { data: TelemetrySourceStatus }) => {
      setSourceStatus(event.data);
    });
    const unsubSettings = Events.On('settings', (event: { data: Record<string, unknown> }) => {
      settingsRef.current = event.data ?? null;
      const completed = event.data?.betaWelcomeCompleted === true;
      setShowBetaWelcome(!completed);
      setSettingsLoaded(true);
    });
    const unsubReminder = Events.On('calendar:reminder', (event: { data: CalendarReminderPayload }) => {
      setReminder(event.data ?? null);
    });
    const unsubOverlayStudio = Events.On('hub:open-overlay-studio', () => {
      setSection('profiles');
    });
    Events.Emit('app:version:get');
    Events.Emit(telemetrySourceStatusRequestEvent);
    Events.Emit('settings:get');
    return () => {
      document.body.classList.remove('hub');
      unsub?.();
      unsubSource?.();
      unsubSettings?.();
      unsubReminder?.();
      unsubOverlayStudio?.();
    };
  }, []);

  const handleNavigate = useCallback((id: string) => {
    if (isSection(id) && (id !== "testing-center" || testingCenterChannel)) {
      setSection(id);
    }
  }, [testingCenterChannel]);

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

  const handleAutoStartHandled = useCallback(() => {
    setPendingRecommendedAutoStart(null);
  }, []);

  const handleCloseReminder = useCallback(() => {
    setReminder(null);
  }, []);

  // Feature flag `hub.orbit`: con el flag apagado (por defecto) la shell actual
  // no cambia; con `?orbit=1` se monta la shell Orbit con las mismas páginas.
  const Shell = orbitEnabled ? OrbitShell : V52Shell;

  return (
    <Shell
      activeSection={visibleSection}
      onNavigate={handleNavigate}
      version={version}
      sourceStatus={sourceStatus}
      testingCenterChannel={testingCenterChannel}
    >
      {settingsLoaded && showBetaWelcome && (
        <BetaWelcome onComplete={handleBetaWelcomeClose} />
      )}
      {reminder && (
        <CalendarReminderBanner reminder={reminder} onClose={handleCloseReminder} />
      )}
      {visibleSection === "dashboard" && (
        <DashboardPage
          onNavigate={handleNavigate}
          version={version}
          buildChannel={buildChannel}
        />
      )}
      {visibleSection === "profiles" && (
        <OverlaysStudioPage
          pendingRecommendedAutoStart={pendingRecommendedAutoStart}
          onAutoStartHandled={handleAutoStartHandled}
        />
      )}
      {visibleSection === "launcher" && <LauncherPage />}
      {visibleSection === "calendar" && <CalendarPage />}
      {visibleSection === "setup" && <SettingsPage />}
      {visibleSection === "engineer" && <EngineerPage />}
      {visibleSection === "strategy" && <StrategyPlannerPage />}
      {visibleSection === "telemetry" && <TelemetryPage />}
      {visibleSection === "testing-center" && testingCenterChannel && (
        <TestingCenterPage
          channel={testingCenterChannel}
          version={version}
          client={wailsTestingCenterClient}
          submitReport={submitTestingCenterReport}
          feedbackClient={testingCenterFeedbackClient}
        />
      )}
      {visibleSection === "roadmap" && <RoadmapPage />}
    </Shell>
  );
}

export function HubApp() {
  useHubResponsiveZoom();
  return (
    <LicenseProvider>
      <I18nProvider>
        <LicenseGate>
          <HubErrorBoundary>
            <ChainRunnerProvider>
              <LauncherStoreProvider>
                <HubShell />
              </LauncherStoreProvider>
            </ChainRunnerProvider>
          </HubErrorBoundary>
        </LicenseGate>
      </I18nProvider>
    </LicenseProvider>
  );
}
