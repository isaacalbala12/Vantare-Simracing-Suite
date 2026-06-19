import { useState } from "react";
import { Events } from "@wailsio/runtime";
import { StudioHome } from "../overlays/StudioHome";
import { WidgetStudio } from "../overlays/WidgetStudio";
import { LayoutStudio } from "../overlays/LayoutStudio";
import { OwnProfilesView } from "../overlays/OwnProfilesView";
import { RecommendedProfilesView } from "../overlays/RecommendedProfilesView";
import { CommunityComingSoonView } from "../overlays/CommunityComingSoonView";
import { useOverlayStudioState } from "../overlays/useOverlayStudioState";
import { RECOMMENDED_PROFILES, cloneRecommendedProfile, type RecommendedProfile } from "../overlays/recommended-profiles";
import type { ProfileEntry } from "../state/overlay-workbench";

type StudioMode = "home" | "widgets" | "ownProfiles" | "recommended" | "community" | "layout";

export function OverlaysStudioPage() {
  const studio = useOverlayStudioState();
  const [mode, setMode] = useState<StudioMode>("home");
  const [notice, setNotice] = useState<string | null>(null);
  const [layoutTarget, setLayoutTarget] = useState<string | null>(null);

  function goHome() {
    setNotice(null);
    setLayoutTarget(null);
    setMode("home");
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
    const name = window.prompt("Nombre del perfil propio", profile.name);
    if (!name?.trim()) return;
    Events.Emit("hub:save-own-copy", { profile: cloneRecommendedProfile(profile, name.trim()) });
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

    return (
      <LayoutStudio
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

  if (mode === "ownProfiles") {
    return (
      <OwnProfilesView
        profiles={studio.profiles}
        onOpenProfile={openProfile}
        onCreateProfile={createProfile}
        onBack={goHome}
      />
    );
  }

  if (mode === "recommended") {
    return (
      <RecommendedProfilesView
        profiles={RECOMMENDED_PROFILES}
        onSaveRecommended={saveRecommended}
        onBack={goHome}
      />
    );
  }

  if (mode === "community") {
    return <CommunityComingSoonView onBack={goHome} />;
  }

  return (
    <>
      {(notice || studio.lastError) && (
        <div className="mx-auto mt-4 max-w-[1800px] px-6">
          <div className="rounded-lg border border-vantare-red-500/30 bg-vantare-red-950/20 px-4 py-3 text-sm text-vantare-red-300">
            {notice || studio.lastError}
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
