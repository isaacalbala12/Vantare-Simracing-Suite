import { LauncherCard } from "../components/LauncherCard";
import { V52SectionHeader } from "../components/V52SectionHeader";

export function LauncherPage() {
  return (
    <div className="flex flex-col gap-5">
      <div className="opacity-0 animate-fade-in-up">
        <V52SectionHeader
          title="Launcher"
          description="Configura el lanzamiento de Le Mans Ultimate y prepara el terreno para perfiles con apps asociadas."
        />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="lg:col-span-1 flex flex-col gap-4 opacity-0 animate-fade-in-up delay-100">
          <LauncherCard />
        </section>
        <section className="lg:col-span-2 space-y-3 opacity-0 animate-fade-in-up delay-150">
          <div className="flex items-center justify-between">
            <span className="v52-eyebrow">Perfiles de lanzamiento</span>
            <div className="flex items-center gap-3">
              <p className="text-[10px] font-mono text-vantare-textDim uppercase tracking-[.18em]">
                LMU disponible · Apps asociadas pendientes de spec multi-sim
              </p>
              <button
                type="button"
                disabled
                className="px-3 py-1.5 rounded-lg border border-dashed border-white/10 text-[10px] font-bold uppercase tracking-[.22em] text-vantare-textDim cursor-not-allowed"
              >
                + Crear perfil personalizado
              </button>
            </div>
          </div>
          <article className="card-sleek rounded-xl p-5 group hover:border-accent/40 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display font-bold text-lg text-white">
                  Perfiles de lanzamiento avanzados
                </h2>
                <p className="text-xs text-vantare-textMuted mt-1">
                  En este corte puedes configurar y abrir LMU. Las cadenas LMU + OBS + apps asociadas quedan preparadas para una iteración posterior.
                </p>
              </div>
              <button
                type="button"
                disabled
                className="px-3 py-1.5 rounded-lg border border-dashed border-white/10 text-[10px] font-bold uppercase tracking-[.22em] text-vantare-textDim cursor-not-allowed"
              >
                Próximamente
              </button>
            </div>
          </article>
          <article className="card-sleek rounded-xl p-5 group hover:border-accent/40 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display font-bold text-lg text-white">
                  Apps asociadas
                </h2>
                <p className="text-xs text-vantare-textMuted mt-1">
                  Cuando exista discovery y configuración real, aquí aparecerán las apps asociadas al simulador. No mostramos detecciones inventadas.
                </p>
              </div>
              <button
                type="button"
                disabled
                className="px-3 py-1.5 rounded-lg border border-dashed border-white/10 text-[10px] font-bold uppercase tracking-[.22em] text-vantare-textDim cursor-not-allowed"
              >
                Próximamente
              </button>
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}
