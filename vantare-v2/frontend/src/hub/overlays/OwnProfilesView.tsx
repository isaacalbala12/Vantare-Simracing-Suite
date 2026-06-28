import { isActiveProfile, isRunningProfile, profileLabel, type OverlayStatus, type ProfileEntry } from "../state/overlay-workbench";
import { ProfilePreview } from "./ProfilePreview";

type OwnProfilesViewProps = {
  profiles: ProfileEntry[];
  overlayStatus: OverlayStatus | null;
  activeProfileId: string | null;
  onStartOverlay: (profile: ProfileEntry) => void;
  onStopOverlay: () => void;
  onOpenProfile: (profile: ProfileEntry) => void;
  onCreateProfile: () => void;
  onSetActiveProfile: (profile: ProfileEntry) => void;
  onOpenActiveOverlay: () => void;
  onBack: () => void;
};

export function OwnProfilesView({
  profiles,
  overlayStatus,
  activeProfileId,
  onStartOverlay,
  onStopOverlay,
  onOpenProfile,
  onCreateProfile,
  onSetActiveProfile,
  onOpenActiveOverlay,
  onBack,
}: OwnProfilesViewProps) {
  const activeExists = activeProfileId !== null && profiles.some((p) => p.id === activeProfileId);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-[1800px] flex-col px-6 py-8">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="mb-3 text-xs font-bold uppercase tracking-wider text-vantare-textMuted hover:text-white cursor-pointer"
          >
            ← Volver a Overlays Studio
          </button>
          <h1 className="font-display text-3xl font-bold text-white">Mis perfiles</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-vantare-textMuted">
            Elige un perfil propio para editar la colocación, tamaño y layout de sus widgets.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {activeExists && (
            <button
              type="button"
              onClick={onOpenActiveOverlay}
              className="btn-primary rounded-lg px-5 py-2 text-xs font-bold text-white cursor-pointer"
            >
              Abrir overlay
            </button>
          )}
          <button
            type="button"
            onClick={onCreateProfile}
            className="btn-secondary rounded-lg px-5 py-2 text-xs font-bold text-white cursor-pointer"
          >
            Nuevo perfil
          </button>
        </div>
      </div>

      {profiles.length === 0 ? (
        <div className="glass-panel rounded-xl p-8 text-sm text-vantare-textMuted">
          No hay perfiles propios todavía. Crea uno o guarda un recomendado como propio.
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {profiles.map((profile) => {
            const label = profileLabel(profile);
            const running = isRunningProfile(profile, overlayStatus);
            const active = isActiveProfile(profile, activeProfileId);
            const previewProfile = Array.isArray(profile.profile?.widgets) ? profile.profile : null;
            return (
              <article key={profile.file} className="card-sleek rounded-xl p-5">
                {previewProfile ? (
                  <ProfilePreview profile={previewProfile} />
                ) : (
                  <div className="flex aspect-video items-center justify-center rounded-lg border border-white/10 bg-black/25 text-xs text-vantare-textMuted">
                    Preview no disponible
                  </div>
                )}
                <div className="mt-4 flex items-center gap-2">
                  <h2 className="font-display text-xl font-semibold text-white">{label}</h2>
                  {active && (
                    <span className="rounded-full bg-emerald-950/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300 border border-emerald-900/30">
                      Activo
                    </span>
                  )}
                </div>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-vantare-textDim">
                  {profile.displayMode} · {profile.widgets} widgets
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    aria-label={`Editar ${label}`}
                    onClick={() => onOpenProfile(profile)}
                    className="btn-secondary rounded-lg px-4 py-2 text-xs font-bold text-white cursor-pointer"
                  >
                    Editar layout
                  </button>
                  {active ? (
                    running ? (
                      <button
                        type="button"
                        aria-label={`Detener overlay de ${label}`}
                        onClick={onStopOverlay}
                        className="btn-secondary rounded-lg px-4 py-2 text-xs font-bold text-white cursor-pointer"
                      >
                        Detener overlay
                      </button>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Abrir overlay para ${label}`}
                        onClick={() => onStartOverlay(profile)}
                        className="btn-primary rounded-lg px-4 py-2 text-xs font-bold text-white cursor-pointer"
                      >
                        Abrir overlay
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      aria-label={`Activar ${label}`}
                      onClick={() => onSetActiveProfile(profile)}
                      className="btn-secondary rounded-lg px-4 py-2 text-xs font-bold text-vantare-textMuted hover:text-white cursor-pointer"
                    >
                      Activar
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
