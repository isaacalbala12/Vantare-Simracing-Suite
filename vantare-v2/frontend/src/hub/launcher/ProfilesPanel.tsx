import { useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";
import {
  appSortOrder,
  newProfileId,
  type ChainProgress,
  type LauncherAppEntry,
  type LaunchProfile,
} from "./launcher-state";
import { ProfileCard } from "./ProfileCard";

type ProfilesPanelProps = {
  className?: string;
};

export function ProfilesPanel({ className }: ProfilesPanelProps) {
  const [apps, setApps] = useState<LauncherAppEntry[]>([]);
  const [profiles, setProfiles] = useState<LaunchProfile[]>([]);
  const [progressById, setProgressById] = useState<Record<string, ChainProgress>>(
    {},
  );
  const [chainError, setChainError] = useState<string | null>(null);


  useEffect(() => {
    Events.Emit("launcher:apps:discover");
    Events.Emit("launcher:profiles:list");

    const offApps = Events.On(
      "launcher:apps:detected",
      (event: { data?: { apps?: LauncherAppEntry[] } }) => {
        setApps((event.data?.apps ?? []).slice().sort(appSortOrder));
      },
    );
    const offAppsUpdated = Events.On(
      "launcher:apps:updated",
      (event: { data?: { apps?: LauncherAppEntry[] } }) => {
        setApps((event.data?.apps ?? []).slice().sort(appSortOrder));
      },
    );
    const offProfiles = Events.On(
      "launcher:profiles:updated",
      (event: { data?: { profiles?: LaunchProfile[] } }) => {
        setProfiles(event.data?.profiles ?? []);
      },
    );
    const offStep = Events.On(
      "launcher:chain:step",
      (event: { data?: ChainProgress }) => {
        const p = event.data;
        if (p) setProgressById((prev) => ({ ...prev, [p.profileId]: p }));
      },
    );
    const offDone = Events.On(
      "launcher:chain:done",
      (event: { data?: { profileId: string; success: boolean } }) => {
        const id = event.data?.profileId;
        if (id) {
          setProgressById((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        }
        setChainError(null);
      },
    );
    const offError = Events.On(
      "launcher:chain:error",
      (event: { data?: { profileId: string; message?: string } }) => {
        const id = event.data?.profileId;
        setChainError(event.data?.message ?? "Error en la cadena de lanzamiento.");
        if (id) {
          setProgressById((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        }
      },
    );

    return () => {
      offApps();
      offAppsUpdated();
      offProfiles();
      offStep();
      offDone();
      offError();
    };
  }, []);

  const handleCreate = () => {
    const id = newProfileId("profile");
    const blank: LaunchProfile = {
      id,
      name: "",
      description: "",
      steps: [],
    };
    Events.Emit("launcher:profile:save", { profile: blank });
  };

  return (
    <section
      className={`flex flex-col gap-3 ${className ?? ""}`}
      data-testid="profiles-panel"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="v52-eyebrow">Perfiles de lanzamiento</span>
        <button
          type="button"
          onClick={handleCreate}
          className="px-3 py-1.5 rounded-lg border border-dashed border-white/10 text-[10px] font-bold uppercase tracking-[.22em] text-vantare-textMuted hover:border-accent/40 hover:text-white transition-colors"
          data-testid="profiles-create"
        >
          + Crear perfil
        </button>
      </div>

      {chainError && (
        <p
          className="text-xs text-vantare-red-400 rounded-lg border border-vantare-red-400/30 bg-vantare-red-400/5 px-3 py-2"
          data-testid="profiles-chain-error"
        >
          {chainError}
        </p>
      )}

      <div className="flex flex-col gap-3" data-testid="profiles-list">
        {profiles.length === 0 && (
          <article
            className="card-sleek rounded-xl p-5"
            data-testid="profiles-empty"
          >
            <p className="text-xs text-vantare-textMuted">
              Aún no hay perfiles. Crea uno para agrupar apps en una cadena de
              lanzamiento.
            </p>
          </article>
        )}
        {profiles.map((profile) => (
          <ProfileCard
            key={profile.id}
            profile={profile}
            apps={apps}
            progress={progressById[profile.id] ?? null}
          />
        ))}
      </div>
    </section>
  );
}
