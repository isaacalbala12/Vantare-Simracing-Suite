import { RECOMMENDED_PROFILES, type RecommendedProfile } from "./recommended-profiles";
import { ProfileLibraryCard } from "./ProfileLibraryCard";
import { profileLabel, type ProfileEntry } from "../state/overlay-workbench";

type StudioHomeProps = {
  profiles: ProfileEntry[];
  onOpenWidgetStudio: () => void;
  onOpenProfile: (profile: ProfileEntry) => void;
  onCreateProfile: () => void;
  onSaveRecommended: (profile: RecommendedProfile) => void;
};

export function StudioHome({
  profiles,
  onOpenWidgetStudio,
  onOpenProfile,
  onCreateProfile,
  onSaveRecommended,
}: StudioHomeProps) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-[1800px] flex-col px-6 py-8">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-white">Overlays Studio</h1>
          <p className="mt-2 text-sm text-vantare-textMuted">
            Gestiona widgets, perfiles propios y presets recomendados desde un único lugar.
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

      <section className="mb-8">
        <h2 className="mb-4 font-display text-2xl font-semibold text-white">Mis perfiles</h2>
        <div className="grid gap-4 xl:grid-cols-2">
          <ProfileLibraryCard
            title="Widgets"
            description="Edita aspecto, comportamiento y visibilidad de los widgets disponibles."
            meta="Delta · Relative · Standings · Telemetry · Pedals"
            actionLabel="Abrir widgets"
            onAction={onOpenWidgetStudio}
          />

          <div className="card-sleek rounded-xl p-5">
            <div className="mb-4">
              <h3 className="font-display text-lg font-semibold text-white">Perfiles específicos</h3>
              <p className="mt-1 text-sm text-vantare-textMuted">
                Edita la colocación y tamaño de widgets por perfil.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {profiles.length === 0 && (
                <p className="rounded-lg border border-white/5 bg-black/20 px-3 py-3 text-sm text-vantare-textMuted">
                  No hay perfiles propios todavía.
                </p>
              )}

              {profiles.map((profile) => {
                const label = profileLabel(profile);
                return (
                  <button
                    key={profile.file}
                    type="button"
                    aria-label={`Editar ${label}`}
                    onClick={() => onOpenProfile(profile)}
                    className="flex items-center justify-between rounded-lg border border-white/5 bg-black/25 px-3 py-3 text-left transition-colors hover:border-vantare-red-500/40 hover:bg-white/5 cursor-pointer"
                  >
                    <span>
                      <span className="block text-sm font-semibold text-white">{label}</span>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-vantare-textDim">
                        {profile.displayMode} · {profile.widgets} widgets
                      </span>
                    </span>
                    <span className="text-xs font-bold text-vantare-red-400">Editar</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 font-display text-2xl font-semibold text-white">Recomendados por Vantare</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {RECOMMENDED_PROFILES.map((profile) => (
            <ProfileLibraryCard
              key={profile.id}
              title={profile.name}
              description={profile.description}
              meta={`${profile.tag} · preset fijo`}
              actionLabel="Guardar como propio"
              actionAriaLabel={`Guardar ${profile.name} como perfil propio`}
              onAction={() => onSaveRecommended(profile)}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-display text-2xl font-semibold text-white">Comunidad</h2>
        <div className="card-sleek rounded-xl p-6">
          <p className="font-display text-xl font-semibold text-white">Próximamente</p>
          <p className="mt-2 text-sm text-vantare-textMuted">
            Más adelante podrás descubrir overlays compartidos por la comunidad.
          </p>
        </div>
      </section>
    </div>
  );
}
