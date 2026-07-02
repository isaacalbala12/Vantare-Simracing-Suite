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
      <div className="relative rounded-xl overflow-hidden border border-vantare-red-400/40 opacity-0 animate-fade-in-up">
        <div className="absolute inset-0 bg-gradient-to-br from-vantare-red-400/50 via-[#9a0606]/30 to-[#0a0a0a]" />
        <div className="absolute -right-16 -top-16 w-80 h-80 bg-vantare-red-400/20 blur-3xl rounded-full pointer-events-none" />
        <div className="relative p-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-[.22em] bg-vantare-red-400/15 text-vantare-red-400 border border-vantare-red-400/40">
              v0.1 · pública
            </span>
            <span className="flex items-center gap-1.5 text-[9px] font-mono font-bold text-vantare-textDim">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ boxShadow: "0 0 6px rgba(52,211,153,.6)" }} />
              Actualizado desde datos locales
            </span>
          </div>
          <span className="v52-eyebrow mb-4">Roadmap</span>
          <h1 className="font-sans font-bold text-[clamp(2.5rem,5vw,4.5rem)] text-white tracking-tight leading-[.92] -tracking-[.045em] mt-2">
            Desarrollo Vantare
          </h1>
          <p className="mt-3 text-base text-vantare-textMuted max-w-2xl leading-relaxed">
            Fases, prioridades y progreso del desarrollo beta de Vantare.
          </p>
          <div className="flex items-center gap-3 mt-5">
            <button
              type="button"
              disabled
              className="px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-[.18em] bg-gradient-to-br from-vantare-red-500 to-[#9a0606] border border-white/10 text-white opacity-60 cursor-not-allowed"
              title="Próximamente"
            >
              Sugerir feature
            </button>
            <button
              type="button"
              disabled
              className="px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-[.18em] bg-white/5 border border-white/10 text-vantare-textMuted opacity-60 cursor-not-allowed"
              title="Próximamente"
            >
              Ver changelog
            </button>
          </div>
        </div>
      </div>

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
      <section className="glass-panel rounded-xl p-6 opacity-0 animate-fade-in-up delay-100">
        <div className="flex items-center justify-between mb-6">
          <span className="v52-eyebrow">Roadmap beta</span>
          <span className="text-[10px] font-mono font-bold text-vantare-textDim uppercase tracking-[.22em]">v0.1.x → futuro</span>
        </div>

        {/* Track */}
        <div className="relative h-2 mx-2 mb-12">
          <div className="absolute inset-0 rounded-full bg-white/10" />
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-vantare-red-500 to-vantare-red-400/20"
            style={{ width: `${(ROADMAP_PHASES.filter(p => p.status === "done" || p.status === "in-progress").length / ROADMAP_PHASES.length) * 100}%` }}
          />
          {ROADMAP_PHASES.map((phase, i) => {
            const isActive = phase.status === "in-progress";
            const left = `${((i + 0.5) / ROADMAP_PHASES.length) * 100}%`;
            return (
              <div
                key={phase.id}
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                style={{ left }}
              >
                <div
                  className={`w-3 h-3 rotate-45 border transition-all duration-500 ${
                    isActive
                      ? "bg-vantare-red-500 border-vantare-red-500 shadow-[0_0_12px_rgba(255,59,59,.6)] w-5 h-5"
                      : "bg-[#0a0a0a] border-white/20"
                  }`}
                />
              </div>
            );
          })}
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {ROADMAP_PHASES.map((phase) => {
            const isActive = phase.status === "in-progress";
            return (
              <article
                key={phase.id}
                className={`rounded-xl p-5 flex flex-col gap-3 transition-all duration-300 ${
                  isActive
                    ? "border border-vantare-red-500/50 bg-gradient-to-b from-vantare-red-500/10 to-vantare-red-500/5 shadow-[0_0_0_1px_rgba(255,59,59,.18),0_24px_60px_rgba(255,59,59,.22)]"
                    : "bg-[rgba(20,20,20,.55)] border border-white/5 hover:border-vantare-red-400/40"
                }`}
              >
                {/* Status indicator */}
                <div className="flex items-center gap-2">
                  {isActive ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-vantare-red-500 shadow-[0_0_8px_rgba(255,59,59,.6)]" />
                      <span className="text-[10px] font-mono font-bold uppercase tracking-[.18em] text-vantare-red-400">
                        Estado actual
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
                      <span className="text-[10px] font-mono font-bold uppercase tracking-[.18em] text-vantare-textDim">
                        {STATUS_LABELS[phase.status]}
                      </span>
                    </>
                  )}
                </div>

                {/* Title */}
                <h3 className="font-bold text-lg text-white tracking-tight leading-tight">
                  {phase.title}
                </h3>

                {/* Summary */}
                <p className="text-xs text-vantare-textMuted leading-relaxed flex-1">
                  {phase.summary}
                </p>

                {/* Highlights */}
                {phase.highlights.length > 0 && (
                  <ul className="space-y-1">
                    {phase.highlights.map((h, i) => (
                      <li key={i} className="text-[10px] text-vantare-textMuted flex items-start gap-1.5">
                        <span className="text-vantare-red-400 mt-0.5 shrink-0">•</span>
                        {h}
                      </li>
                    ))}
                  </ul>
                )}

                {/* Progress + target */}
                <div className="mt-auto">
                  <ProgressBar value={phase.progress} color="#ff3b3b, #ff6b6b" />
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[9px] font-mono font-bold text-vantare-textDim uppercase tracking-[.22em]">
                      {phase.phaseLabel}
                    </span>
                    <span className="text-[9px] font-mono font-bold text-vantare-textDim uppercase tracking-[.22em]">
                      {phase.targetLabel}
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Overall progress + Areas + Milestones */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 opacity-0 animate-fade-in-up delay-150">
        {/* Progress card */}
        <section className="glass-panel rounded-xl p-5">
          <span className="v52-eyebrow">Progreso global</span>
          <div className="mt-4">
            <div className="flex items-end justify-between mb-2">
              <span className="text-sm font-bold text-white">Completado</span>
              <span className="text-3xl font-bold text-vantare-red-400" style={{ textShadow: "0 0 20px rgba(255,59,59,.3)" }}>
                {overallProgress}%
              </span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, Math.max(0, overallProgress))}%`,
                  background: "linear-gradient(90deg,#ff3b3b,#ff4d4d)",
                  boxShadow: "0 0 12px rgba(255,59,59,.4)",
                }}
              />
            </div>
            <div className="flex items-center justify-between mt-2 text-[10px] font-mono text-vantare-textDim">
              <span>Beta activa</span>
              <span>Meta: 100% · Release 1.0</span>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-white/5 space-y-2.5">
            {ROADMAP_AREAS.map((area) => (
              <div key={area.id}>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-vantare-textMuted">{area.title}</span>
                  <span className="font-mono font-bold text-white">{area.progress}%</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, Math.max(0, area.progress))}%`,
                      background: "linear-gradient(90deg,#ff3b3b,#ff4d4d)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Milestones */}
        <section className="glass-panel rounded-xl p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <span className="v52-eyebrow">Últimos hitos</span>
            <button
              type="button"
              disabled
              className="text-[10px] font-bold text-vantare-red-400 uppercase tracking-[.22em] opacity-60 cursor-not-allowed transition-colors"
              title="Próximamente"
            >
              Changelog completo →
            </button>
          </div>
          <div className="space-y-2">
            {ROADMAP_MILESTONES.map((ms) => (
              <div
                key={ms.id}
                className="flex items-start gap-3 p-3 rounded-lg bg-[rgba(20,20,20,.5)] border border-white/5"
              >
                <span
                  className={`inline-block px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-[.22em] shrink-0 mt-0.5 ${MILESTONE_TYPE_COLORS[ms.type]}`}
                >
                  {ms.label}
                </span>
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-semibold text-white">{ms.title}</h4>
                  <p className="text-[11px] text-vantare-textMuted mt-0.5 leading-relaxed">
                    {ms.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Feedback / Voting — disabled */}
      <section className="relative rounded-xl p-6 overflow-hidden border border-vantare-red-400/30 opacity-0 animate-fade-in-up delay-250">
        <div className="absolute inset-0 bg-gradient-to-br from-vantare-red-400/10 via-[#9a0606]/15 to-[#0a0a0a]" />
        <div className="absolute -bottom-10 -right-10 w-48 h-48 bg-vantare-red-400/10 blur-3xl rounded-full pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-vantare-red-500 to-[#9a0606] flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z" />
              </svg>
            </div>
            <span className="v52-eyebrow">Feedback</span>
          </div>
          <h3 className="text-xl font-bold text-white tracking-tight mb-2">
            El roadmap vive con feedback
          </h3>
          <p className="text-sm text-vantare-textMuted leading-relaxed mb-5 max-w-xl">
            El voting público se conectará más adelante; por ahora el feedback va por Discord.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled
              className="px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-[.18em] bg-gradient-to-br from-vantare-red-500 to-[#9a0606] border border-white/10 text-white opacity-60 cursor-not-allowed"
              title="Próximamente"
            >
              Sugerir feature
            </button>
            <button
              type="button"
              disabled
              className="px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-[.18em] bg-white/5 border border-white/10 text-vantare-textMuted opacity-60 cursor-not-allowed"
              title="Próximamente"
            >
              Votar prioridades
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
