import { profileLabel, type ProfileEntry } from "../state/overlay-workbench";
import { ProfilePreview } from "./ProfilePreview";

type OwnProfilesViewProps = {
  profiles: ProfileEntry[];
  onOpenProfile: (profile: ProfileEntry) => void;
  onCreateProfile: () => void;
  onBack: () => void;
};

export function OwnProfilesView({
  profiles,
  onOpenProfile,
  onCreateProfile,
  onBack,
}: OwnProfilesViewProps) {
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
        <button
          type="button"
          onClick={onCreateProfile}
          className="btn-primary rounded-lg px-5 py-2 text-xs font-bold text-white"
        >
          Nuevo perfil
        </button>
      </div>

      {profiles.length === 0 ? (
        <div className="glass-panel rounded-xl p-8 text-sm text-vantare-textMuted">
          No hay perfiles propios todavía. Crea uno o guarda un recomendado como propio.
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {profiles.map((profile) => {
            const label = profileLabel(profile);
            return (
              <article key={profile.file} className="card-sleek rounded-xl p-5">
                {profile.profile ? (
                  <ProfilePreview profile={profile.profile} />
                ) : (
                  <div className="flex aspect-video items-center justify-center rounded-lg border border-white/10 bg-black/25 text-xs text-vantare-textMuted">
                    Preview no disponible
                  </div>
                )}
                <div className="mt-4">
                  <h2 className="font-display text-xl font-semibold text-white">{label}</h2>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-vantare-textDim">
                    {profile.displayMode} · {profile.widgets} widgets
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Editar ${label}`}
                  onClick={() => onOpenProfile(profile)}
                  className="btn-primary mt-4 w-full rounded-lg px-4 py-2 text-xs font-bold text-white"
                >
                  Editar layout
                </button>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
