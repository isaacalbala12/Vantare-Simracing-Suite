import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Events } from "@wailsio/runtime";
import { useI18n } from "../../i18n/I18nProvider";
import { createTelemetryRateCoordinator } from "../../overlay/core/telemetry-rate-coordinator";
import { createWailsTelemetryAdapter, type TelemetryAdapter } from "../../overlay/transports/wails-telemetry-adapter";
import { OwnProfilesView } from "../overlays/OwnProfilesView";
import { RecommendedProfilesView } from "../overlays/RecommendedProfilesView";
import { CommunityComingSoonView } from "../overlays/CommunityComingSoonView";
import { ObsOverlaySetupView } from "../overlays/ObsOverlaySetupView";
import { RecommendedSuccessBanner } from "../overlays/RecommendedSuccessBanner";
import { RECOMMENDED_PROFILES, cloneRecommendedProfile, type RecommendedProfile } from "../overlays/recommended-profiles";
import { runRecommendedFirstUse } from "../overlays/recommended-first-use";
import {
  isRunningProfile,
  profileTarget,
  type OverlayStatus,
  type ProfileEntry,
} from "../state/overlay-workbench";
import type { AppSettings } from "../pages/SettingsPage";
import { DirtyChangesDialog } from "./components/DirtyChangesDialog";
import { ProfileNameDialog } from "./components/ProfileNameDialog";
import { NoActiveProfileState } from "./NoActiveProfileState";
import { OverlayStudioV3 } from "./OverlayStudioV3";

import {
  createStudioProfileClient,
  createWailsStudioEventTransport,
  type StudioProfileClient,
} from "./state/studio-profile-client";
import { ConnectedStudioProvider, useStudioDocument } from "./state/studio-store";
import type { StudioProfileEntry } from "./components/StudioHeader";

type StudioRouteMode = "editor" | "ownProfiles" | "recommended" | "community" | "obs";

type ProfilesListPayload = {
  profiles?: ProfileEntry[];
};

type RouteNavigationTarget = StudioRouteMode | string;

export type StudioRouteProps = {
  client?: StudioProfileClient;
  telemetryAdapter?: TelemetryAdapter | null;
  coordinator?: ReturnType<typeof createTelemetryRateCoordinator>;
  liveAvailable?: boolean;
  pendingRecommendedAutoStart?: "recommended-auto" | null;
  onAutoStartHandled?: () => void;
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
    const unsub = Events.On("hub:profiles", (event: { data?: ProfilesListPayload }) => {
      const match = event.data?.profiles?.find((profile) => profile.id === id);
      if (match) {
        finish(match.file);
      }
    });
    Events.Emit("hub:list");
  });
}

function resolveActiveFile(activeProfileId: string | null, profiles: ProfileEntry[]): string | null {
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
    profiles.find((profile) => (profile.name?.trim() || profile.id).toLowerCase() === normalized) ?? null
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
  onOpenManagement(mode: Exclude<StudioRouteMode, "editor">): void;
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
    onOpenManagement,
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
          {t("studio.v3.route.loadingProfile")}
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

  if (mode === "ownProfiles") {
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
        <OwnProfilesView
          profiles={profileEntries}
          overlayStatus={overlayStatus}
          activeProfileId={activeProfileId}
          onStartOverlay={onStartOverlay}
          onStopOverlay={onStopOverlay}
          onOpenProfile={onOpenProfile}
          onCreateProfile={onCreateProfile}
          onSetActiveProfile={onSetActiveProfile}
          onOpenActiveOverlay={onOpenActiveOverlay}
          onBack={() => onSetMode("editor")}
        />
      </>
    );
  }

  if (mode === "recommended") {
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
        <div>
          {lastSuccessId ? (
            <div className="mx-auto mt-4 max-w-[1800px] px-6">
              <RecommendedSuccessBanner profileId={lastSuccessId} onGoToDashboard={onDismissSuccess} />
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
            onBack={() => onSetMode("editor")}
            autoActivateAndStart={autoActivateAndStart}
          />
        </div>
      </>
    );
  }

  if (mode === "community") {
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
        <CommunityComingSoonView onBack={() => onSetMode("editor")} />
      </>
    );
  }

  if (mode === "obs") {
    const obsProfileRef = activeProfileId ?? editorFile;
    const obsUrl = `${window.location.origin}/overlay?profile=${encodeURIComponent(obsProfileRef)}`;
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
        <ObsOverlaySetupView url={obsUrl} onBack={() => onSetMode("editor")} />
      </>
    );
  }

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
      <OverlayStudioV3
        profiles={profiles}
        activeFile={editorFile}
        coordinator={coordinator}
        telemetryAdapter={telemetryAdapter}
        liveAvailable={liveAvailable}
        onRequestProfileChange={onRequestProfileChange}
        onOpenManageProfiles={() => onOpenManagement("ownProfiles")}
        onOpenRecommended={() => onOpenManagement("recommended")}
        onOpenCommunity={() => onOpenManagement("community")}
        onOpenObs={() => onOpenManagement("obs")}
      />
    </>
  );
}

