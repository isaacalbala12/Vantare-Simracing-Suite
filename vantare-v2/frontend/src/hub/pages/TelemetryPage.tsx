import { V52SectionHeader } from "../components/V52SectionHeader";
import { V52InfoCard } from "../components/V52InfoCard";

export function TelemetryPage() {
  return (
    <div className="flex flex-col gap-5">
      <V52SectionHeader
        title="Telemetría"
        description="Herramientas de lectura y análisis de datos del simulador. Esta sección no muestra datos inventados: esperará a que exista fuente real."
      />

      <section className="card-sleek rounded-2xl p-8 min-h-[420px] flex flex-col items-center justify-center text-center">
        <span className="v52-eyebrow">Telemetría</span>
        <h1 className="font-display font-bold text-4xl text-white tracking-tight mt-3">
          Próximamente
        </h1>
        <p className="text-sm text-vantare-textMuted mt-4 max-w-xl leading-relaxed">
          Aquí verás gráficas en tiempo real de velocidad, rpm, throttle, freno,
          g-force y tiempos por vuelta cuando el módulo esté conectado a datos reales.
        </p>
        <span className="mt-7 text-[10px] font-mono font-bold text-vantare-textDim uppercase tracking-[.28em]">
          En desarrollo
        </span>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
