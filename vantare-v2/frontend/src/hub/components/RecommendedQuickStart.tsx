type RecommendedQuickStartProps = {
  hasActiveProfile: boolean;
  onUseRecommended: () => void;
  onGoToObsSetup: (target: "setup") => void;
};

export function RecommendedQuickStart({
  hasActiveProfile,
  onUseRecommended,
  onGoToObsSetup,
}: RecommendedQuickStartProps) {
  if (hasActiveProfile) {
    return (
      <section
        data-testid="recommended-quickstart"
        className="glass-panel rounded-xl p-5 border border-white/5"
      >
        <p className="font-mono text-[10px] uppercase tracking-wider text-vantare-textDim">
          Overlay activo
        </p>
        <h3 className="mt-2 font-display text-base font-semibold text-white">
          ¿Quieres conectar OBS ahora?
        </h3>
        <p className="mt-1 text-xs text-vantare-textMuted">
          Copia la URL del Browser Source y configúrala en OBS.
        </p>
        <button
          type="button"
          data-testid="recommended-quickstart-obs-link"
          onClick={() => onGoToObsSetup("setup")}
          className="btn-secondary mt-3 w-full rounded-lg px-4 py-2 text-xs font-bold text-white cursor-pointer"
        >
          Configurar OBS
        </button>
      </section>
    );
  }

  return (
    <section
      data-testid="recommended-quickstart"
      className="glass-panel rounded-xl p-5 border border-white/5"
    >
      <p className="font-mono text-[10px] uppercase tracking-wider text-vantare-textDim">
        Sin overlay activo
      </p>
      <h3 className="mt-2 font-display text-base font-semibold text-white">
        Empieza con un recomendado
      </h3>
      <p className="mt-1 text-xs text-vantare-textMuted">
        Clean Overlay o Le Mans Ultimate Basic listos en un click.
      </p>
      <button
        type="button"
        data-testid="recommended-quickstart-cta"
        onClick={onUseRecommended}
        className="btn-primary mt-3 w-full rounded-lg px-4 py-2 text-xs font-bold text-white cursor-pointer"
      >
        Usar perfil recomendado
      </button>
    </section>
  );
}
