import { V52InfoCard } from "../components/V52InfoCard";

export function TelemetryPage() {
  return (
    <div className="flex flex-col gap-5">
      <header className="opacity-0 animate-fade-in-up">
        <h1 className="font-sans font-bold text-3xl text-white tracking-tight">
          Telemetría
        </h1>
        <p className="text-sm text-vantare-textMuted mt-2 leading-relaxed max-w-3xl">
          Herramientas de lectura y análisis de datos del simulador. Esta sección
          no muestra datos inventados: esperará a que exista fuente real.
        </p>
      </header>

      <section className="relative rounded-2xl overflow-hidden border border-white/5 opacity-0 animate-fade-in-up delay-100 flex flex-col items-center justify-center text-center min-h-[calc(100vh-180px)]">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0a] via-[#141414] to-[#0a0a0a]"></div>
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[480px] h-[480px] bg-white/[.03] blur-3xl rounded-full pointer-events-none"></div>

        <div className="relative z-10 px-6 py-16">
          <span className="v52-eyebrow">Telemetría</span>

          <div className="mt-6 mb-6 inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10">
            <svg className="w-10 h-10 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.25} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
          </div>

          <h1 className="font-bold text-5xl text-white tracking-tight leading-none">
            Próximamente
          </h1>
          <p className="text-base text-white/55 mt-4 max-w-md mx-auto leading-relaxed">
            Aquí verás gráficas en tiempo real de velocidad, rpm, throttle, freno,
            g-force y tiempos por vuelta cuando el módulo esté conectado a datos reales.
          </p>

          <span className="inline-block mt-8 text-[10px] font-mono font-bold text-white/40 uppercase tracking-[.28em]">
            En desarrollo · Próxima integración: LMU live/session data
          </span>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 opacity-0 animate-fade-in-up delay-200">
        <V52InfoCard
          tone="blue"
          label="Fuente"
          title="LMU primero"
          body="La beta mantiene LMU como fuente principal antes de ampliar a otros simuladores."
        />
        <V52InfoCard
          tone="green"
          label="Datos"
          title="Sin datos inventados"
          body="Los paneles de telemetría solo se activarán cuando exista fuente real o fixture explícito."
        />
        <V52InfoCard
          tone="amber"
          label="Estado"
          title="Módulo pendiente"
          body="El diseño queda preparado; el cableado funcional se hará en una fase separada."
        />
      </div>
    </div>
  );
}
