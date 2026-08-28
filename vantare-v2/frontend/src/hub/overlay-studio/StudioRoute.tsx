import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Events } from '@wailsio/runtime';
import { useI18n } from '../../i18n/I18nProvider';
import { createTelemetryRateCoordinator } from '../../overlay/core/telemetry-rate-coordinator';
import type { TelemetryAdapter } from '../../overlay/transports/telemetry-adapter';
import type { WidgetRuntimeInput } from '../../overlay/core/widget-definition';
import { createWailsProjectionTelemetryAdapter } from '../../overlay/transports/projection-telemetry-adapter';
import {
  createOverlayFrameV2Store,
  type OverlayFrameV2State,
} from '../../telemetry-transport/overlay-frame-v2-store';
import { createBrowserOverlayWailsPullClient } from '../../telemetry-transport/overlay-wails-pull';
import {
  telemetrySourceStatusEvent,
  telemetrySourceStatusRequestEvent,
  type TelemetrySourceStatus,
} from '../../telemetry-transport/source-status';
import { readDiagnosticOverlayV2Features } from '../../overlay/telemetry-shadow/overlay-v2-features';
import { ProfilesOrbitPage } from '../profiles-orbit/ProfilesOrbitPage';
import { RecommendedProfilesView } from '../overlays/RecommendedProfilesView';
import { CommunityComingSoonView } from '../overlays/CommunityComingSoonView';
import { ObsOverlaySetupView } from '../overlays/ObsOverlaySetupView';
import { RecommendedSuccessBanner } from '../overlays/RecommendedSuccessBanner';
import {
  RECOMMENDED_PROFILES,
  cloneRecommendedProfile,
  type RecommendedProfile,
} from '../overlays/recommended-profiles';
import { runRecommendedFirstUse } from '../overlays/recommended-first-use';
import {
  isRunningProfile,
  profileTarget,
  type OverlayStatus,
  type ProfileEntry,
} from '../state/overlay-workbench';
import type { AppSettings } from '../settings/settings-contract';
import { DirtyChangesDialog } from './components/DirtyChangesDialog';
import { ProfileNameDialog } from './components/ProfileNameDialog';
import { NoActiveProfileState } from './NoActiveProfileState';
import { OverlayStudioV3 } from './OverlayStudioV3';

import {
  createStudioProfileClient,
  createWailsStudioEventTransport,
  type StudioProfileClient,
} from './state/studio-profile-client';
import { ConnectedStudioProvider, useStudioDocument } from './state/studio-store';
import { StudioAutosave } from './state/studio-autosave';
import type { StudioProfileEntry } from './studio-profile-entry';

import { modeFromTarget, type StudioRouteMode } from './studio-route-target';
import { createStudioOverlayTelemetryAdapter } from './studio-overlay-telemetry';

const EMPTY_OVERLAY_V2_STATE: OverlayFrameV2State = Object.freeze({revision: 0, ageMs: 0});
const subscribeToNothing = () => () => undefined;
const getEmptyOverlayV2State = () => EMPTY_OVERLAY_V2_STATE;

type ProfilesListPayload = {
  profiles?: ProfileEntry[];
};

type RouteNavigationTarget = StudioRouteMode | string;

export type StudioRouteProps = {
  client?: StudioProfileClient;
  telemetryAdapter?: TelemetryAdapter | null;
  coordinator?: ReturnType<typeof createTelemetryRateCoordinator>;
  liveAvailable?: boolean;
  pendingRecommendedAutoStart?: 'recommended-auto' | null;
  onAutoStartHandled?: () => void;
  /** Destino que manda la shell: con "profiles" se abre Mis perfiles. */
  target?: string;
};

function getPayload<T>(event: { data: unknown }): T {
  return (Array.isArray(event.data) ? event.data[0] : event.data) as T;
}

function resolveFileById(id: string, timeoutMs = 3000): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      unsub?.();
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    const unsub = Events.On('hub:profiles', (event: { data?: ProfilesListPayload }) => {
      const match = event.data?.profiles?.find((profile) => profile.id === id);
      if (match) {
        finish(match.file);
      }
    });
    Events.Emit('hub:list');
  });
}

