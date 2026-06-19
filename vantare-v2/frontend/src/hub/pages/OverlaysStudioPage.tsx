import { useState } from "react";
import { Events } from "@wailsio/runtime";
import { StudioHome } from "../overlays/StudioHome";
import { WidgetStudio } from "../overlays/WidgetStudio";
import { LayoutStudio } from "../overlays/LayoutStudio";
import { useOverlayStudioState } from "../overlays/useOverlayStudioState";
import { cloneRecommendedProfile, type RecommendedProfile } from "../overlays/recommended-profiles";
import type { ProfileEntry } from "../state/overlay-workbench";

type StudioMode = "home" | "widgets" | "layout";

export function OverlaysStudioPage() {
  const studio = useOverlayStudioState();
  const [mode, setMode] = useState<StudioMode>("home");
  const [notice, setNotice] = useState<string | null>(null);

  function createProfile() {
    const name = window.prompt("Nombre del nuevo perfil");
    if (!name?.trim()) return;
    Events.Emit("hub:create", { name: name.trim() });
  }

  function openWidgetStudio() {
    setNotice(null);
    setMode("widgets");
  }

  function openProfile(_profile: ProfileEntry) {
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
            onClick={() => setMode("home")}
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
        onBack={() => setMode("home")}
      />
    );
  }

  if (mode === "layout") {
    if (!studio.profile) {
      return (
        <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-[1200px] flex-col px-6 py-8">
          <button
            type="button"
            className="mb-4 w-fit text-xs font-bold uppercase tracking-wider text-vantare-textMuted hover:text-white cursor-pointer"
            onClick={() => setMode("home")}
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
        onBack={() => setMode("home")}
      />
    );
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
        profiles={studio.profiles}
        onOpenWidgetStudio={openWidgetStudio}
        onOpenProfile={openProfile}
        onCreateProfile={createProfile}
        onSaveRecommended={saveRecommended}
      />
    </>
  );
}
