import { useCallback, useEffect, useMemo, useState } from "react";
import { ROADMAP_FALLBACK, getOverallProgress, pickText } from "../roadmap/roadmap-data";
import { useI18n } from "../../i18n/I18nProvider";

type DashboardFeatureCarouselProps = {
  onNavigate?: (section: string) => void;
};

const CYCLE_INTERVAL_MS = 4500;

const STATUS_COLORS: Record<string, { badge: string; bar: string }> = {
  "in-progress": {
    badge: "bg-blue-950/50 text-blue-300 border-blue-900/30",
    bar: "from-blue-500 to-blue-400",
  },
  planned: {
    badge: "bg-amber-950/50 text-amber-300 border-amber-900/30",
    bar: "from-amber-500 to-amber-400",
  },
  done: {
    badge: "bg-emerald-950/50 text-emerald-300 border-emerald-900/30",
    bar: "from-emerald-500 to-emerald-400",
  },
  future: {
    badge: "bg-violet-950/50 text-violet-300 border-violet-900/30",
    bar: "from-violet-500 to-violet-400",
  },
};

const STATUS_LABELS: Record<string, string> = {
  "in-progress": "En progreso",
  planned: "Planificado",
  done: "Completado",
  future: "Futuro",
};

export function DashboardFeatureCarousel({ onNavigate }: DashboardFeatureCarouselProps) {
  const { locale } = useI18n();
  const [activeIndex, setActiveIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState<number | null>(null);

  const inProgressAreas = useMemo(
    () => ROADMAP_FALLBACK.areas.filter((a) => a.status === "in-progress"),
    [],
  );

  const overallProgress = useMemo(
    () => getOverallProgress(ROADMAP_FALLBACK.areas),
    [],
  );

  // Cycle through features with crossfade tracking
  useEffect(() => {
    if (inProgressAreas.length <= 1) return;
    const interval = window.setInterval(() => {
      setActiveIndex((prev) => {
        setPrevIndex(prev);
        return (prev + 1) % inProgressAreas.length;
      });
    }, CYCLE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [inProgressAreas.length]);

  const handleNavigate = useCallback(() => {
    onNavigate?.("roadmap");
  }, [onNavigate]);

  if (inProgressAreas.length === 0) return null;

  const currentArea = inProgressAreas[activeIndex];
  const prevArea = prevIndex !== null ? inProgressAreas[prevIndex] : null;

  function renderFeatureCard(area: typeof currentArea, locale: string) {
    const areaColors = STATUS_COLORS[area.status] ?? STATUS_COLORS["in-progress"];
    const areaStatusLabel = STATUS_LABELS[area.status] ?? area.status;
    return (
      <>
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-[.22em] border ${areaColors.badge}`}
              >
                {areaStatusLabel}
              </span>
            </div>
            <h3 className="font-bold text-lg text-white tracking-tight">
              {pickText(area.title, locale)}
            </h3>
          </div>
          <div className="text-right shrink-0">
            <span className="font-mono font-bold text-2xl text-white" style={{ fontFeatureSettings: "'tnum'" }}>
              {area.progress}%
            </span>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r transition-all duration-700"
              style={{
                width: `${area.progress}%`,
                background: `linear-gradient(90deg, ${area.status === "in-progress" ? "#3b82f6" : area.status === "planned" ? "#f59e0b" : area.status === "done" ? "#10b981" : "#8b5cf6"}, ${area.status === "in-progress" ? "#60a5fa" : area.status === "planned" ? "#fbbf24" : area.status === "done" ? "#34d399" : "#a78bfa"})`,
              }}
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <section
      className="glass-panel rounded-xl p-5 overflow-hidden"
      data-testid="dashboard-feature-carousel"
    >
      <div className="flex items-center justify-between mb-4">
        <span className="v52-eyebrow" style={{ fontSize: "10px" }}>En desarrollo</span>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono font-bold text-vantare-textDim uppercase tracking-[.22em]">
            Progreso global {overallProgress}%
          </span>
          {/* Dot indicators */}
          <div className="flex items-center gap-1.5">
            {inProgressAreas.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setPrevIndex(activeIndex);
                  setActiveIndex(idx);
                }}
                className={`w-1.5 h-1.5 rounded-full transition-all ${
                  idx === activeIndex
                    ? "bg-vantare-red-400 w-3"
                    : "bg-white/20 hover:bg-white/40"
                }`}
                aria-label={`Ver feature ${idx + 1}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Feature card with crossfade — prev fades out, current fades in */}
      <div className="relative min-h-[100px]">
        {/* Previous item (fading out) */}
        {prevArea && prevArea.id !== currentArea.id && (
          <div
            key={`prev-${prevArea.id}`}
            className="absolute inset-0 opacity-0 transition-opacity duration-500 ease-in-out pointer-events-none"
          >
            {renderFeatureCard(prevArea, locale)}
          </div>
        )}
        {/* Current item (fading in) */}
        <div
          key={`current-${currentArea.id}`}
          className="absolute inset-0 opacity-100 transition-opacity duration-500 ease-in-out"
          data-testid={`carousel-feature-${currentArea.id}`}
        >
          {renderFeatureCard(currentArea, locale)}
        </div>
      </div>

      {/* Navigate to roadmap */}
      <button
        type="button"
        onClick={handleNavigate}
        className="mt-4 text-[10px] font-bold uppercase tracking-[.22em] text-vantare-textMuted hover:text-white transition-colors"
      >
        Ver roadmap →
      </button>
    </section>
  );
}
