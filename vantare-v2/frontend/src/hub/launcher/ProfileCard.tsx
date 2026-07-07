import { useState } from "react";
import { Events } from "@wailsio/runtime";
import type {
  ChainProgress,
  LauncherAppEntry,
  LaunchProfile,
} from "./launcher-state";
import { AppBadge } from "../components/AppBadge";
import { ProfileEditor } from "./ProfileEditor";

type ProfileCardProps = {
  profile: LaunchProfile;
  apps: LauncherAppEntry[];
  progress?: ChainProgress | null;
  className?: string;
};

function appFor(apps: LauncherAppEntry[], id: string): LauncherAppEntry | undefined {
  return apps.find((a) => a.id === id);
}

export function ProfileCard({
  profile,
  apps,
  progress,
  className,
}: ProfileCardProps) {
  const [editing, setEditing] = useState(false);

  const launching = progress?.status === "starting" || progress?.status === "started";
  const error = progress?.status === "error";

  const handleLaunch = () =>
    Events.Emit("launcher:profile:launch", { id: profile.id });
  const handleCancel = () =>
    Events.Emit("launcher:profile:cancel", { id: profile.id });
  const handleDelete = () =>
    Events.Emit("launcher:profile:delete", { id: profile.id });
  const handleDuplicate = () =>
    Events.Emit("launcher:profile:save", {
      profile: { ...profile, id: `${profile.id}-copy`, name: `${profile.name} (copia)` },
    });
  const handleSave = (updated: LaunchProfile) =>
    Events.Emit("launcher:profile:save", { profile: updated });

  return (
    <article
      className={`card-sleek rounded-xl p-5 ${className ?? ""}`}
      data-testid={`profile-card-${profile.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-lg text-white">
            {profile.name}
          </h2>
          {profile.description && (
            <p className="text-xs text-vantare-textMuted mt-1">
              {profile.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!editing &&
            (launching ? (
              <button
                type="button"
                onClick={handleCancel}
                className="px-3 py-1.5 rounded-lg border border-amber-400/40 text-[10px] uppercase tracking-[.18em] text-amber-300 hover:bg-amber-400/10"
                data-testid={`profile-cancel-${profile.id}`}
              >
                Cancelar
              </button>
            ) : (
              <button
                type="button"
                onClick={handleLaunch}
                className="px-3 py-1.5 rounded-lg bg-accent text-[10px] uppercase tracking-[.18em] font-bold text-black hover:opacity-90"
                data-testid={`profile-launch-${profile.id}`}
              >
                Iniciar
              </button>
            ))}
        </div>
      </div>

      <ul className="mt-3 flex flex-col gap-1.5" data-testid="profile-steps">
        {profile.steps.length === 0 && (
          <li className="text-xs text-vantare-textDim">Sin pasos configurados.</li>
        )}
        {profile.steps.map((step, index) => {
          const app = appFor(apps, step.appId);
          return (
            <li
              key={`${step.appId}-${index}`}
              className="flex items-center gap-2 rounded-md bg-black/20 px-2 py-1.5"
              data-testid={`profile-step-row-${index}`}
            >
              {app ? (
                <AppBadge app={app} size="sm" />
              ) : (
                <span className="text-xs text-vantare-textDim">
                  App desconocida ({step.appId})
                </span>
              )}
              <span className="ml-auto text-[10px] uppercase tracking-[.18em] text-vantare-textDim">
                {step.delay}s
              </span>
            </li>
          );
        })}
      </ul>

      {error && (
        <p
          className="mt-2 text-xs text-vantare-red-400"
          data-testid={`profile-error-${profile.id}`}
        >
          {progress?.message ?? "Error al lanzar el perfil."}
        </p>
      )}
      {launching && (
        <p
          className="mt-2 text-xs text-amber-300"
          data-testid={`profile-launching-${profile.id}`}
        >
          Lanzando…
        </p>
      )}

      {editing ? (
        <ProfileEditor
          profile={profile}
          apps={apps}
          onSave={handleSave}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="mt-3 flex items-center gap-2 justify-end">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="px-3 py-1.5 rounded-lg border border-white/10 text-[10px] uppercase tracking-[.18em] text-vantare-textMuted hover:border-accent/40 hover:text-white transition-colors"
            data-testid={`profile-edit-${profile.id}`}
          >
            Editar
          </button>
          <button
            type="button"
            onClick={handleDuplicate}
            className="px-3 py-1.5 rounded-lg border border-white/10 text-[10px] uppercase tracking-[.18em] text-vantare-textMuted hover:border-accent/40 hover:text-white transition-colors"
            data-testid={`profile-duplicate-${profile.id}`}
          >
            Duplicar
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="px-3 py-1.5 rounded-lg border border-white/10 text-[10px] uppercase tracking-[.18em] text-vantare-textDim hover:border-vantare-red-400/50 hover:text-vantare-red-400 transition-colors"
            data-testid={`profile-delete-${profile.id}`}
          >
            Eliminar
          </button>
        </div>
      )}
    </article>
  );
}
