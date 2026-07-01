import { NextRaceCard } from "./NextRaceCard";

export function V52CalendarStrip() {
  return (
    <section className="glass-panel rounded-xl p-5" data-testid="v52-calendar-strip">
      <div className="flex items-center justify-between mb-4 gap-3">
        <span className="v52-eyebrow">Próximas carreras</span>
        <span className="text-[10px] font-bold text-vantare-textDim uppercase tracking-[.22em]">
          LMU · calendario importado
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl overflow-hidden border border-white/5 bg-[rgba(20,20,20,.6)]">
          <div className="v52-cal-bar" />
          <NextRaceCard />
        </div>
        <div className="rounded-xl bg-[rgba(20,20,20,.55)] border border-white/5 p-5">
          <p className="text-[10px] font-bold uppercase tracking-[.22em] text-vantare-red-400 mb-2">
            Importación
          </p>
          <p className="text-sm font-semibold text-white">Pega el calendario LMU</p>
          <p className="text-xs text-vantare-textMuted mt-2">
            El importador visual queda para el siguiente corte. Mientras tanto, el estado vacío es intencional.
          </p>
        </div>
        <div className="rounded-xl bg-[rgba(20,20,20,.55)] border border-white/5 p-5">
          <p className="text-[10px] font-bold uppercase tracking-[.22em] text-vantare-red-400 mb-2">
            Recordatorios
          </p>
          <p className="text-sm font-semibold text-white">Avisos antes de carrera</p>
          <p className="text-xs text-vantare-textMuted mt-2">
            El banner sobre el overlay se implementará cuando el bridge del calendario esté conectado.
          </p>
        </div>
      </div>
    </section>
  );
}