function resolveActiveFile(
  activeProfileId: string | null,
  profiles: ProfileEntry[],
): string | null {
  if (!activeProfileId) {
    return null;
  }
  return profiles.find((profile) => profile.id === activeProfileId)?.file ?? null;
}

function findProfileByName(profiles: ProfileEntry[], name: string): ProfileEntry | null {
  const normalized = name.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return (
    profiles.find((profile) => (profile.name?.trim() || profile.id).toLowerCase() === normalized) ??
    null
  );
}

function toStudioProfiles(profiles: ProfileEntry[]): StudioProfileEntry[] {
  return profiles.map((profile) => ({
    id: profile.id,
    name: profile.name?.trim() || profile.id,
    file: profile.file,
  }));
}

type StudioRouteEditorProps = {
  profiles: StudioProfileEntry[];
  editorFile: string;
  coordinator: ReturnType<typeof createTelemetryRateCoordinator>;
  telemetryAdapter: TelemetryAdapter | null;
  liveAvailable: boolean;
  runtime?: WidgetRuntimeInput;
  mode: StudioRouteMode;
  overlayStatus: OverlayStatus | null;
  activeProfileId: string | null;
  profileEntries: ProfileEntry[];
  notice: string | null;
  lastSuccessId: string | null;
  autoActivateAndStart: boolean;
  navigationDialogOpen: boolean;
  navigationSaving: boolean;
  navigationError: string | null;
  onRequestProfileChange(file: string): void;
  onSetMode(mode: StudioRouteMode): void;
  onCreateProfile(): void;
  onStartOverlay(profile: ProfileEntry): void;
  onStopOverlay(): void;
  onOpenProfile(profile: ProfileEntry): void;
  onSetActiveProfile(profile: ProfileEntry): void;
  onOpenActiveOverlay(): void;
  onSaveRecommended(profile: RecommendedProfile): void;
  onDismissSuccess(): void;
  onNavigationSave(): void;
  onNavigationDiscard(): void;
  onNavigationCancel(): void;
};

function StudioRouteEditor(props: StudioRouteEditorProps): React.ReactElement {
  const {
    profiles,
    editorFile,
    coordinator,
    telemetryAdapter,
    liveAvailable,
    runtime,
    mode,
    overlayStatus,
    activeProfileId,
    profileEntries,
    notice,
    lastSuccessId,
    autoActivateAndStart,
    navigationDialogOpen,
    navigationSaving,
    navigationError,
    onRequestProfileChange,
    onSetMode,
    onCreateProfile,
    onStartOverlay,
    onStopOverlay,
    onOpenProfile,
    onSetActiveProfile,
    onOpenActiveOverlay,
    onSaveRecommended,
    onDismissSuccess,
    onNavigationSave,
    onNavigationDiscard,
    onNavigationCancel,
  } = props;
  const { t } = useI18n();
  const { document, lastError } = useStudioDocument();

  if (!document) {
    return (
      <div
        data-testid="studio-route-loading"
        className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-[1200px] flex-col px-6 py-8"
      >
        <div className="glass-panel rounded-xl p-8 text-sm text-vantare-textMuted">
          {t('studio.v3.route.loadingProfile')}
        </div>
      </div>
    );
  }

  if (lastError) {
    return (
      <div
        data-testid="studio-route-load-error"
        className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-[720px] flex-col px-6 py-8"
      >
        <div className="rounded-xl border border-vantare-red-500/30 bg-vantare-red-950/20 p-6 text-sm text-vantare-red-300">
          {lastError}
        </div>
      </div>
    );
  }

  let secondaryView: React.ReactElement | null = null;
  if (mode === 'ownProfiles') {
    secondaryView = (
      <ProfilesOrbitPage
        profiles={profileEntries}
        overlayStatus={overlayStatus}
        activeProfileId={activeProfileId}
        onStartOverlay={onStartOverlay}
        onStopOverlay={onStopOverlay}
        onOpenProfile={onOpenProfile}
        onCreateProfile={onCreateProfile}
        onSetActiveProfile={onSetActiveProfile}
        onOpenActiveOverlay={onOpenActiveOverlay}
        onBack={() => onSetMode('editor')}
      />
    );
  } else if (mode === 'recommended') {
    secondaryView = (
      <div>
        {lastSuccessId ? (
          <div className="mx-auto mt-4 max-w-[1800px] px-6">
            <RecommendedSuccessBanner
              profileId={lastSuccessId}
              onGoToDashboard={onDismissSuccess}
            />
          </div>
        ) : null}
        {notice ? (
          <div className="mx-auto mt-4 max-w-[1800px] px-6">
            <div
              data-testid="recommended-error-banner"
              className="rounded-lg border border-vantare-red-500/30 bg-vantare-red-950/20 px-4 py-3 text-sm text-vantare-red-300"
            >
              {notice}
            </div>
          </div>
        ) : null}
        <RecommendedProfilesView
          profiles={RECOMMENDED_PROFILES}
          onSaveRecommended={onSaveRecommended}
          onBack={() => onSetMode('editor')}
          autoActivateAndStart={autoActivateAndStart}
        />
      </div>
    );
  } else if (mode === 'community') {
    secondaryView = <CommunityComingSoonView onBack={() => onSetMode('editor')} />;
  } else if (mode === 'obs') {
    const obsProfileRef = activeProfileId ?? editorFile;
    const obsUrl = `${window.location.origin}/overlay?profile=${encodeURIComponent(obsProfileRef)}`;
    secondaryView = <ObsOverlaySetupView url={obsUrl} onBack={() => onSetMode('editor')} />;
  }

  const editorActive = mode === 'editor';

  return (
    <>
      <DirtyChangesDialog
        open={navigationDialogOpen}
        saving={navigationSaving}
        errorMessage={navigationError}
        onSave={onNavigationSave}
        onDiscard={onNavigationDiscard}
        onCancel={onNavigationCancel}
      />
      <div className="studio-route-views">
        <div
          aria-hidden={!editorActive}
          className="studio-route-editor-view"
          data-active={editorActive}
          data-studio-editor-view
          inert={!editorActive}
        >
          <OverlayStudioV3
            active={editorActive}
            profiles={profiles}
            activeFile={editorFile}
            coordinator={coordinator}
            telemetryAdapter={telemetryAdapter}
            liveAvailable={liveAvailable}
            runtime={runtime}
            onRequestProfileChange={onRequestProfileChange}
          />
        </div>
        {secondaryView}
      </div>
    </>
  );
}

