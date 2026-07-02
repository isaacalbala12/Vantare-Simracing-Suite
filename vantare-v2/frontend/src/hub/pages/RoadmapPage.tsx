import {
  ROADMAP_PHASES,
  ROADMAP_AREAS,
  ROADMAP_MILESTONES,
  getCurrentPhase,
  getOverallProgress,
  type RoadmapStatus,
} from "../roadmap/roadmap-data";

const STATUS_LABELS: Record<RoadmapStatus, string> = {
  done: "Completado",
  "in-progress": "En progreso",
  planned: "Planificado",
  future: "Futuro",
};

const STATUS_COLORS: Record<RoadmapStatus, string> = {
  done: "text-green-400 border-green-500/30 bg-green-500/10",
  "in-progress": "text-vantare-red-400 border-vantare-red-500/30 bg-vantare-red-500/10",
  planned: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  future: "text-vantare-textDim border-white/10 bg-white/5",
};

const MILESTONE_TYPE_COLORS: Record<string, string> = {
  release: "text-green-400 border-green-500/30 bg-green-500/10",
  feature: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  fix: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  plan: "text-violet-400 border-violet-500/30 bg-violet-500/10",
};

function StatusBadge({ status }: { status: RoadmapStatus }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-[.22em] ${STATUS_COLORS[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function ProgressBar({ value, color }: { value: number; color?: string }) {
  const bg = color ?? "from-vantare-red-600 to-vantare-red-400";
  return (
    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full"
        style={{
          width: `${Math.min(100, Math.max(0, value))}%`,
          background: `linear-gradient(90deg, ${bg})`,
        }}
      />
    </div>
  );
}

export function RoadmapPage() {
  const currentPhase = getCurrentPhase(ROADMAP_PHASES);
  const overallProgress = getOverallProgress(ROADMAP_AREAS);

  return (
    <div className="flex flex-col gap-5">
      {/* Hero */}
      <header className="opacity-0 animate-fade-in-up">
        <span className="v52-eyebrow">Roadmap</span>
        <h1 className="font-sans font-bold text-3xl text-white tracking-tight mt-2">
          Roadmap publico
        </h1>
        <p className="text-sm text-vantare-textMuted mt-2 leading-relaxed max-w-3xl">
          Visibilidad del desarrollo de Vantare. Fases, areas de progreso e hitos
          actualizados desde datos locales.
        </p>
      </header>

      {/* Current phase highlight */}
      {currentPhase && (
        <section className="relative rounded-xl overflow-hidden border border-vantare-red-500/30 opacity-0 animate-fade-in-up delay-75">
          <div className="absolute inset-0 bg-gradient-to-br from-[#ff3b3b]/20 via-[#9a0606]/10 to-[#0a0a0a]" />
          <div className="absolute -right-20 top-0 w-64 h-64 bg-vantare-red-500/10 blur-3xl rounded-full pointer-events-none" />
          <div className="relative p-6">
            <div className="flex items-center gap-2 mb-2">
              <span className="v52-eyebrow">Fase actual</span>
              <StatusBadge status={currentPhase.status} />
            </div>
            <h2 className="font-bold text-2xl text-white tracking-tight">
              {currentPhase.title}
            </h2>
            <p className="text-sm text-vantare-textMuted mt-1 leading-relaxed">
              {currentPhase.summary}
            </p>
            <div className="flex items-center gap-3 mt-3">
              <div className="flex-1">
                <ProgressBar value={currentPhase.progress} color="#ff3b3b, #ff6b6b" />
              </div>
              <span className="text-[10px] font-mono font-bold text-vantare-red-400 shrink-0">
                {currentPhase.progress}%
              </span>
            </div>
            <div className="mt-2 text-[10px] font-mono font-bold text-vantare-textDim uppercase tracking-[.22em]">
              Target: {currentPhase.targetLabel}
            </div>
          </div>
        </section>
      )}

      {/* Phases grid */}
      <section className="opacity-0 animate-fade-in-up delay-100">
        <span className="v52-eyebrow">Fases</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-3">
          {ROADMAP_PHASES.map((phase) => (
            <div
              key={phase.id}
              className="card-sleek rounded-xl p-5 flex flex-col gap-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-mono font-bold text-vantare-textDim uppercase tracking-[.22em]">
                  {phase.phaseLabel}
                </span>
                <StatusBadge status={phase.status} />
              </div>
              <h3 className="font-bold text-base text-white tracking-tight">
                {phase.title}
              </h3>
              <p className="text-xs text-vantare-textMuted leading-relaxed flex-1">
                {phase.summary}
              </p>
              {phase.highlights.length > 0 && (
                <ul className="space-y-1">
                  {phase.highlights.map((h, i) => (
                    <li
                      key={i}
                      className="text-[10px] text-vantare-textMuted flex items-start gap-1.5"
                    >
                      <span className="text-vantare-red-400 mt-0.5 shrink-0">•</span>
                      {h}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <ProgressBar value={phase.progress} color="#ff3b3b, #ff6b6b" />
                </div>
                <span className="text-[10px] font-mono font-bold text-vantare-textDim shrink-0">
                  {phase.progress}%
                </span>
              </div>
              <div className="text-[9px] font-mono font-bold text-vantare-textDim uppercase tracking-[.22em]">
                {phase.targetLabel}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Overall progress + Areas */}
      <section className="opacity-0 animate-fade-in-up delay-150">
        <span className="v52-eyebrow">Progreso general</span>
        <div className="glass-panel rounded-xl p-5 mt-3">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1">
              <ProgressBar value={overallProgress} color="#ff3b3b, #ff6b6b" />
            </div>
            <span className="text-sm font-mono font-bold text-white shrink-0">
              {overallProgress}%
            </span>
          </div>
          <div className="space-y-3">
            {ROADMAP_AREAS.map((area) => (
              <div key={area.id}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-white font-semibold">{area.title}</span>
                  <span className="font-mono text-vantare-textDim">
                    {area.progress}%
                  </span>
                </div>
                <ProgressBar value={area.progress} color="#ff3b3b, #ff6b6b" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Milestones */}
      <section className="opacity-0 animate-fade-in-up delay-200">
        <span className="v52-eyebrow">Ultimos hitos</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          {ROADMAP_MILESTONES.map((ms) => (
            <div
              key={ms.id}
              className="card-sleek rounded-xl p-4 flex flex-col gap-2"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-[.22em] ${MILESTONE_TYPE_COLORS[ms.type]}`}
                >
                  {ms.label}
                </span>
              </div>
              <h4 className="font-bold text-sm text-white">{ms.title}</h4>
              <p className="text-xs text-vantare-textMuted leading-relaxed">
                {ms.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Feedback / Voting — disabled */}
      <section className="opacity-0 animate-fade-in-up delay-250">
        <span className="v52-eyebrow">Feedback</span>
        <div className="glass-panel rounded-xl p-5 mt-3">
          <p className="text-sm text-vantare-textMuted leading-relaxed mb-4">
            El voting publico se conectara mas adelante; por ahora el feedback va
            por Discord.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled
              className="btn-secondary px-4 py-2 rounded-lg text-xs font-bold opacity-50 cursor-not-allowed"
              title="Proximamente"
            >
              Sugerir feature
            </button>
            <button
              type="button"
              disabled
              className="btn-secondary px-4 py-2 rounded-lg text-xs font-bold opacity-50 cursor-not-allowed"
              title="Proximamente"
            >
              Votar prioridades
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
