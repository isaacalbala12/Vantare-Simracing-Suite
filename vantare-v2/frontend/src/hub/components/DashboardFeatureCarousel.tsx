import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import {
  pickRoadmapProjectText,
  type RoadmapProject,
  type RoadmapProjectsLoadResult,
} from "../roadmap/projects-data";

type DashboardFeatureCarouselProps = {
  onNavigate?: (section: string) => void;
  roadmap: RoadmapProjectsLoadResult | null;
};

const CYCLE_INTERVAL_MS = 4500;

const STATUS_COLORS: Record<string, string> = {
  "in-progress": "bg-blue-950/50 text-blue-300 border-blue-900/30",
  planned: "bg-amber-950/50 text-amber-300 border-amber-900/30",
  done: "bg-emerald-950/50 text-emerald-300 border-emerald-900/30",
};

const STATUS_LABELS: Record<string, string> = {
  "in-progress": "En progreso",
  planned: "Planificado",
  done: "Completado",
};

function getProjectStatus(project: RoadmapProject): "in-progress" | "planned" | "done" {
  if (project.tasks.some((task) => task.status === "in-progress")) return "in-progress";
  if (project.tasks.length > 0 && project.tasks.every((task) => task.status === "done")) return "done";
  return "planned";
}

function getProvenanceLabel(roadmap: RoadmapProjectsLoadResult | null): string {
  if (!roadmap) return "Cargando fuente…";
  if (roadmap.status === "remote-fresh") return "Fuente remota actual";
  if (roadmap.status === "remote-stale") return "Fuente remota antigua";
  return roadmap.reason === "invalid"
    ? "Fuente inválida · respaldo empaquetado"
    : "Fuente no disponible · respaldo empaquetado";
}

export function DashboardFeatureCarousel({ onNavigate, roadmap }: DashboardFeatureCarouselProps) {
  const { locale } = useI18n();
  const [activeIndex, setActiveIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState<number | null>(null);

  const projects = useMemo(() => {
    if (!roadmap) return [];
    const allProjects = roadmap.dataset.tabs.flatMap((tab) => tab.projects);
    const activeProjects = allProjects.filter((project) => getProjectStatus(project) === "in-progress");
    return activeProjects.length > 0 ? activeProjects : allProjects;
  }, [roadmap]);

  const overallProgress = useMemo(() => {
    if (!roadmap) return null;
    const tasks = roadmap.dataset.tabs.flatMap((tab) =>
      tab.projects.flatMap((project) => project.tasks),
    );
    if (tasks.length === 0) return null;
    return Math.round((tasks.filter((task) => task.status === "done").length / tasks.length) * 100);
  }, [roadmap]);

  useEffect(() => {
    if (projects.length <= 1) return;
    const interval = window.setInterval(() => {
      setActiveIndex((previous) => {
        setPrevIndex(previous);
        return (previous + 1) % projects.length;
      });
    }, CYCLE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [projects.length]);

  const handleNavigate = useCallback(() => {
    onNavigate?.("roadmap");
  }, [onNavigate]);

  const safeActiveIndex = projects.length === 0 ? 0 : activeIndex % projects.length;
  const currentProject = projects[safeActiveIndex] ?? null;
  const previousProject = prevIndex !== null && projects.length > 0
    ? projects[prevIndex % projects.length]
    : null;

  function renderProject(project: RoadmapProject) {
    const status = getProjectStatus(project);
    const progress = project.progress?.percent ?? 0;

    return (
      <>
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-[.22em] border ${STATUS_COLORS[status]}`}>
                {STATUS_LABELS[status]}
              </span>
            </div>
            <h3 className="font-bold text-lg text-white tracking-tight">
              {pickRoadmapProjectText(project.title, locale)}
            </h3>
          </div>
          <div className="text-right shrink-0">
            <span className="font-mono font-bold text-2xl text-white" style={{ fontFeatureSettings: "'tnum'" }}>
              {progress}%
            </span>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${progress}%`,
                background: status === "in-progress"
                  ? "linear-gradient(90deg,#3b82f6,#60a5fa)"
                  : status === "planned"
                    ? "linear-gradient(90deg,#f59e0b,#fbbf24)"
                    : "linear-gradient(90deg,#10b981,#34d399)",
              }}
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <section className="glass-panel rounded-xl p-5 overflow-hidden" data-testid="dashboard-feature-carousel">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <span className="v52-eyebrow" style={{ fontSize: "10px" }}>En desarrollo</span>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <span className="text-[10px] font-mono font-bold text-vantare-textDim uppercase tracking-[.22em]">
            Progreso global {overallProgress === null ? "—" : `${overallProgress}%`}
          </span>
          <span data-testid="dashboard-roadmap-provenance" className="text-[9px] font-mono text-vantare-textDim">
            {getProvenanceLabel(roadmap)}
          </span>
          <div className="flex items-center gap-1.5">
            {projects.map((project, index) => (
              <button
                key={project.id}
                type="button"
                onClick={() => {
                  setPrevIndex(safeActiveIndex);
                  setActiveIndex(index);
                }}
                className={`w-1.5 h-1.5 rounded-full transition-all ${index === safeActiveIndex ? "bg-vantare-red-400 w-3" : "bg-white/20 hover:bg-white/40"}`}
                aria-label={`Ver proyecto ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="relative min-h-[100px]">
        {previousProject && currentProject && previousProject.id !== currentProject.id && (
          <div key={`prev-${previousProject.id}`} className="absolute inset-0 opacity-0 transition-opacity duration-500 ease-in-out pointer-events-none">
            {renderProject(previousProject)}
          </div>
        )}
        {currentProject ? (
          <div key={`current-${currentProject.id}`} className="absolute inset-0 opacity-100 transition-opacity duration-500 ease-in-out" data-testid={`carousel-feature-${currentProject.id}`}>
            {renderProject(currentProject)}
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center text-sm text-vantare-textMuted">Cargando roadmap…</div>
        )}
      </div>

      <button type="button" onClick={handleNavigate} className="mt-4 text-[10px] font-bold uppercase tracking-[.22em] text-vantare-textMuted hover:text-white transition-colors">
        Ver roadmap →
      </button>
    </section>
  );
}
