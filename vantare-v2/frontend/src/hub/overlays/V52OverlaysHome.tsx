import { V52SectionHeader } from "../components/V52SectionHeader";

type V52OverlaysHomeProps = {
  profilesCount: number;
  onOpenWidgets: () => void;
  onOpenOwnProfiles: () => void;
  onOpenRecommended: () => void;
  onOpenCommunity: () => void;
};

function EntryCard({
  eyebrow,
  title,
  body,
  meta,
  button,
  onClick,
}: {
  eyebrow: string;
  title: string;
  body: string;
  meta: string;
  button: string;
  onClick: () => void;
}) {
  return (
    <article className="card-sleek rounded-xl p-5 flex flex-col gap-4">
      <div>
        <span className="v52-eyebrow">{eyebrow}</span>
        <h2 className="font-display font-bold text-xl text-white tracking-tight mt-3">
          {title}
        </h2>
        <p className="text-sm text-vantare-textMuted mt-2 leading-relaxed">
          {body}
        </p>
        <p className="text-[10px] font-mono font-bold text-vantare-textDim uppercase tracking-[.18em] mt-3">
          {meta}
        </p>
      </div>
      <button
        type="button"
        onClick={onClick}
        className="mt-auto rounded-lg bg-vantare-red-600 px-4 py-2 text-xs font-bold uppercase tracking-[.18em] text-white hover:bg-vantare-red-500 transition-colors"
      >
        {button}
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
}: V52OverlaysHomeProps) {
  return (
    <div className="flex flex-col gap-5">
      <V52SectionHeader
        title="Overlays Studio"
        description="Elige qué quieres editar. Widgets controla apariencia y comportamiento; Mis perfiles controla layouts y colocación."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EntryCard
          eyebrow="Editor de widgets"
          title="Widgets"
          body="Edita apariencia, comportamiento, visibilidad y estilo de los widgets disponibles."
          meta="Widgets disponibles · categorías estables y tester"
          button="Configurar widgets"
          onClick={onOpenWidgets}
        />
        <EntryCard
          eyebrow={`${profilesCount} perfiles propios`}
          title="Mis perfiles"
          body="Gestiona tus perfiles propios y entra en el editor de colocación con preview real de cada layout."
          meta="Editor de colocación y preview real"
          button="Ver mis perfiles"
          onClick={onOpenOwnProfiles}
        />
        <EntryCard
          eyebrow="Base recomendada"
          title="Recomendados por Vantare"
          body="Guarda una copia propia de un perfil recomendado y úsalo como punto de partida."
          meta="Perfiles oficiales incluidos"
          button="Ver recomendados"
          onClick={onOpenRecommended}
        />
        <EntryCard
          eyebrow="Futuro"
          title="Comunidad"
          body="Más adelante podrás descubrir overlays compartidos por la comunidad."
          meta="Sin marketplace en beta"
          button="Explorar comunidad"
          onClick={onOpenCommunity}
        />
      </div>
    </div>
  );
}
