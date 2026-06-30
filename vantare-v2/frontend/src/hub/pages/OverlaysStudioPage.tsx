import { useEffect, useRef, useState } from "react";
import { Events } from "@wailsio/runtime";
import { StudioHome } from "../overlays/StudioHome";
import { WidgetStudio } from "../overlays/WidgetStudio";
import { LayoutStudio } from "../overlays/LayoutStudio";
import { OwnProfilesView } from "../overlays/OwnProfilesView";
import { RecommendedProfilesView } from "../overlays/RecommendedProfilesView";
import { CommunityComingSoonView } from "../overlays/CommunityComingSoonView";
import { RecommendedSuccessBanner } from "../overlays/RecommendedSuccessBanner";
import { useOverlayStudioState } from "../overlays/useOverlayStudioState";
import { RECOMMENDED_PROFILES, cloneRecommendedProfile, type RecommendedProfile } from "../overlays/recommended-profiles";
import { runRecommendedFirstUse } from "../overlays/recommended-first-use";
import { isRunningProfile, profileTarget, type OverlayStatus, type ProfileEntry } from "../state/overlay-workbench";
import type { AppSettings } from "./SettingsPage";

type StudioMode = "home" | "widgets" | "ownProfiles" | "recommended" | "community" | "layout";

type OverlaysStudioPageProps = {
  pendingRecommendedAutoStart?: "recommended-auto" | null;
  onAutoStartHandled?: () => void;
};

type ProfilesListPayload = {
  profiles?: Array<{ id: string; file: string }>;
};

function resolveFileById(id: string, timeoutMs = 3000): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsub?.();
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    const unsub = Events.On("hub:profiles", (event: { data?: ProfilesListPayload }) => {
      const match = event.data?.profiles?.find((p) => p.id === id);
      if (match) {
        finish(match.file);
      }
    });
    Events.Emit("hub:list");
  });
}

