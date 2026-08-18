import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../i18n/I18nProvider";
import { ListRow, StatRow, StatTile, SubtleStatus, Surface } from "../../ui/orbit";
import { formatMessage } from "../orbit/format-message";
import { useOrbitSlot } from "../orbit/use-orbit-slot";
import {
  indexProjectProgress,
  pickText,
  ROADMAP_FALLBACK,
  type RoadmapDataset,
} from "../roadmap/roadmap-data";
import { fetchRoadmapProjectsDataset } from "../roadmap/projects-data";
import {
  areaProgress,
  countAreas,
  loadRoadmapSource,
  milestoneState,
  phaseFronts,
  visualState,
  type RoadmapSourceState,
} from "./roadmap-orbit-model";
import { RoadmapDirectionA } from "./directions/RoadmapDirectionA";
import { RoadmapDirectionB } from "./directions/RoadmapDirectionB";
import {
  readRoadmapDirection,
  type RoadmapDirection,
} from "./directions/roadmap-direction-model";
import "../../styles/orbit-roadmap.css";

export const ROADMAP_CONTEXT_SLOT_ID = "orbit-roadmap-context-slot";

/** Canal de actualización activo. La shell solo conoce testers/nightly. */
export type RoadmapChannel = "stable" | "testers" | "nightly";

/** Milisegundos que dura el resaltado carmín tras saltar a una fase (`07`). */
const FOCUS_MS = 1600;

export interface RoadmapOrbitPageProps {
  channel?: RoadmapChannel;
  /** Semilla para tests y harness: evita esperar a la red. */
  dataset?: RoadmapDataset;
  sourceState?: RoadmapSourceState;
  /**
   * Dirección de rework a pintar (bloque W5). Sin valor —y sin `?roadmapDir`
   * en la URL— se pinta la vista actual, que es la que sigue en producción.
   */
  direction?: RoadmapDirection | null;
}

/**
 * Roadmap de Command Orbit (`15-briefings/10-roadmap.md`).
 *
 * Nada de lo que se lee aquí lo escribe la pantalla: fases, áreas e hitos
 * salen de `docs/roadmap-source.json` por el mismo cargador que usaba la
 * página v5.2, en el idioma activo del hub. Los únicos textos propios son los
 * rótulos (`roadmap.*`). Si la fuente remota no está disponible, la cabecera
 * lo dice en vez de presentar la copia empaquetada como la fuente.
 */
