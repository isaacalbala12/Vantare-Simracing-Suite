import type { RecommendedProfile } from "./recommended-profiles";
import { ProfilePreview } from "./ProfilePreview";

type RecommendedProfilesViewProps = {
  profiles: RecommendedProfile[];
  onSaveRecommended: (profile: RecommendedProfile) => void;
  onBack: () => void;
};

export function RecommendedProfilesView({
  profiles,
  onSaveRecommended,
  onBack,
}: RecommendedProfilesViewProps) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-[1800px] flex-col px-6 py-8">
      <div className="mb-6">
        <button
          type="button"
          onClick={onBack}
          className="mb-3 text-xs font-bold uppercase tracking-wider text-vantare-textMuted hover:text-white cursor-pointer"
        >
          ← Volver a Overlays Studio
        </button>
        <h1 className="font-display text-3xl font-bold text-white">Recomendados por Vantare</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-vantare-textMuted">
          Presets oficiales listos para usar. Guárdalos como perfil propio para poder editarlos.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {profiles.map((profile) => (
          <article key={profile.id} className="card-sleek rounded-xl p-5">
            <ProfilePreview profile={profile.profile} />
            <div className="mt-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-vantare-red-300">
                {profile.tag} · preset oficial
              </p>
              <h2 className="mt-2 font-display text-xl font-semibold text-white">{profile.name}</h2>
              <p className="mt-2 text-sm leading-6 text-vantare-textMuted">{profile.description}</p>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-vantare-textDim">
                {profile.profile.widgets.length} widgets incluidos
              </p>
            </div>
            <button
              type="button"
              aria-label={`Guardar ${profile.name} como perfil propio`}
              onClick={() => onSaveRecommended(profile)}
              className="btn-primary mt-4 w-full rounded-lg px-4 py-2 text-xs font-bold text-white"
            >
              Guardar como perfil propio
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
