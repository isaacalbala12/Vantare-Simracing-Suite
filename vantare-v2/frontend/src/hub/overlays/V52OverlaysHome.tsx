import { V52SectionHeader } from "../components/V52SectionHeader";
import { RECOMMENDED_PROFILES } from "./recommended-profiles";

type V52OverlaysHomeProps = {
  profilesCount: number;
  onOpenWidgets: () => void;
  onOpenOwnProfiles: () => void;
  onOpenRecommended: () => void;
  onOpenCommunity: () => void;
  onOpenObs: () => void;
};

function EntryCard({
  eyebrow,
  title,
  body,
  meta,
  button,
  onClick,
  disabled,
  pills,
}: {
  eyebrow: string;
  title: string;
  body: string;
  meta: string;
  button: string;
  onClick?: () => void;
  disabled?: boolean;
  pills?: string[];
}) {
  return (
    <article
      className={`card-sleek rounded-xl p-6 min-h-[260px] relative overflow-hidden flex flex-col justify-between group transition-all ${disabled ? "opacity-50 cursor-not-allowed pointer-events-none" : ""}`}
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-vantare-red-400/0 group-hover:bg-vantare-red-400/10 blur-2xl rounded-full transition-all pointer-events-none" />
      <div>
        <span className="v52-eyebrow">{eyebrow}</span>
        <h2 className="font-sans font-bold text-xl text-white tracking-tight mt-3">
          {title}
        </h2>
        <p className="text-sm text-vantare-textMuted mt-2 leading-relaxed">
          {body}
        </p>
        <p className="text-[10px] font-mono font-bold text-vantare-textDim uppercase tracking-[.18em] mt-3">
          {meta}
        </p>
        {pills && pills.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {pills.map((pill) => (
              <span
                key={pill}
                className="text-[10px] font-mono font-bold uppercase tracking-[.12em] px-2 py-0.5 rounded border border-vantare-border text-vantare-textDim"
              >
                {pill}
              </span>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onClick}
        className="mt-auto self-start border border-vantare-border group-hover:border-vantare-red-400 text-[11px] font-bold uppercase tracking-[.22em] px-4 py-2 rounded-lg text-white transition-all"
      >
        {button} →
      </button>
    </article>
  );
}

export function V52OverlaysHome({
  profilesCount,
  onOpenWidgets,
  onOpenOwnProfiles,
  onOpenRecommended,
  onOpenCommunity,
  onOpenObs,
}: V52OverlaysHomeProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="opacity-0 animate-fade-in-up">
        <V52SectionHeader
          title="Overlays Studio"
          description="Elige qué quieres editar. Widgets controla apariencia y comportamiento; Mis perfiles controla layouts y colocación."
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="opacity-0 animate-fade-in-up delay-100">
          <EntryCard
            eyebrow="Editor de widgets"
            title="Widgets"
            body="Edita apariencia, comportamiento, visibilidad y estilo de los widgets disponibles."
            meta="Widgets disponibles · configuración visual"
            button="Configurar widgets"
            onClick={onOpenWidgets}
          />
        </div>
        <div className="opacity-0 animate-fade-in-up delay-150">
          <EntryCard
            eyebrow={`${profilesCount} perfiles propios`}
            title="Mis perfiles"
            body="Gestiona tus perfiles propios y entra en el editor de colocación con preview real de cada layout."
            meta={`${profilesCount} perfiles propios`}
            button="Ver mis perfiles"
            onClick={onOpenOwnProfiles}
          />
        </div>
        <div className="opacity-0 animate-fade-in-up delay-200">
          <EntryCard
            eyebrow="Base recomendada"
            title="Recomendados por Vantare"
            body="Guarda una copia propia de un perfil recomendado y úsalo como punto de partida."
            meta="Perfiles recomendados incluidos"
            button="Ver recomendados"
            onClick={onOpenRecommended}
            pills={RECOMMENDED_PROFILES.slice(0, 2).map((p) => p.name)}
          />
        </div>
        <div className="opacity-0 animate-fade-in-up delay-300">
          <EntryCard
            eyebrow="Futuro"
            title="Comunidad"
            body="Más adelante podrás descubrir overlays compartidos por la comunidad."
            meta="No disponible en beta"
            button="Explorar comunidad"
            onClick={onOpenCommunity}
          />
        </div>
      </div>

      <div className="opacity-0 animate-fade-in-up delay-350">
        <EntryCard
          eyebrow="OBS Studio"
          title="OBS Browser Source"
          body="Copia la URL para capturar tu overlay en OBS."
          meta="Conexión con OBS Studio"
          button="Configurar OBS"
          onClick={onOpenObs}
        />
      </div>
    </div>
  );
}