type StudioRouteNavigationBridgeProps = {
  onDirtyChange(dirty: boolean): void;
  onBindActions(actions: {
    save(): ReturnType<ReturnType<typeof useStudioDocument>['save']>;
    discardAll(): void;
  }): void;
};

function StudioRouteNavigationBridge(props: StudioRouteNavigationBridgeProps): null {
  const { dirty, save, discardAll } = useStudioDocument();
  const { onDirtyChange, onBindActions } = props;

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    onBindActions({ save, discardAll });
  }, [discardAll, onBindActions, save]);

  return null;
}

export const StudioRoute = memo(function StudioRoute(props: StudioRouteProps): React.ReactElement {
  const {
    client: clientProp,
    telemetryAdapter: telemetryAdapterProp = null,
    coordinator: coordinatorProp,
    liveAvailable: liveAvailableProp,
    pendingRecommendedAutoStart = null,
    onAutoStartHandled,
    target,
  } = props;
  const { t } = useI18n();

  const client = useMemo(
    () => clientProp ?? createStudioProfileClient(createWailsStudioEventTransport()),
    [clientProp],
  );
  const coordinator = useMemo(
    () => coordinatorProp ?? createTelemetryRateCoordinator(),
    [coordinatorProp],
  );
  const overlayV2Store = useMemo(() => createOverlayFrameV2Store(), []);
  const [overlayV2Features, setOverlayV2Features] = useState(() =>
    readDiagnosticOverlayV2Features(),
  );
  const overlayV2Enabled = overlayV2Features.length > 0;
  const overlayV2State = useSyncExternalStore(
    overlayV2Enabled ? overlayV2Store.subscribe : subscribeToNothing,
    overlayV2Enabled ? overlayV2Store.getSnapshot : getEmptyOverlayV2State,
    overlayV2Enabled ? overlayV2Store.getSnapshot : getEmptyOverlayV2State,
  );
  const overlayPull = useMemo(() => createBrowserOverlayWailsPullClient({
    onError: (error) => console.error('studio overlay telemetry pull failed', error),
  }), []);
  const telemetryAdapter = useMemo(() => {
    if (telemetryAdapterProp !== null) {
      return telemetryAdapterProp;
    }
    const legacy = createWailsProjectionTelemetryAdapter({
      coordinator,
      runtime: 'studio',
      subscribe: overlayPull.source.subscribe,
    });
    return createStudioOverlayTelemetryAdapter({
      legacy,
      pull: overlayPull,
      overlayV2Store,
      onOverlayV2Error: (error) => console.error('studio overlay-v2 ingest failed', error),
    });
  }, [coordinator, overlayPull, overlayV2Store, telemetryAdapterProp]);
  const runtime = useMemo<WidgetRuntimeInput>(() => ({
    overlayV2Features,
    overlayV2Frame: overlayV2State.frame,
    overlayV2Source: overlayV2State.source,
  }), [overlayV2Features, overlayV2State.frame, overlayV2State.source]);

  const [profiles, setProfiles] = useState<ProfileEntry[]>([]);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [editorFile, setEditorFile] = useState<string | null>(null);
  const [mode, setMode] = useState<StudioRouteMode>(() => modeFromTarget(target) ?? 'editor');
  // La shell puede pedir Mis perfiles sin desmontar la ruta: navigate a studio
  // con destino profiles desde Inicio o desde la columna. Es el patron de
  // ajustar estado durante el render de React: un destino nuevo manda, y el
  // boton Volver sigue pudiendo cambiar el modo porque el destino no se repite.
  const [lastTarget, setLastTarget] = useState(target);
  if (target !== lastTarget) {
    setLastTarget(target);
    const requested = modeFromTarget(target);
    if (requested && requested !== mode) setMode(requested);
  }
  const [overlayStatus, setOverlayStatus] = useState<OverlayStatus | null>(null);
  const [reportedLiveAvailable, setReportedLiveAvailable] = useState(false);
  const liveAvailable = liveAvailableProp ?? reportedLiveAvailable;
  const [notice, setNotice] = useState<string | null>(null);
  const [lastSuccessId, setLastSuccessId] = useState<string | null>(null);
  const [navigationDialogOpen, setNavigationDialogOpen] = useState(false);
  const [navigationSaving, setNavigationSaving] = useState(false);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createDialogSaving, setCreateDialogSaving] = useState(false);
  const [createDialogError, setCreateDialogError] = useState<string | null>(null);
  const [recommendedCopyTarget, setRecommendedCopyTarget] = useState<RecommendedProfile | null>(
    null,
  );

  const dirtyRef = useRef(false);
  const pendingCreateNameRef = useRef<string | null>(null);
  const studioActionsRef = useRef<{
    save(): ReturnType<ReturnType<typeof useStudioDocument>['save']>;
    discardAll(): void;
  } | null>(null);
  const navigationResolverRef = useRef<((decision: 'save' | 'discard' | 'cancel') => void) | null>(
    null,
  );

  const isAutoStart = pendingRecommendedAutoStart === 'recommended-auto';
  const effectiveMode: StudioRouteMode = isAutoStart && mode === 'editor' ? 'recommended' : mode;
  const autoActivateAndStart = isAutoStart;
  const studioProfiles = useMemo(() => toStudioProfiles(profiles), [profiles]);

  useEffect(() => {
    const refresh = () => setOverlayV2Features(readDiagnosticOverlayV2Features());
    window.addEventListener('vantare:overlay-v2-features-changed', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('vantare:overlay-v2-features-changed', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  useEffect(() => {
    if (liveAvailableProp !== undefined) return;
    const unsub = Events.On(
      telemetrySourceStatusEvent,
      (event: { data: TelemetrySourceStatus }) => {
        setReportedLiveAvailable(Boolean(event.data?.live && event.data?.available));
      },
    );
    Events.Emit(telemetrySourceStatusRequestEvent);
    return () => unsub?.();
  }, [liveAvailableProp]);

  useEffect(() => {
    const unsubProfiles = Events.On('hub:profiles', (event: { data: unknown }) => {
      const data = getPayload<ProfilesListPayload>(event);
      setProfiles(data?.profiles ?? []);
      setProfilesLoaded(true);
    });
    const unsubCreated = Events.On('hub:profile-created', () => {
      Events.Emit('hub:list');
    });
    const unsubOverlayStatus = Events.On('overlay:status', (event: { data: unknown }) => {
      setOverlayStatus(event.data as OverlayStatus);
    });
    const unsubSettings = Events.On('settings', (event: { data: AppSettings }) => {
      if (event.data?.activeOverlayProfileId) {
        setActiveProfileId(event.data.activeOverlayProfileId);
      }
    });
    const unsubActivated = Events.On('hub:profile-activated', (event: { data: unknown }) => {
      const payload = getPayload<{ activeProfileId?: string }>(event);
      if (payload?.activeProfileId) {
        setActiveProfileId(payload.activeProfileId);
      }
    });
    const unsubError = Events.On('hub:error', (event: { data: unknown }) => {
      const payload = getPayload<{ message?: string }>(event);
      if (!pendingCreateNameRef.current) {
        return;
      }
      pendingCreateNameRef.current = null;
      setCreateDialogSaving(false);
      setCreateDialogError(payload?.message ?? t('studio.v3.profile.createFailed'));
    });

    Events.Emit('hub:list');
    Events.Emit('settings:get');

    return () => {
      unsubProfiles();
      unsubCreated();
      unsubOverlayStatus();
      unsubSettings();
      unsubActivated();
      unsubError();
    };
  }, [t]);

  useEffect(() => {
    const pendingName = pendingCreateNameRef.current;
    if (!pendingName || !profilesLoaded) {
      return;
    }
    const created = findProfileByName(profiles, pendingName);
    if (!created) {
      return;
    }
    pendingCreateNameRef.current = null;
    setCreateDialogSaving(false);
    setCreateDialogOpen(false);
    setCreateDialogError(null);
    Events.Emit('hub:set-active', { id: created.id, file: created.file });
    setActiveProfileId(created.id);
    setEditorFile(created.file);
    setMode('editor');
  }, [profiles, profilesLoaded]);

  useEffect(() => {
    return () => {
      telemetryAdapter?.stop();
      coordinator.dispose();
    };
  }, [coordinator, telemetryAdapter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!profilesLoaded || !activeProfileId) {
        if (!activeProfileId) setEditorFile(null);
        return;
      }
      const resolved = resolveActiveFile(activeProfileId, profiles);
      setEditorFile((current) => current ?? resolved);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeProfileId, profiles, profilesLoaded]);

  const continueNavigation = useCallback((target: RouteNavigationTarget) => {
    if (target.endsWith('.json')) {
      setEditorFile(target);
    } else {
      setMode(target as StudioRouteMode);
    }
    setNavigationDialogOpen(false);
    setNavigationSaving(false);
    setNavigationError(null);
  }, []);

  const guardedNavigate = useCallback(
    async (target: RouteNavigationTarget) => {
      const actions = studioActionsRef.current;
      if (!actions || !dirtyRef.current) {
        continueNavigation(target);
        return;
      }

      const decision = await new Promise<'save' | 'discard' | 'cancel'>((resolve) => {
        navigationResolverRef.current = resolve;
        setNavigationDialogOpen(true);
        setNavigationError(null);
      });

      if (decision === 'cancel') {
        setNavigationDialogOpen(false);
        setNavigationSaving(false);
        return;
      }
      if (decision === 'discard') {
        actions.discardAll();
        continueNavigation(target);
        return;
      }

      setNavigationSaving(true);
      const saveResult = await actions.save();
      setNavigationSaving(false);
      if (saveResult.status === 'saved') {
        continueNavigation(target);
        return;
      }
      setNavigationError(
        saveResult.status === 'conflict' || saveResult.status === 'error'
          ? saveResult.message
          : t('studio.v3.profile.saveFailed'),
      );
    },
    [continueNavigation, t],
  );

  const onRequestProfileChange = useCallback(
    (file: string) => {
      void guardedNavigate(file);
    },
    [guardedNavigate],
  );

  const onSetMode = useCallback(
    (nextMode: StudioRouteMode) => {
      void guardedNavigate(nextMode);
    },
    [guardedNavigate],
  );

  const onNavigationSave = useCallback(() => {
    setNavigationSaving(true);
    setNavigationError(null);
    navigationResolverRef.current?.('save');
    navigationResolverRef.current = null;
  }, []);

  const onNavigationDiscard = useCallback(() => {
    navigationResolverRef.current?.('discard');
    navigationResolverRef.current = null;
  }, []);

  const onNavigationCancel = useCallback(() => {
    navigationResolverRef.current?.('cancel');
    navigationResolverRef.current = null;
  }, []);

  function createProfile() {
    setCreateDialogError(null);
    setCreateDialogOpen(true);
  }

  function confirmCreateProfile(name: string) {
    setCreateDialogError(null);
    setCreateDialogSaving(true);
    pendingCreateNameRef.current = name;
    Events.Emit('hub:create', { name });
  }

  function closeCreateDialog() {
    if (createDialogSaving) {
      return;
    }
    pendingCreateNameRef.current = null;
    setCreateDialogOpen(false);
    setCreateDialogError(null);
  }

  function openProfile(profile: ProfileEntry) {
    Events.Emit('hub:set-active', { id: profile.id, file: profile.file });
    setEditorFile(profile.file);
    setMode('editor');
  }

  function saveRecommended(profile: RecommendedProfile) {
    setRecommendedCopyTarget(profile);
  }

  function confirmRecommendedCopy(name: string) {
    const profile = recommendedCopyTarget;
    if (!profile) {
      return;
    }
    setRecommendedCopyTarget(null);

    if (autoActivateAndStart) {
      runRecommendedFirstUse({
        profile,
        name,
        emit: (eventName, data) => Events.Emit(eventName, data),
        resolveFile: resolveFileById,
        onSuccess: (id) => {
          setLastSuccessId(id);
          setNotice(null);
        },
        onError: (messageKey) => {
          setNotice(t(messageKey));
        },
      });
      return;
    }

    Events.Emit('hub:save-own-copy', { profile: cloneRecommendedProfile(profile, name) });
  }

  function startOverlay(profile: ProfileEntry) {
    Events.Emit('overlay:start', profileTarget(profile));
  }

  function stopOverlay() {
    Events.Emit('overlay:stop');
  }

  function setActiveProfile(profile: ProfileEntry) {
    Events.Emit('hub:set-active', { id: profile.id, file: profile.file });
  }

  function openActiveOverlay() {
    Events.Emit('overlay:start-active');
  }

  const profileDialogs = (
    <>
      <ProfileNameDialog
        open={createDialogOpen}
        title={t('studio.v3.profile.create.title')}
        description={t('studio.v3.profile.create.description')}
        confirmLabel={t('studio.v3.profile.create.confirm')}
        placeholder={t('studio.v3.profile.create.placeholder')}
        saving={createDialogSaving}
        errorMessage={createDialogError}
        dialogTestId="studio-create-profile-dialog"
        onClose={closeCreateDialog}
        onConfirm={confirmCreateProfile}
      />
      <ProfileNameDialog
        open={recommendedCopyTarget !== null}
        title={t('studio.v3.profile.saveRecommended.title')}
        description={t('studio.v3.profile.saveRecommended.description')}
        defaultName={recommendedCopyTarget ? `${recommendedCopyTarget.name} (copia)` : ''}
        confirmLabel={t('studio.v3.profile.saveRecommended.confirm')}
        placeholder={t('studio.v3.profile.saveRecommended.placeholder')}
        dialogTestId="studio-save-recommended-dialog"
        onClose={() => setRecommendedCopyTarget(null)}
        onConfirm={confirmRecommendedCopy}
      />
    </>
  );

  if (!profilesLoaded) {
    return (
      <>
        <div
          data-testid="studio-route-loading"
          className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-[1200px] flex-col px-6 py-8"
        >
          <div className="glass-panel rounded-xl p-8 text-sm text-vantare-textMuted">
            {t('studio.v3.route.loadingProfiles')}
          </div>
        </div>
        {profileDialogs}
      </>
    );
  }

  if (!activeProfileId || !editorFile) {
    if (effectiveMode === 'recommended') {
      return (
        <>
          <div>
            {notice ? (
              <div className="mx-auto mt-4 max-w-[1800px] px-6">
                <div
                  data-testid="recommended-error-banner"
                  className="rounded-lg border border-vantare-red-500/30 bg-vantare-red-950/20 px-4 py-3 text-sm text-vantare-red-300"
                >
                  {notice}
                </div>
              </div>
            ) : null}
            <RecommendedProfilesView
              profiles={RECOMMENDED_PROFILES}
              onSaveRecommended={saveRecommended}
              onBack={() => {
                setMode('editor');
                onAutoStartHandled?.();
              }}
              autoActivateAndStart={autoActivateAndStart}
            />
          </div>
          {profileDialogs}
        </>
      );
    }
    if (mode === 'ownProfiles') {
      return (
        <>
          <ProfilesOrbitPage
            profiles={profiles}
            overlayStatus={overlayStatus}
            activeProfileId={activeProfileId}
            onStartOverlay={startOverlay}
            onStopOverlay={stopOverlay}
            onOpenProfile={openProfile}
            onCreateProfile={createProfile}
            onSetActiveProfile={setActiveProfile}
            onOpenActiveOverlay={openActiveOverlay}
            onBack={() => setMode('editor')}
          />
          {profileDialogs}
        </>
      );
    }
    if (mode === 'recommended') {
      return (
        <>
          <div>
            {notice ? (
              <div className="mx-auto mt-4 max-w-[1800px] px-6">
                <div
                  data-testid="recommended-error-banner"
                  className="rounded-lg border border-vantare-red-500/30 bg-vantare-red-950/20 px-4 py-3 text-sm text-vantare-red-300"
                >
                  {notice}
                </div>
              </div>
            ) : null}
            <RecommendedProfilesView
              profiles={RECOMMENDED_PROFILES}
              onSaveRecommended={saveRecommended}
              onBack={() => setMode('editor')}
              autoActivateAndStart={autoActivateAndStart}
            />
          </div>
          {profileDialogs}
        </>
      );
    }
    return (
      <>
        <NoActiveProfileState
          onCreateProfile={createProfile}
          onSelectProfile={() => setMode('ownProfiles')}
          onOpenRecommended={() => setMode('recommended')}
        />
        {profileDialogs}
      </>
    );
  }

  const activeEntry = profiles.find((profile) => profile.id === activeProfileId) ?? null;
  const activeOverlayRunning = activeEntry
    ? isRunningProfile(activeEntry, overlayStatus)
    : Boolean(overlayStatus?.running);

  return (
    <>
      <ConnectedStudioProvider key={editorFile} client={client} initialFile={editorFile}>
        <StudioAutosave />
        <StudioRouteNavigationBridge
          onDirtyChange={(dirty) => {
            dirtyRef.current = dirty;
          }}
          onBindActions={(actions) => {
            studioActionsRef.current = actions;
          }}
        />
        <StudioRouteEditor
          profiles={studioProfiles}
          editorFile={editorFile}
          coordinator={coordinator}
          telemetryAdapter={telemetryAdapter}
          liveAvailable={liveAvailable}
          runtime={runtime}
          mode={effectiveMode}
          overlayStatus={overlayStatus}
          activeProfileId={activeProfileId}
          profileEntries={profiles}
          notice={notice}
          lastSuccessId={lastSuccessId}
          autoActivateAndStart={autoActivateAndStart}
          navigationDialogOpen={navigationDialogOpen}
          navigationSaving={navigationSaving}
          navigationError={navigationError}
          onRequestProfileChange={onRequestProfileChange}
          onSetMode={onSetMode}
          onCreateProfile={createProfile}
          onStartOverlay={startOverlay}
          onStopOverlay={stopOverlay}
          onOpenProfile={openProfile}
          onSetActiveProfile={setActiveProfile}
          onOpenActiveOverlay={openActiveOverlay}
          onSaveRecommended={saveRecommended}
          onDismissSuccess={() => {
            setLastSuccessId(null);
            setMode('editor');
            onAutoStartHandled?.();
          }}
          onNavigationSave={onNavigationSave}
          onNavigationDiscard={onNavigationDiscard}
          onNavigationCancel={onNavigationCancel}
        />
        {activeOverlayRunning ? (
          <span data-testid="studio-route-overlay-running" hidden>
            running
          </span>
        ) : null}
      </ConnectedStudioProvider>
      {profileDialogs}
    </>
  );
});
