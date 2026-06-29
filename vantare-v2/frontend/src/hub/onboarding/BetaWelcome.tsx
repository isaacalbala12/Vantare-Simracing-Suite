type BetaWelcomeProps = {
  onClose: () => void;
};

export function BetaWelcome({ onClose }: BetaWelcomeProps) {
  return (
    <div
      data-testid="beta-welcome"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div className="glass-panel rounded-2xl p-8 border border-white/10 max-w-lg w-full relative">
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-vantare-textMuted hover:text-white transition-colors"
        >
          ✕
        </button>

        <h1 className="font-display font-bold text-2xl text-white mb-2">
          Bienvenido a la beta de Vantare
        </h1>

        <div className="space-y-4 mt-6">
          <div className="rounded-lg bg-vantare-surface border border-white/5 p-4">
            <p className="text-sm font-semibold text-white">Plan Free activo</p>
            <p className="text-xs text-vantare-textMuted mt-1">
              Puedes probar overlays con datos mock/demo, el editor in-place, la galería de diseños y OBS local.
            </p>
          </div>

          <div className="rounded-lg bg-vantare-surface border border-white/5 p-4">
            <p className="text-sm font-semibold text-white">Próximamente</p>
            <p className="text-xs text-vantare-textMuted mt-1">
              Calendario LMU, launcher de simuladores, historial real de carreras y licencias de pago.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-8 w-full btn-primary py-3 rounded-lg font-semibold text-sm text-white shadow-lg shadow-vantare-red-900/20"
        >
          Empezar
        </button>
      </div>
    </div>
  );
}
