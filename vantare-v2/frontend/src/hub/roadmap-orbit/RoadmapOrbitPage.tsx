import { useEffect, useRef, useState } from "react";
import { Events } from "@wailsio/runtime";
import { useI18n } from "../../i18n/I18nProvider";
import { Surface } from "../../ui/orbit";
import {
  parsePublication, ROADMAP_LOCALES, type RoadmapItem, type RoadmapLocale,
  type RoadmapPublication, type RoadmapSection,
} from "./roadmap-contract";
import "../../styles/orbit-roadmap.css";

type View = "timeline" | "board" | "distribution";
const stages: readonly RoadmapSection[] = ["done", "now", "next"];
const displayStages: readonly RoadmapSection[] = ["now", "next", "done"];

function responseOf(event: unknown): { requestId?: string; publication?: unknown; message?: string } {
  const data = event && typeof event === "object" ? (event as { data?: unknown }).data : null;
  return data && typeof data === "object" ? data as { requestId?: string; publication?: unknown; message?: string } : {};
}

export function RoadmapOrbitPage() {
  const { t, locale } = useI18n();
  const language: RoadmapLocale = ROADMAP_LOCALES.includes(locale as RoadmapLocale) ? locale as RoadmapLocale : "es";
  const [publication, setPublication] = useState<RoadmapPublication | null>(null);
  const [view, setView] = useState<View>("timeline");
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const translate = useRef(t);
  const timeline = useRef<HTMLOListElement>(null);
  useEffect(() => { translate.current = t; }, [t]);

  useEffect(() => {
    const requestId = crypto.randomUUID();
    const offCurrent = Events.On("roadmap:current", (event: unknown) => {
      const value = responseOf(event);
      if (value.requestId !== requestId) return;
      const result = parsePublication(value.publication);
      if (value.publication && !result) setError(translate.current("roadmap.invalidRemote"));
      else setPublication(result);
      setLoaded(true);
    });
    const offError = Events.On("roadmap:error", (event: unknown) => {
      const value = responseOf(event);
      if (value.requestId !== requestId) return;
      setError(value.message ?? translate.current("roadmap.connectionError"));
      setLoaded(true);
    });
    try {
      Promise.resolve(Events.Emit("roadmap:current:get", { requestId })).catch(() => {
        setError(translate.current("roadmap.connectionError")); setLoaded(true);
      });
    } catch {
      setError(translate.current("roadmap.connectionError")); setLoaded(true);
    }
    return () => { offCurrent(); offError(); };
  }, []);

  const items = publication?.document.items ?? [];
  const grouped: Record<RoadmapSection, RoadmapItem[]> = { done: [], now: [], next: [] };
  items.forEach((item) => grouped[item.section].push(item));
  const titleOf = (item: RoadmapItem) => item.title[language]?.trim() || item.title.es;
  const bodyOf = (item: RoadmapItem) => item.body[language]?.trim() || item.body.es;
  const maxCount = Math.max(1, ...stages.map((stage) => grouped[stage].length));
  const timelineItems = stages.flatMap((stage) => grouped[stage]);
  const selectedMilestone = timelineItems.find((item) => item.id === selectedMilestoneId) ?? grouped.now[0] ?? timelineItems[0];
  const selectedIndex = timelineItems.findIndex((item) => item.id === selectedMilestone?.id);
  const activeMilestoneId = selectedMilestone?.id;

  useEffect(() => {
    if (view !== "timeline" || !timeline.current || !activeMilestoneId) return;
    const active = timeline.current.querySelector<HTMLElement>('[data-selected="true"]');
    if (active) timeline.current.scrollLeft = active.offsetLeft - (timeline.current.clientWidth - active.clientWidth) / 2;
  }, [view, activeMilestoneId]);

  return (
    <div className="orbit-rm" data-testid="orbit-roadmap">
      <header className="orbit-rm__head">
        <div className="orbit-rm__head-copy">
          <span className="orbit-eyebrow">{t("roadmap.eyebrow")}</span>
          <h2>{t("roadmap.title")}</h2>
          <p>{t("roadmap.lead")}</p>
        </div>
      </header>
      <Surface aria-label={t("roadmap.title")} className="orbit-rm__reader" fill>
        <div className="orbit-rm__column">
          {!loaded ? <p className="orbit-rm__empty">{t("roadmap.source.loading")}</p> : null}
          {loaded && error ? <p className="orbit-rm__empty" role="alert">{error}</p> : null}
          {loaded && !error && items.length === 0 ? <p className="orbit-rm__empty">{t("roadmap.unpublished")}</p> : null}
          {loaded && !error && items.length > 0 ? (
            <>
              <div className="orbit-rm__view-switch" role="group" aria-label={t("roadmap.views.label")}>
                {(["timeline", "board", "distribution"] as const).map((option) => (
                  <button className="orbit-rm__view-button" aria-pressed={view === option} key={option} onClick={() => setView(option)} type="button">
                    {t(`roadmap.views.${option}`)}
                  </button>
                ))}
              </div>
              {view === "timeline" ? (
                <div className="orbit-rm__timeline-view">
                  <ol className="orbit-rm__timeline" ref={timeline} data-testid="roadmap-timeline" aria-label={t("roadmap.views.timeline")} tabIndex={0}>
                    {timelineItems.map((item, index) => (
                      <li className={`orbit-rm__timeline-item orbit-rm__timeline-item--${item.section}`} data-selected={item.id === selectedMilestone?.id} key={item.id}>
                        <button className="orbit-rm__timeline-choice" type="button" aria-pressed={item.id === selectedMilestone?.id} onClick={() => setSelectedMilestoneId(item.id)}>
                          <span className="orbit-rm__stage">{t(`roadmap.${item.section}.title`)}</span>
                          <strong className="orbit-rm__timeline-title">{titleOf(item)}</strong>
                          <span className="orbit-rm__timeline-node" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                  <section className={`orbit-rm__timeline-detail orbit-rm__timeline-detail--${selectedMilestone.section}`} data-testid="roadmap-timeline-detail" aria-live="polite">
                    <span className="orbit-rm__stage">{t(`roadmap.${selectedMilestone.section}.title`)} · {String(selectedIndex + 1).padStart(2, "0")} / {String(timelineItems.length).padStart(2, "0")}</span>
                    <h3>{titleOf(selectedMilestone)}</h3>
                    {bodyOf(selectedMilestone) ? <p>{bodyOf(selectedMilestone)}</p> : null}
                  </section>
                </div>
              ) : null}
              {view === "board" ? (
                <div className="orbit-rm__board" data-testid="roadmap-board">
                  {displayStages.map((stage) => (
                    <section className={`orbit-rm__board-column orbit-rm__board-column--${stage}`} data-testid={`roadmap-board-${stage}`} key={stage}>
                      <h3>{t(`roadmap.${stage}.title`)} <span>{grouped[stage].length}</span></h3>
                      {grouped[stage].map((item) => (
                        <div className="orbit-rm__milestone" key={item.id}>
                          <strong>{titleOf(item)}</strong>
                          {bodyOf(item) ? <p>{bodyOf(item)}</p> : null}
                        </div>
                      ))}
                    </section>
                  ))}
                </div>
              ) : null}
              {view === "distribution" ? (
                <div className="orbit-rm__distribution" data-testid="roadmap-distribution">
                  {displayStages.map((stage) => (
                    <div className="orbit-rm__bar-row" data-testid={`roadmap-distribution-${stage}`} key={stage}>
                      <span>{t(`roadmap.${stage}.title`)}</span>
                      <div className="orbit-rm__bar-track"><div className={`orbit-rm__bar orbit-rm__bar--${stage}`} style={{ width: `${(grouped[stage].length / maxCount) * 100}%` }} /></div>
                      <strong>{grouped[stage].length}</strong>
                    </div>
                  ))}
                  <p className="orbit-rm__chart-note">{t("roadmap.views.countNote")}</p>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </Surface>
    </div>
  );
}
