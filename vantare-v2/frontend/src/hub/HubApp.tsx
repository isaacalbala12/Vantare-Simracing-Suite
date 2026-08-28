import { I18nProvider } from '../i18n/I18nProvider';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { Events } from '@wailsio/runtime';
import { OrbitShell } from './components/orbit/OrbitShell';
import { ORBIT_KEYS, orbitStore } from './orbit/orbit-store';
import { initialSection } from './orbit/initial-view';
import { viewToSection } from './orbit/views';
import { resolveTestingCenterChannel } from './testing-center/channel-access';
import {
  UPDATER_CHANNEL_EVENT,
  buildChannelOf,
  type UpdaterChannelEvent,
} from './settings/updater-channel';
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
import {
  telemetrySourceStatusEvent,
  telemetrySourceStatusRequestEvent,
  type TelemetrySourceStatus,
} from '../telemetry-transport/source-status';
import { installHubSuspendGuard } from './hub-suspend-guard';

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
  const [hasRenderedHub, setHasRenderedHub] = useState(false);
  const markHubRendered = useCallback(() => setHasRenderedHub(true), []);

  // Pantalla bloqueante que corresponde al estado actual, o null si se puede
  // usar la aplicacion.
  const blocking = loading ? null : !result || result.state === 'anonymous' ? (
    <LoginScreen
      onLoggedIn={(tokens) => {
        if (!tokens?.accessToken) return;
        Events.Emit('license:validate', {
          sessionToken: tokens.accessToken,
          refreshToken: tokens.refreshToken ?? '',
        });
      }}
    />
  ) : // Unconfigured is a backend configuration error (missing Supabase env
  // vars in the release build). It must never block the user behind a
  // paywall. Show an actionable message instead.
  result.state === 'unconfigured' ? (
    <UnconfiguredScreen />
  ) : result.state === 'expired' || result.state === 'device-limit' ? (
    <PaywallScreen email={result.email} result={result} />
  ) : null;

  const canRenderHub = !loading && blocking === null;

  if (!hasRenderedHub && !canRenderHub) {
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
  }

  return (
    <>
      <LicenseBanner />
      <MountedHub onMount={markHubRendered}>{children}</MountedHub>
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

function MountedHub({ children, onMount }: { children: ReactNode; onMount(): void }) {
  useEffect(onMount, [onMount]);
  return children;
}

function HubShell() {
  const { result: licenseResult } = useLicense();
  const [section, setSection] = useState<Section>(() => initialSection());
  const [version, setVersion] = useState<string | null>(null);
  const [buildChannel, setBuildChannel] = useState<VantareBuildChannel | null>(null);
  // Canal elegido en Ajustes > Actualizaciones. Manda sobre el canal con el que
  // se compilo el binario: si no, cambiarlo no movia nada hasta reinstalar y el
  // Testing Center seguia apareciendo (o faltando) contra lo que dice la
  // pantalla. La licencia sigue decidiendo (`resolveTestingCenterChannel`).
  const [preferredChannel, setPreferredChannel] = useState<VantareBuildChannel | null>(null);
  const [sourceStatus, setSourceStatus] = useState<TelemetrySourceStatus | null>(null);
  const [showBetaWelcome, setShowBetaWelcome] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [reminder, setReminder] = useState<CalendarReminderPayload | null>(null);
  // Destino de la última navegación de la shell Orbit (`navigate(view, target)`):
  // la pantalla destino lo consume, hoy el Studio para abrir «Mis perfiles».
  const [navTarget, setNavTarget] = useState<string | undefined>(undefined);
  const settingsRef = useRef<Record<string, unknown> | null>(null);
  const testingCenterChannel = resolveTestingCenterChannel(
    preferredChannel ?? buildChannel,
    licenseResult?.capabilities,
  );

  useEffect(() => installHubSuspendGuard({
    on: (event, handler) => {
      const unsubscribe = Events.On(event, handler);
      return () => unsubscribe?.();
    },
    emit: (event, payload) => Events.Emit(event, payload),
  }), []);

  const visibleSection: Section =
    section === 'testing-center' && !testingCenterChannel ? 'dashboard' : section;

  useEffect(() => {
    document.body.classList.add('hub');
    const unsub = Events.On(
      'app:version',
      (event: { data: { version?: string; buildChannel?: string } }) => {
        setVersion(event.data.version ?? null);
        const channel = event.data.buildChannel;
        setBuildChannel(
          channel === 'nightly' || channel === 'testers' || channel === 'master' ? channel : null,
        );
      },
    );
    const unsubSource = Events.On(
      telemetrySourceStatusEvent,
      (event: { data: TelemetrySourceStatus }) => {
        setSourceStatus(event.data);
      },
    );
    const unsubSettings = Events.On('settings', (event: { data: Record<string, unknown> }) => {
      settingsRef.current = event.data ?? null;
      const completed = event.data?.betaWelcomeCompleted === true;
      setShowBetaWelcome(!completed);
      setSettingsLoaded(true);
      // Primer arranque: la bienvenida se monta sobre Inicio, nunca sobre otra
      // pantalla que hubiese quedado guardada por una sesión de pruebas.
      if (!completed) {
        orbitStore.set(ORBIT_KEYS.view, 'inicio');
        setSection(viewToSection('inicio'));
      }
    });
    // Ajustes emite este evento al confirmar el canal (y al releerlo del
    // backend): la shell se entera sin recargar.
    const unsubChannel = Events.On(
      UPDATER_CHANNEL_EVENT,
      (event: { data: UpdaterChannelEvent }) => {
        const channel = event.data?.channel;
        setPreferredChannel(channel ? buildChannelOf(channel) : null);
      },
    );
    // Y al arrancar, directo del backend: Ajustes puede no haberse abierto nunca.
    const unsubUpdaterSettings = Events.On(
      'updater:settings',
      (event: { data: { settings?: { channel?: UpdaterChannelEvent['channel'] } } }) => {
        const channel = event.data?.settings?.channel;
        if (channel) setPreferredChannel(buildChannelOf(channel));
      },
    );
    const unsubReminder = Events.On(
      'calendar:reminder',
      (event: { data: CalendarReminderPayload }) => {
        setReminder(event.data ?? null);
      },
    );
    const unsubOverlayStudio = Events.On('hub:open-overlay-studio', () => {
      setSection('profiles');
    });
    Events.Emit('app:version:get');
    Events.Emit(telemetrySourceStatusRequestEvent);
    Events.Emit('settings:get');
    Events.Emit('updater:settings:get');
    return () => {
      document.body.classList.remove('hub');
      unsub?.();
      unsubSource?.();
      unsubSettings?.();
      unsubChannel?.();
      unsubUpdaterSettings?.();
      unsubReminder?.();
      unsubOverlayStudio?.();
    };
  }, []);

  const handleNavigate = useCallback(
    (id: string, target?: string) => {
      if (isSection(id) && (id !== 'testing-center' || testingCenterChannel)) {
        setSection(id);
        setNavTarget(target);
      }
    },
    [testingCenterChannel],
  );

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

  const handleCloseReminder = useCallback(() => {
    setReminder(null);
  }, []);

  // La bienvenida y el aviso de carrera son capas `fixed` sobre toda la app, no
  // contenido de una pantalla. Vivían dentro de `children`, y como la shell
  // Orbit solo pinta `children` en la rama de respaldo (Studio), el onboarding
  // acababa apareciendo en Overlays Studio en vez de encima de Inicio.
  return (
    <>
      <OrbitShell
        activeSection={visibleSection}
        onNavigate={handleNavigate}
        version={version}
        sourceStatus={sourceStatus}
        testingCenterChannel={testingCenterChannel}
        target={navTarget}
      />
      {settingsLoaded && showBetaWelcome && <BetaWelcome onComplete={handleBetaWelcomeClose} />}
      {reminder && <CalendarReminderBanner reminder={reminder} onClose={handleCloseReminder} />}
    </>
  );
}

export function HubApp() {
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
