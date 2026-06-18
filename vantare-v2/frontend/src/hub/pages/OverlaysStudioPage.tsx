import { useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";
import { StudioHome } from "../overlays/StudioHome";
import type { RecommendedProfile } from "../overlays/recommended-profiles";
import type { ProfileEntry } from "../state/overlay-workbench";

export function OverlaysStudioPage() {
  const [profiles, setProfiles] = useState<ProfileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubProfiles = Events.On("hub:profiles", (event: { data: unknown }) => {
      const data = event.data as { profiles?: ProfileEntry[] };
      setProfiles(data.profiles ?? []);
      setLoading(false);
    });

    const unsubCreated = Events.On("hub:profile-created", () => {
      setError(null);
      Events.Emit("hub:list");
    });

    const unsubError = Events.On("hub:error", (event: { data: unknown }) => {
      const data = event.data as { message?: string };
      setError(data?.message ?? "Error del hub");
      setLoading(false);
    });

    Events.Emit("hub:list");

    return () => {
      unsubProfiles();
      unsubCreated();
      unsubError();
    };
  }, []);

  function createProfile() {
    const name = window.prompt("Nombre del nuevo perfil");
    if (!name?.trim()) return;
    Events.Emit("hub:create", { name: name.trim() });
  }

  function openWidgetStudio() {
    setError("El editor de widgets se implementará en el siguiente miniplan.");
  }

  function openProfile(_profile: ProfileEntry) {
    setError("El editor de perfiles específicos se implementará en el siguiente miniplan.");
  }

  function saveRecommended(_profile: RecommendedProfile) {
    setError("Guardar recomendados como perfil propio se implementará en un miniplan posterior.");
  }

  return (
    <>
      {error && (
        <div className="mx-auto mt-4 max-w-[1800px] px-6">
          <div className="rounded-lg border border-vantare-red-500/30 bg-vantare-red-950/20 px-4 py-3 text-sm text-vantare-red-300">
            {error}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center text-sm text-vantare-textMuted">
          Cargando Overlays Studio...
        </div>
      ) : (
        <StudioHome
          profiles={profiles}
          onOpenWidgetStudio={openWidgetStudio}
          onOpenProfile={openProfile}
          onCreateProfile={createProfile}
          onSaveRecommended={saveRecommended}
        />
      )}
    </>
  );
}