export function RoadmapOrbitPage({
  channel = "stable",
  dataset,
  sourceState,
  direction,
}: RoadmapOrbitPageProps) {
  const { t, locale } = useI18n();
  const contextSlot = useOrbitSlot(ROADMAP_CONTEXT_SLOT_ID);
  const phasesRef = useRef<HTMLDivElement | null>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const seeded = dataset !== undefined;
  const [loaded, setLoaded] = useState<RoadmapDataset>(dataset ?? ROADMAP_FALLBACK);
  const [state, setState] = useState<RoadmapSourceState>(
    sourceState ?? (seeded ? "remote" : "loading"),
  );
  const [projects, setProjects] = useState<ReadonlyMap<
    string,
    { done: number; total: number }
  > | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  // Solo lectura del query, una vez: la selección de dirección es una fase de
  // diseño, no un estado de la aplicación.
  const [queryDirection] = useState<RoadmapDirection | null>(() =>
    typeof window === "undefined" ? null : readRoadmapDirection(window.location.search),
  );

  useEffect(() => {
    if (seeded) return;
    const controller = new AbortController();
    loadRoadmapSource(controller.signal)
      .then((result) => {
        setLoaded(result.dataset);
        setState(result.state);
      })
      .catch(() => setState("fallback"));
    fetchRoadmapProjectsDataset(controller.signal)
      .then((result) => setProjects(indexProjectProgress(result.dataset)))
      .catch(() => undefined);
    return () => controller.abort();
  }, [seeded]);

  useEffect(
    () => () => {
      if (focusTimer.current) clearTimeout(focusTimer.current);
    },
    [],
  );

  const data = dataset ?? loaded;
  const text = useCallback(
    (value: Parameters<typeof pickText>[0]) => pickText(value, locale),
    [locale],
  );

  const current = useMemo(
    () => data.phases.find((phase) => phase.status === "in-progress") ?? null,
    [data.phases],
  );
  const areas = useMemo(() => countAreas(data.areas), [data.areas]);
  const version = current ? text(current.target) : "";

  const focusPhase = useCallback((id: string) => {
    setFocused(id);
    const node = phasesRef.current?.querySelector<HTMLElement>(`[data-phase="${id}"]`);
    // jsdom no implementa `scrollIntoView`; el salto es un extra sobre el
    // resaltado, que es lo que de verdad señala la fase.
    node?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    if (focusTimer.current) clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => setFocused(null), FOCUS_MS);
  }, []);

  // La fuente escribe el objetivo a mano: en las fases sin versión repite el
  // propio estado («Por planear», «Futuro»). Repetirlo dos veces en el eyebrow
  // sería ruido, así que en ese caso se dice una sola vez.
  const phaseEyebrow = (phase: RoadmapDataset["phases"][number]) => {
    const state = t(`roadmap.state.${visualState(phase.status)}`);
    const target = text(phase.target);
    const same = target.trim().toLowerCase() === state.trim().toLowerCase();
    return formatMessage(
      t(same ? "roadmap.phases.eyebrowShort" : "roadmap.phases.eyebrowLine"),
      { state, target, progress: phase.progress },
    );
  };

  const none = t("roadmap.kpi.none");

  const active = direction ?? queryDirection;
  if (active) {
    const props = {
      channel,
      contextSlot,
      data,
      projects,
      sourceState: state,
    };
    return active === "a" ? <RoadmapDirectionA {...props} /> : <RoadmapDirectionB {...props} />;
  }

  return (
    <div className="orbit-rm" data-source={state} data-testid="orbit-roadmap">
      <header className="orbit-rm__head">
        <div className="orbit-rm__head-copy">
          <span className="orbit-eyebrow">{t("roadmap.eyebrow")}</span>
          <h2>{t("roadmap.title")}</h2>
          <p>{t("roadmap.lead")}</p>
        </div>
        <div className="orbit-rm__actions">
          <span data-testid="orbit-roadmap-status">
            <SubtleStatus
              tone={state === "remote" ? "ok" : state === "fallback" ? "attn" : "neutral"}
            >
              {state === "loading"
                ? t("roadmap.source.loading")
                : formatMessage(
                    t(state === "remote" ? "roadmap.source.ok" : "roadmap.source.fallback"),
                    { version },
                  )}
            </SubtleStatus>
          </span>
        </div>
      </header>

      <StatRow className="orbit-rm__stats">
        <StatTile
          label={t("roadmap.kpi.phase")}
          sub={
            current
              ? formatMessage(t("roadmap.kpi.phaseSub"), {
                  target: version,
                  progress: current.progress,
                  fronts: phaseFronts(current),
                })
              : t("roadmap.kpi.phaseNoneSub")
          }
          tone={current ? "hot" : "neutral"}
          value={current ? text(current.title) : none}
        />
        <StatTile
          label={t("roadmap.kpi.areas")}
          sub={formatMessage(t("roadmap.kpi.areasSub"), {
            active: areas.active,
            planned: areas.planned,
          })}
          value={areas.total}
        />
        <StatTile
          label={t("roadmap.kpi.milestones")}
          sub={
            data.milestones.length > 0
              ? data.milestones
                  .slice(0, 3)
                  .map((milestone) => text(milestone.title))
                  .join(" · ")
              : t("roadmap.kpi.milestonesNoneSub")
          }
          value={data.milestones.length}
        />
        <StatTile
          label={t("roadmap.kpi.channel")}
          sub={t("roadmap.kpi.channelSub")}
          value={<span data-testid="orbit-roadmap-channel">{t(`roadmap.channel.${channel}`)}</span>}
        />
      </StatRow>

      <Surface
        aria-label={t("roadmap.phases.title")}
        className="orbit-rm__track"
        meta={formatMessage(t("roadmap.phases.meta"), { n: data.phases.length })}
        title={t("roadmap.phases.title")}
      >
        <div className="orbit-rm__phases" data-testid="orbit-roadmap-phases" ref={phasesRef}>
          {data.phases.map((phase) => (
            <article
              className="orbit-rm-phase"
              data-focus={focused === phase.id ? "true" : undefined}
              data-phase={phase.id}
              data-state={visualState(phase.status)}
              data-testid={`orbit-roadmap-phase-${phase.id}`}
              key={phase.id}
            >
              <div className="orbit-rm-phase__bar">
                <i style={{ width: `${phase.progress}%` }} />
              </div>
              <span className="orbit-eyebrow">{phaseEyebrow(phase)}</span>
              <h3>{text(phase.title)}</h3>
              <ul>
                {phase.highlights.map((highlight, index) => (
                  <li key={`${phase.id}-${index}`}>{text(highlight)}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </Surface>

      <div className="orbit-rm__grid">
        <Surface
          aria-label={t("roadmap.areas.title")}
          className="orbit-rm__areas-card"
          fill
          meta={String(areas.total)}
          title={t("roadmap.areas.title")}
        >
          <div className="orbit-rm__areas" data-testid="orbit-roadmap-areas">
            {data.areas.map((area) => (
              <div
                className="orbit-rm-area"
                data-state={visualState(area.status)}
                data-testid={`orbit-roadmap-area-${area.id}`}
                key={area.id}
              >
                <b>{text(area.title)}</b>
                <span>
                  {formatMessage(t("roadmap.areas.progress"), {
                    progress: areaProgress(area, projects),
                  })}
                </span>
                <i>{t(`roadmap.areaState.${visualState(area.status)}`)}</i>
              </div>
            ))}
          </div>
        </Surface>

        <Surface
          aria-label={t("roadmap.milestones.title")}
          className="orbit-rm__milestones-card"
          fill
          meta={t("roadmap.milestones.meta")}
          title={t("roadmap.milestones.title")}
        >
          <ol className="orbit-rm__milestones" data-testid="orbit-roadmap-milestones">
            {data.milestones.map((milestone) => (
              <li
                data-state={milestoneState(milestone)}
                data-testid={`orbit-roadmap-milestone-${milestone.id}`}
                key={milestone.id}
              >
                <b>{text(milestone.title)}</b>
                <span>{text(milestone.body)}</span>
                <em>{text(milestone.label)}</em>
              </li>
            ))}
          </ol>
        </Surface>
      </div>

      {contextSlot
        ? createPortal(
            <div className="orbit-rm__context">
              <section aria-label={t("roadmap.context.title")} className="orbit-block">
                <div className="orbit-block__head">
                  <span className="orbit-eyebrow">{t("roadmap.context.title")}</span>
                  <span className="orbit-rm__context-count">{data.phases.length}</span>
                </div>
                <div className="orbit-list" data-testid="orbit-roadmap-context">
                  {data.phases.map((phase) => (
                    <ListRow
                      key={phase.id}
                      onClick={() => focusPhase(phase.id)}
                      selected={focused === phase.id}
                      subtitle={`${text(phase.phaseLabel)} · ${text(phase.target)}`}
                      title={text(phase.title)}
                      trailing={
                        <span
                          className="orbit-rm__context-pct"
                          data-tone={
                            phase.status === "done"
                              ? "ok"
                              : phase.status === "in-progress"
                                ? "hot"
                                : "neutral"
                          }
                        >
                          {phase.progress} %
                        </span>
                      }
                    />
                  ))}
                </div>
              </section>
              <p className="orbit-rm__context-hint">{t("roadmap.context.hint")}</p>
            </div>,
            contextSlot,
          )
        : null}
    </div>
  );
}