export function OverlaysStudioPage({
  pendingRecommendedAutoStart = null,
  onAutoStartHandled,
}: OverlaysStudioPageProps) {
  const [mode, setMode] = useState<StudioMode>("home");
  const studio = useOverlayStudioState({ autosave: false });
  const [notice, setNotice] = useState<string | null>(null);
  const [layoutTarget, setLayoutTarget] = useState<string | null>(null);
  const [overlayStatus, setOverlayStatus] = useState<OverlayStatus | null>(null);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [autoActivateAndStart, setAutoActivateAndStart] = useState(pendingRecommendedAutoStart === "recommended-auto");
  const [lastSuccessId, setLastSuccessId] = useState<string | null>(null);
  const activeProfileIdRef = useRef<string | null>(null);

  function updateActiveProfileId(id: string | null) {
    activeProfileIdRef.current = id;
    setActiveProfileId(id);
  }

  useEffect(() => {
    const unsubOverlayStatus = Events.On("overlay:status", (event: { data: unknown }) => {
      setOverlayStatus(event.data as OverlayStatus);
    });

    const unsubSettings = Events.On("settings", (event: { data: AppSettings }) => {
      if (event.data?.activeOverlayProfileId) {
        updateActiveProfileId(event.data.activeOverlayProfileId);
      }
    });

    const unsubProfileActivated = Events.On("hub:profile-activated", (event: { data?: { activeProfileId?: string } }) => {
      if (event.data?.activeProfileId) {
        updateActiveProfileId(event.data.activeProfileId);
      }
    });

    // Fallback: if no activeOverlayProfileId in settings yet, use profile:loaded
    const unsubProfile = Events.On(
      "profile:loaded",
      (event: { data: { profile?: { id: string } } }) => {
        if (event.data?.profile?.id && activeProfileIdRef.current === null) {
          updateActiveProfileId(event.data.profile.id);
        }
      },
    );

    Events.Emit("settings:get");

    return () => {
      unsubOverlayStatus();
      unsubSettings();
      unsubProfileActivated();
      unsubProfile();
    };
  }, []);

  useEffect(() => {
    if (pendingRecommendedAutoStart === "recommended-auto") {
      setMode("recommended");
      setAutoActivateAndStart(true);
    }
  }, [pendingRecommendedAutoStart]);

  function goHome() {
    setNotice(null);
    setLayoutTarget(null);
    setMode("home");
    if (autoActivateAndStart) {
      setAutoActivateAndStart(false);
      onAutoStartHandled?.();
    }
  }

  function createProfile() {
    const name = window.prompt("Nombre del nuevo perfil");
    if (!name?.trim()) return;
    Events.Emit("hub:create", { name: name.trim() });
  }

  function openWidgetStudio() {
    setNotice(null);
    setLayoutTarget(null);
    setMode("widgets");
  }

  function openProfile(_profile: ProfileEntry) {
    setLayoutTarget(_profile.id);
    Events.Emit("hub:activate", { file: _profile.file });
    setNotice(null);
    setMode("layout");
  }

  function saveRecommended(profile: RecommendedProfile) {
    const defaultName = `${profile.name} (copia)`;
    const name = window.prompt("Nombre del perfil propio", defaultName);
    if (!name?.trim()) return;

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

    Events.Emit("hub:save-own-copy", { profile: cloneRecommendedProfile(profile, name.trim()) });
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

  if (mode === "widgets") {
    if (!studio.profile) {
      return (
        <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-[1200px] flex-col px-6 py-8">
          <button
            type="button"
            className="mb-4 w-fit text-xs font-bold uppercase tracking-wider text-vantare-textMuted hover:text-white cursor-pointer"
            onClick={goHome}
          >
            ← Volver a Overlays Studio
          </button>
          <div className="glass-panel rounded-xl p-8 text-sm text-vantare-textMuted">
            Selecciona o crea un perfil para editar widgets.
          </div>
        </div>
      );
    }

    return (
      <WidgetStudio
        profile={studio.profile}
        selectedWidgetId={studio.selectedWidgetId}
        dirty={studio.dirty}
        saveState={studio.saveState}
        onSelectWidget={studio.setSelectedWidgetId}
        onChangeProfile={studio.updateDraft}
        onSave={studio.saveProfile}
        onBack={goHome}
      />
    );
  }

  if (mode === "layout") {
    if (!studio.profile || studio.profile.id !== layoutTarget) {
      return (
        <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-[1200px] flex-col px-6 py-8">
          <button
            type="button"
            className="mb-4 w-fit text-xs font-bold uppercase tracking-wider text-vantare-textMuted hover:text-white cursor-pointer"
            onClick={goHome}
          >
            ← Volver a Overlays Studio
          </button>
          <div className="glass-panel rounded-xl p-8 text-sm text-vantare-textMuted">
            Cargando perfil...
          </div>
        </div>
      );
    }

    const activeEntry = studio.profiles.find((entry) => entry.id === studio.profile?.id) ?? null;
    const activeOverlayRunning = activeEntry ? isRunningProfile(activeEntry, overlayStatus) : Boolean(overlayStatus?.running);
    const isActiveProfile = activeProfileId !== null && studio.profile?.id === activeProfileId;

    return (
      <LayoutStudio
        profile={studio.profile}
        selectedWidgetId={studio.selectedWidgetId}
        dirty={studio.dirty}
        saveState={studio.saveState}
        overlayRunning={activeOverlayRunning}
        isActiveProfile={isActiveProfile}
        onStartOverlay={() => {
          if (activeEntry) startOverlay(activeEntry);
        }}
        onStopOverlay={stopOverlay}
        onSelectWidget={studio.setSelectedWidgetId}
        onChangeProfile={studio.updateDraft}
        onAddWidget={studio.addWidget}
        onSave={studio.saveProfile}
        onBack={goHome}
      />
    );
  }

  if (mode === "ownProfiles") {
    return (
      <OwnProfilesView
        profiles={studio.profiles}
        overlayStatus={overlayStatus}
        activeProfileId={activeProfileId}
        onStartOverlay={startOverlay}
        onStopOverlay={stopOverlay}
        onOpenProfile={openProfile}
        onCreateProfile={createProfile}
        onSetActiveProfile={setActiveProfile}
        onOpenActiveOverlay={openActiveOverlay}
        onBack={goHome}
      />
    );
  }

  if (mode === "recommended") {
    return (
      <div>
        {lastSuccessId && (
          <div className="mx-auto mt-4 max-w-[1800px] px-6">
            <RecommendedSuccessBanner
              profileId={lastSuccessId}
              onGoToDashboard={() => {
                setLastSuccessId(null);
                goHome();
                onAutoStartHandled?.();
              }}
            />
          </div>
        )}
        {notice && (
          <div className="mx-auto mt-4 max-w-[1800px] px-6">
            <div
              data-testid="recommended-error-banner"
              className="rounded-lg border border-vantare-red-500/30 bg-vantare-red-950/20 px-4 py-3 text-sm text-vantare-red-300"
            >
              {notice}
            </div>
          </div>
        )}
        <RecommendedProfilesView
          profiles={RECOMMENDED_PROFILES}
          onSaveRecommended={saveRecommended}
          onBack={goHome}
          autoActivateAndStart={autoActivateAndStart}
        />
      </div>
    );
  }

  if (mode === "community") {
    return <CommunityComingSoonView onBack={goHome} />;
  }

  return (
    <>
      {(notice && !lastSuccessId) && (
        <div className="mx-auto mt-4 max-w-[1800px] px-6">
          <div className="rounded-lg border border-vantare-red-500/30 bg-vantare-red-950/20 px-4 py-3 text-sm text-vantare-red-300">
            {notice}
          </div>
        </div>
      )}

      <StudioHome
        profileCount={studio.profiles.length}
        recommendedCount={RECOMMENDED_PROFILES.length}
        onOpenWidgetStudio={openWidgetStudio}
        onOpenOwnProfiles={() => setMode("ownProfiles")}
        onOpenRecommended={() => setMode("recommended")}
        onOpenCommunity={() => setMode("community")}
      />
    </>
  );
}
