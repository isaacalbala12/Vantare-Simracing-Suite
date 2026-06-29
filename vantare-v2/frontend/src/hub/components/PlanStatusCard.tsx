type PlanStatusCardProps = {
  onNavigate: (section: string) => void;
};

export function PlanStatusCard({ onNavigate }: PlanStatusCardProps) {
  return (
    <section className="glass-panel rounded-xl p-6 border border-white/5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-semibold text-lg text-white">
            Plan Free
          </h2>
          <p className="text-xs text-vantare-textMuted mt-1">
            Acceso básico activo. Overlays recomendados, editor y OBS local disponibles.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate("setup")}
          className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-vantare-red-700 to-vantare-burgundy hover:from-vantare-red-600 hover:to-vantare-burgundy transition-all"
        >
          Gestionar cuenta
        </button>
      </div>
    </section>
  );
}
