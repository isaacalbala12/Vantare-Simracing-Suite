import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import {
  fetchRoadmapProjectsDataset,
  pickRoadmapProjectText,
  ROADMAP_PROJECTS_FALLBACK,
  type RoadmapProject,
  type RoadmapProjectStatus,
  type RoadmapProjectsLoadStatus,
  type RoadmapProjectsSnapshot,
} from "./projects-data";

type Props = {
  t?: (key: string) => string;
  locale?: string;
};

const statusClass: Record<RoadmapProjectsLoadStatus, string> = {
  "remote-fresh": "text-emerald-300 border-emerald-400/30 bg-emerald-400/10",
  "remote-stale": "text-amber-300 border-amber-400/30 bg-amber-400/10",
  "embedded-fallback": "text-sky-300 border-sky-400/30 bg-sky-400/10",
};

function projectStatusLabel(t: (key: string) => string, status: RoadmapProjectStatus) {
  return t(`roadmap.projects.status.${status}`);
}

function ProjectCard({ project, locale, t }: { project: RoadmapProject; locale: string; t: (key: string) => string }) {
  const [expanded, setExpanded] = useState(false);
  const tasks = expanded ? project.tasks : project.tasks.slice(0, 8);
  const title = pickRoadmapProjectText(project.title, locale);
  return (
    <article className="rounded-xl p-5 flex flex-col gap-4 border border-white/10 bg-[rgba(20,20,20,.55)]" data-testid={`roadmap-project-${project.id}`}>
      <div>
        <h3 className="font-bold text-lg text-white tracking-tight">{title}</h3>
        {project.summary && <p className="mt-1 text-xs text-vantare-textMuted leading-relaxed">{pickRoadmapProjectText(project.summary, locale)}</p>}
      </div>
      {project.progress && (
        <div>
          <div className="flex items-center justify-between text-[10px] font-mono text-vantare-textDim mb-1">
            <span>{t("roadmap.projects.progress.label")}</span>
            <span>{project.progress.percent === null ? t("roadmap.projects.progress.none") : `${project.progress.percent}%`} · {project.progress.done}/{project.progress.total}</span>
          </div>
          <div
            role="progressbar"
            aria-label={t("roadmap.projects.progress.label")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={project.progress.percent ?? undefined}
            aria-valuetext={project.progress.percent === null ? t("roadmap.projects.progress.none") : undefined}
            className="h-1.5 bg-white/5 rounded-full overflow-hidden"
          >
            {project.progress.percent !== null && <div className="h-full rounded-full bg-gradient-to-r from-vantare-red-500 to-vantare-red-300" style={{ width: `${project.progress.percent}%` }} />}
          </div>
        </div>
      )}
      {project.tasks.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-white/5 pt-3">
          <ul className="flex flex-col gap-2">
            {tasks.map((task) => (
              <li key={task.id} className="flex items-start justify-between gap-3 text-xs">
                <span className="text-vantare-textMuted leading-relaxed">{task.title}</span>
                <span className="shrink-0 text-[9px] font-bold uppercase tracking-[.14em] text-vantare-textDim">{projectStatusLabel(t, task.status)}</span>
              </li>
            ))}
          </ul>
          {project.tasks.length > 8 && (
            <button type="button" className="self-start text-[10px] font-bold uppercase tracking-[.16em] text-vantare-red-300 hover:text-white" onClick={() => setExpanded((value) => !value)}>
              {expanded ? t("roadmap.projects.tasks.showLess") : t("roadmap.projects.tasks.showAll")}
            </button>
          )}
        </div>
      ) : (
        <p className="border-t border-white/5 pt-3 text-xs text-vantare-textDim">{t("roadmap.projects.tasks.empty")}</p>
      )}
    </article>
  );
}

function LoadNotice({ status, reason, t }: { status: RoadmapProjectsLoadStatus; reason: "invalid" | "unavailable" | null; t: (key: string) => string }) {
  const message = reason ? t(`roadmap.projects.source.${reason}`) : t(`roadmap.projects.source.${status}`);
  return <p role="status" aria-live="polite" className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[.14em] ${statusClass[status]}`}>{message}</p>;
}

export function RoadmapProjectTabs({ t: providedT, locale: providedLocale }: Props) {
  const context = useI18n();
  const t = providedT ?? context.t;
  const locale = providedLocale ?? context.locale;
  const [dataset, setDataset] = useState<RoadmapProjectsSnapshot | null>(null);
  const [status, setStatus] = useState<RoadmapProjectsLoadStatus | "loading">("loading");
  const [reason, setReason] = useState<"invalid" | "unavailable" | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const baseId = useId().replace(/:/g, "");

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    fetchRoadmapProjectsDataset(controller.signal).then((result) => {
      if (!active) return;
      setDataset(result.dataset);
      setStatus(result.status);
      setReason(result.reason);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  if (status === "loading" || !dataset) {
    return <section className="glass-panel rounded-xl p-6" aria-busy="true"><p role="status" aria-live="polite" className="text-sm text-vantare-textMuted">{t("roadmap.projects.loading")}</p></section>;
  }

  const tabs = dataset.tabs;
  const activeTab = tabs[Math.min(activeIndex, tabs.length - 1)];
  const moveTab = (next: number, moveFocus = false) => {
    const wrapped = (next + tabs.length) % tabs.length;
    setActiveIndex(wrapped);
    if (moveFocus) tabRefs.current[wrapped]?.focus();
  };

  return (
    <section className="flex flex-col gap-4 opacity-0 animate-fade-in-up delay-100" data-testid="roadmap-project-tabs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label={t("roadmap.projects.tabs.label")} className="flex flex-wrap gap-2">
          {tabs.map((tab, index) => {
            const tabId = `${baseId}-tab-${tab.id}`;
            const panelId = `${baseId}-panel-${tab.id}`;
            return <button ref={(node) => { tabRefs.current[index] = node; }} key={tab.id} id={tabId} type="button" role="tab" aria-selected={activeIndex === index} aria-controls={panelId} tabIndex={activeIndex === index ? 0 : -1} onClick={() => moveTab(index)} onKeyDown={(event) => {
              if (event.key === "ArrowRight") { event.preventDefault(); moveTab(index + 1, true); }
              if (event.key === "ArrowLeft") { event.preventDefault(); moveTab(index - 1, true); }
              if (event.key === "Home") { event.preventDefault(); moveTab(0, true); }
              if (event.key === "End") { event.preventDefault(); moveTab(tabs.length - 1, true); }
            }} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-[.16em] border transition-colors ${activeIndex === index ? "bg-gradient-to-br from-vantare-red-500 to-[#9a0606] text-white border-white/10" : "bg-white/5 text-vantare-textMuted border-white/10 hover:text-white"}`}>
              {pickRoadmapProjectText(tab.label, locale)}
            </button>;
          })}
        </div>
        <LoadNotice status={status} reason={reason} t={t} />
      </div>
      <div id={`${baseId}-panel-${activeTab.id}`} role="tabpanel" aria-labelledby={`${baseId}-tab-${activeTab.id}`} tabIndex={0} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {activeTab.projects.map((project) => <ProjectCard key={project.id} project={project} locale={locale} t={t} />)}
        </div>
      </div>
    </section>
  );
}

export { ROADMAP_PROJECTS_FALLBACK };