type StudioRouteNavigationBridgeProps = {
  onDirtyChange(dirty: boolean): void;
  onBindActions(actions: {
    save(): ReturnType<ReturnType<typeof useStudioDocument>["save"]>;
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

export function StudioRoute(props: StudioRouteProps): React.ReactElement {
  const {
    client: clientProp,
    telemetryAdapter: telemetryAdapterProp = null,
    coordinator: coordinatorProp,
    liveAvailable: liveAvailableProp,
    pendingRecommendedAutoStart = null,
    onAutoStartHandled,
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
  const telemetryAdapter = useMemo(() => {
    if (telemetryAdapterProp !== null) {
      return telemetryAdapterProp;
    }
    return createWailsTelemetryAdapter({
      coordinator,
      subscribe: (event, handler) => {
        const unsub = Events.On(event, (evt: { data: unknown }) => handler(evt.data));
        return () => unsub?.();
      },
    });
  }, [coordinator, telemetryAdapterProp]);

  const [profiles, setProfiles] = useState<ProfileEntry[]>([]);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [editorFile, setEditorFile] = useState<string | null>(null);
  const [mode, setMode] = useState<StudioRouteMode>("editor");
  const [overlayStatus, setOverlayStatus] = useState<OverlayStatus | null>(null);
  const [liveAvailable, setLiveAvailable] = useState(liveAvailableProp ?? false);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastSuccessId, setLastSuccessId] = useState<string | null>(null);
  const [navigationDialogOpen, setNavigationDialogOpen] = useState(false);
  const [navigationSaving, setNavigationSaving] = useState(false);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createDialogSaving, setCreateDialogSaving] = useState(false);
  const [createDialogError, setCreateDialogError] = useState<string | null>(null);
  const [recommendedCopyTarget, setRecommendedCopyTarget] = useState<RecommendedProfile | null>(null);

  const dirtyRef = useRef(false);
  const pendingCreateNameRef = useRef<string | null>(null);
  const studioActionsRef = useRef<{
    save(): ReturnType<ReturnType<typeof useStudioDocument>["save"]>;
    discardAll(): void;
  } | null>(null);
  const navigationResolverRef = useRef<((decision: "save" | "discard" | "cancel") => void) | null>(null);

  const isAutoStart = pendingRecommendedAutoStart === "recommended-auto";
  const effectiveMode: StudioRouteMode = isAutoStart && mode === "editor" ? "recommended" : mode;
  const autoActivateAndStart = isAutoStart;
  const studioProfiles = useMemo(() => toStudioProfiles(profiles), [profiles]);

  useEffect(() => {
    if (liveAvailableProp !== undefined) {
      setLiveAvailable(liveAvailableProp);
      return;
    }
    const unsub = Events.On("telemetry:source-status", (event: { data: { live?: boolean; available?: boolean } }) => {
      setLiveAvailable(Boolean(event.data?.live && event.data?.available));
    });
    Events.Emit("telemetry:source-status:get");
    return () => unsub?.();
  }, [liveAvailableProp]);

  useEffect(() => {
    const unsubProfiles = Events.On("hub:profiles", (event: { data: unknown }) => {
      const data = getPayload<ProfilesListPayload>(event);
      setProfiles(data?.profiles ?? []);
      setProfilesLoaded(true);
    });
    const unsubCreated = Events.On("hub:profile-created", () => {
      Events.Emit("hub:list");
    });
    const unsubOverlayStatus = Events.On("overlay:status", (event: { data: unknown }) => {
      setOverlayStatus(event.data as OverlayStatus);
    });
    const unsubSettings = Events.On("settings", (event: { data: AppSettings }) => {
      if (event.data?.activeOverlayProfileId) {
        setActiveProfileId(event.data.activeOverlayProfileId);
      }
    });
    const unsubActivated = Events.On("hub:profile-activated", (event: { data: unknown }) => {
      const payload = getPayload<{ activeProfileId?: string }>(event);
      if (payload?.activeProfileId) {
        setActiveProfileId(payload.activeProfileId);
      }
    });
    const unsubError = Events.On("hub:error", (event: { data: unknown }) => {
      const payload = getPayload<{ message?: string }>(event);
      if (!pendingCreateNameRef.current) {
        return;
      }
      pendingCreateNameRef.current = null;
      setCreateDialogSaving(false);
      setCreateDialogError(payload?.message ?? t("studio.v3.profile.createFailed"));
    });

    Events.Emit("hub:list");
    Events.Emit("settings:get");

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
    Events.Emit("hub:set-active", { id: created.id, file: created.file });
    setActiveProfileId(created.id);
    setEditorFile(created.file);
    setMode("editor");
  }, [profiles, profilesLoaded]);

  useEffect(() => {
    return () => {
      telemetryAdapter?.stop();
      coordinator.dispose();
    };
  }, [coordinator, telemetryAdapter]);

  useEffect(() => {
    if (!profilesLoaded || !activeProfileId) {
      if (!activeProfileId) {
        setEditorFile(null);
      }
      return;
    }
    const resolved = resolveActiveFile(activeProfileId, profiles);
    if (!resolved) {
      setEditorFile(null);
      return;
    }
    setEditorFile((current) => current ?? resolved);
  }, [activeProfileId, profiles, profilesLoaded]);

  const continueNavigation = useCallback((target: RouteNavigationTarget) => {
    if (target.endsWith(".json")) {
      setEditorFile(target);
    } else {
      setMode(target as StudioRouteMode);
    }
    setNavigationDialogOpen(false);
    setNavigationSaving(false);
    setNavigationError(null);
  }, []);

  const guardedNavigate = useCallback(async (target: RouteNavigationTarget) => {
    const actions = studioActionsRef.current;
    if (!actions || !dirtyRef.current) {
      continueNavigation(target);
      return;
    }

    const decision = await new Promise<"save" | "discard" | "cancel">((resolve) => {
      navigationResolverRef.current = resolve;
      setNavigationDialogOpen(true);
      setNavigationError(null);
    });

    if (decision === "cancel") {
      setNavigationDialogOpen(false);
      setNavigationSaving(false);
      return;
    }
    if (decision === "discard") {
      actions.discardAll();
      continueNavigation(target);
      return;
    }

    setNavigationSaving(true);
    const saveResult = await actions.save();
    setNavigationSaving(false);
    if (saveResult.status === "saved") {
      continueNavigation(target);
      return;
    }
    setNavigationError(
      saveResult.status === "conflict" || saveResult.status === "error"
        ? saveResult.message
        : t("studio.v3.profile.saveFailed"),
    );
  }, [continueNavigation, t]);

  const onOpenManagement = useCallback((nextMode: Exclude<StudioRouteMode, "editor">) => {
    void guardedNavigate(nextMode);
  }, [guardedNavigate]);

  const onRequestProfileChange = useCallback((file: string) => {
    void guardedNavigate(file);
  }, [guardedNavigate]);

  const onSetMode = useCallback((nextMode: StudioRouteMode) => {
    void guardedNavigate(nextMode);
  }, [guardedNavigate]);

  const onNavigationSave = useCallback(() => {
    setNavigationSaving(true);
    setNavigationError(null);
    navigationResolverRef.current?.("save");
    navigationResolverRef.current = null;
  }, []);

  const onNavigationDiscard = useCallback(() => {
    navigationResolverRef.current?.("discard");
    navigationResolverRef.current = null;
  }, []);

  const onNavigationCancel = useCallback(() => {
    navigationResolverRef.current?.("cancel");
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
    Events.Emit("hub:create", { name });
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
    Events.Emit("hub:set-active", { id: profile.id, file: profile.file });
    setEditorFile(profile.file);
    setMode("editor");
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
        onError: (message) => {
          setNotice(message);
        },
      });
      return;
    }

    Events.Emit("hub:save-own-copy", { profile: cloneRecommendedProfile(profile, name) });
  }

  function startOverlay(profile: ProfileEntry) {
    Events.Emit("overlay:start", profileTarget(profile));
  }

  function stopOverlay() {
    Events.Emit("overlay:stop");
  }

  function setActiveProfile(profile: ProfileEntry) {
    Events.Emit("hub:set-active", { id: profile.id, file: profile.file });
  }

  function openActiveOverlay() {
    Events.Emit("overlay:start-active");
  }

  const profileDialogs = (
    <>
      <ProfileNameDialog
        open={createDialogOpen}
        title={t("studio.v3.profile.create.title")}
        description={t("studio.v3.profile.create.description")}
        confirmLabel={t("studio.v3.profile.create.confirm")}
        placeholder={t("studio.v3.profile.create.placeholder")}
        saving={createDialogSaving}
        errorMessage={createDialogError}
        dialogTestId="studio-create-profile-dialog"
        onClose={closeCreateDialog}
        onConfirm={confirmCreateProfile}
      />
      <ProfileNameDialog
        open={recommendedCopyTarget !== null}
        title={t("studio.v3.profile.saveRecommended.title")}
        description={t("studio.v3.profile.saveRecommended.description")}
        defaultName={recommendedCopyTarget ? `${recommendedCopyTarget.name} (copia)` : ""}
        confirmLabel={t("studio.v3.profile.saveRecommended.confirm")}
        placeholder={t("studio.v3.profile.saveRecommended.placeholder")}
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
            {t("studio.v3.route.loadingProfiles")}
          </div>
        </div>
        {profileDialogs}
      </>
    );
  }

  if (!activeProfileId || !editorFile) {
    if (effectiveMode === "recommended") {
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
                setMode("editor");
                onAutoStartHandled?.();
              }}
              autoActivateAndStart={autoActivateAndStart}
            />
          </div>
          {profileDialogs}
        </>
      );
    }
    if (mode === "ownProfiles") {
      return (
        <>
          <OwnProfilesView
            profiles={profiles}
            overlayStatus={overlayStatus}
            activeProfileId={activeProfileId}
            onStartOverlay={startOverlay}
            onStopOverlay={stopOverlay}
            onOpenProfile={openProfile}
            onCreateProfile={createProfile}
            onSetActiveProfile={setActiveProfile}
            onOpenActiveOverlay={openActiveOverlay}
            onBack={() => setMode("editor")}
          />
          {profileDialogs}
        </>
      );
    }
    if (mode === "recommended") {
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
              onBack={() => setMode("editor")}
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
          onSelectProfile={() => setMode("ownProfiles")}
          onOpenRecommended={() => setMode("recommended")}
        />
        {profileDialogs}
      </>
    );
  }

  const activeEntry = profiles.find((profile) => profile.id === activeProfileId) ?? null;
  const activeOverlayRunning = activeEntry ? isRunningProfile(activeEntry, overlayStatus) : Boolean(overlayStatus?.running);

  return (
    <>
    <ConnectedStudioProvider key={editorFile} client={client} initialFile={editorFile}>
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
        onOpenManagement={onOpenManagement}
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
          setMode("editor");
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
}
