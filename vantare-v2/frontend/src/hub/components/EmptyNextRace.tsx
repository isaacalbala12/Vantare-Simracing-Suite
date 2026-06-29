export function EmptyNextRace() {
  return (
    <section className="glass-panel rounded-xl p-6 border border-white/5">
      <h2 className="font-display font-semibold text-lg text-white mb-2">
        Próxima carrera
      </h2>
      <p className="text-sm text-vantare-textMuted">
        Calendario LMU no cargado todavía.
      </p>
      <button
        type="button"
        disabled
        title="Próximamente"
        className="mt-3 px-4 py-2 rounded-lg text-xs font-semibold text-vantare-textDim bg-vantare-surface border border-white/5 cursor-not-allowed"
      >
        Importar calendario LMU
      </button>
    </section>
  );
}
