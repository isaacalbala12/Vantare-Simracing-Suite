export function EmptyActivity() {
  return (
    <section className="glass-panel rounded-xl p-6 border border-white/5">
      <h2 className="font-display font-semibold text-lg text-white mb-2">
        Última actividad
      </h2>
      <p className="text-sm text-vantare-textMuted">
        Sin carreras registradas todavía.
      </p>
      <p className="text-xs text-vantare-textDim mt-2">
        Cuando LMU esté conectado o importes resultados, aquí aparecerá tu última sesión.
      </p>
    </section>
  );
}
