import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../../i18n/I18nProvider";
import { ListRow, Pill, SubtleStatus, Surface } from "../../../ui/orbit";
import { formatMessage } from "../../orbit/format-message";
import { pickText, type RoadmapPhase } from "../../roadmap/roadmap-data";
import { areaProgress, milestoneState, visualState } from "../roadmap-orbit-model";
import {
  currentPhase,
  milestoneAnchor,
  nextPhase,
  phaseCounts,
  stationOffset,
  type RoadmapDirectionProps,
} from "./roadmap-direction-model";
import "../../../styles/orbit-roadmap-directions.css";

/** Milisegundos que dura el resaltado carmín tras enfocar una estación. */
const FOCUS_MS = 1600;

/** Geometría del dial de la estación (`r` en un `viewBox` de 40). */
const DIAL_R = 16;
const DIAL_C = 2 * Math.PI * DIAL_R;

/**
 * Dirección A del rework del Roadmap: **Trayecto**.
 *
 * Una sola vía horizontal a lo ancho de la pantalla con las fases como
 * estaciones y los hitos como paradas intermedias, y bajo ella tres columnas
 * —Ahora, Siguiente y Áreas— que responden a las tres preguntas que se le
 * hacen a un roadmap. Todo el contenido sale de `docs/roadmap-source.json`.
 */
export function RoadmapDirectionA({
  data,
  sourceState,
  channel,
  projects,
  contextSlot,
}: RoadmapDirectionProps) {
  const { t, locale } = useI18n();
  const railRef = useRef<HTMLDivElement | null>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [focused, setFocused] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (focusTimer.current) clearTimeout(focusTimer.current);
    },
    [],
  );

  const text = useCallback(
    (value: Parameters<typeof pickText>[0]) => pickText(value, locale),
    [locale],
  );

  const phases = data.phases;
  const active = useMemo(() => currentPhase(phases), [phases]);
  const upcoming = useMemo(() => nextPhase(phases), [phases]);
  const counts = useMemo(() => phaseCounts(phases), [phases]);

  /** Paradas: cada hito se ancla a una fase y se reparte dentro de su grupo. */
  const stops = useMemo(() => {
    const grouped = new Map<string, number>();
    const anchored = data.milestones.map((milestone) => {
      const anchor = milestoneAnchor(milestone, phases);
      const index = phases.findIndex((phase) => phase.id === anchor?.id);
      return { milestone, anchor, index: index < 0 ? 0 : index };
    });
    for (const item of anchored) {
      grouped.set(item.anchor?.id ?? "", (grouped.get(item.anchor?.id ?? "") ?? 0) + 1);
    }
    const seen = new Map<string, number>();
    return anchored.map((item) => {
      const key = item.anchor?.id ?? "";
      const total = grouped.get(key) ?? 1;
      const seat = seen.get(key) ?? 0;
      seen.set(key, seat + 1);
      const base = stationOffset(item.index, phases.length);
      const spread = (seat - (total - 1) / 2) * 7;
      return { ...item, left: Math.min(97, Math.max(3, base + spread)) };
    });
  }, [data.milestones, phases]);

  const focusPhase = useCallback((id: string) => {
    setFocused(id);
    const node = railRef.current?.querySelector<HTMLElement>(`[data-phase="${id}"]`);
    // jsdom no implementa `scrollIntoView`: el salto suave es un extra sobre el
    // resaltado, que es lo que de verdad señala la estación.
    node?.scrollIntoView?.({ behavior: "smooth", block: "nearest", inline: "center" });
    if (focusTimer.current) clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => setFocused(null), FOCUS_MS);
  }, []);

  const version = active ? text(active.target) : "";

  const phaseEyebrow = (phase: RoadmapPhase) => {
    const state = t(`roadmap.state.${visualState(phase.status)}`);
    const target = text(phase.target);
    const same = target.trim().toLowerCase() === state.trim().toLowerCase();
    return formatMessage(
      t(same ? "roadmap.phases.eyebrowShort" : "roadmap.phases.eyebrowLine"),
      { state, target, progress: phase.progress },
    );
  };

  const column = (phase: RoadmapPhase | null, title: string, empty: string, key: string) => (
    <Surface
      aria-label={title}
      className="orbit-rmd__col"
      fill
      meta={
        phase
          ? formatMessage(t("roadmap.dir.phaseMeta"), {
              progress: phase.progress,
              n: phase.highlights.length,
            })
          : undefined
      }
      title={title}
    >
      {phase ? (
        <div className="orbit-rmd-focus" data-state={visualState(phase.status)} data-testid={`orbit-rmd-a-${key}`}>
          <span className="orbit-eyebrow">{phaseEyebrow(phase)}</span>
          <strong>{text(phase.title)}</strong>
          <p>{text(phase.summary)}</p>
          <div className="orbit-rmd-focus__bar">
            <i style={{ width: `${phase.progress}%` }} />
          </div>
          <ul className="orbit-rmd-check">
            {phase.highlights.map((highlight, index) => (
              <li key={`${phase.id}-${index}`}>
                <i aria-hidden="true" />
                {text(highlight)}
              </li>
            ))}
          </ul>

          {/* Los hitos anclados a esta fase, con la misma regla que la vía. */}
          {(() => {
            const own = stops.filter(({ anchor }) => anchor?.id === phase.id);
            if (own.length === 0) return null;
            return (
              <div className="orbit-rmd-focus__stops">
                <span className="orbit-eyebrow">
                  {t("roadmap.milestones.title")}
                  <i>{t("roadmap.dir.derived")}</i>
                </span>
                <ul>
                  {own.map(({ milestone }) => (
                    <li data-state={milestoneState(milestone)} key={milestone.id}>
                      <i aria-hidden="true" />
                      <b>{text(milestone.title)}</b>
                      <em>{text(milestone.label)}</em>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}
        </div>
      ) : (
        <p className="orbit-rmd__empty" data-testid={`orbit-rmd-a-${key}-empty`}>
          {empty}
        </p>
      )}
    </Surface>
  );

  return (
    <div className="orbit-rmd orbit-rmd--a" data-source={sourceState} data-testid="orbit-roadmap-direction-a">
      <header className="orbit-rmd__head">
        <div className="orbit-rmd__head-copy">
          <span className="orbit-eyebrow">{t("roadmap.eyebrow")}</span>
          <h2>{t("roadmap.title")}</h2>
        </div>
        <div className="orbit-rmd__head-side">
          <Pill dot={channel === "stable" ? "ok" : "gold"} title={t("roadmap.kpi.channelSub")}>
            {t(`roadmap.channel.${channel}`)}
          </Pill>
          <span data-testid="orbit-roadmap-status">
            <SubtleStatus
              tone={sourceState === "remote" ? "ok" : sourceState === "fallback" ? "attn" : "neutral"}
            >
              {sourceState === "loading"
                ? t("roadmap.source.loading")
                : formatMessage(
                    t(sourceState === "remote" ? "roadmap.source.ok" : "roadmap.source.fallback"),
                    { version },
                  )}
            </SubtleStatus>
          </span>
        </div>
      </header>

      <Surface
        aria-label={t("roadmap.dir.railTitle")}
        className="orbit-rmd__rail-card"
        meta={formatMessage(t("roadmap.dir.railMeta"), {
          n: phases.length,
          done: counts.done,
          active: counts.active,
        })}
        title={t("roadmap.dir.railTitle")}
      >
        {phases.length === 0 ? (
          <p className="orbit-rmd__empty">{t("roadmap.dir.noPhases")}</p>
        ) : (
          <div className="orbit-rmd-rail" data-testid="orbit-rmd-a-rail" ref={railRef}>
            <div className="orbit-rmd-rail__stops">
              {stops.map(({ milestone, anchor, left }) => (
                <button
                  className="orbit-rmd-stop"
                  data-state={milestoneState(milestone)}
                  data-testid={`orbit-rmd-a-stop-${milestone.id}`}
                  key={milestone.id}
                  onClick={() => (anchor ? focusPhase(anchor.id) : undefined)}
                  style={{ left: `${left}%` }}
                  type="button"
                >
                  <b>{text(milestone.label)}</b>
                  <i aria-hidden="true" className="orbit-rmd-stop__dot" />
                  <i aria-hidden="true" className="orbit-rmd-stop__stem" />
                  <span className="orbit-rmd-stop__sr">{text(milestone.title)}</span>
                </button>
              ))}
            </div>

            {/* La vía es un tramo por fase: el relleno es el progreso que
                declara la fuente, no un degradado decorativo. */}
            <div
              aria-hidden="true"
              className="orbit-rmd-rail__line"
              style={{ "--rmd-stations": phases.length } as CSSProperties}
            >
              {phases.map((phase) => (
                <span data-state={visualState(phase.status)} key={phase.id}>
                  <i style={{ width: `${phase.progress}%` }} />
                </span>
              ))}
            </div>

            <div
              className="orbit-rmd-rail__stations"
              style={{ "--rmd-stations": phases.length } as CSSProperties}
            >
              {phases.map((phase) => {
                const state = visualState(phase.status);
                const dash = (phase.progress / 100) * DIAL_C;
                return (
                  <button
                    className="orbit-rmd-station"
                    data-focus={focused === phase.id ? "true" : undefined}
                    data-phase={phase.id}
                    data-state={state}
                    data-testid={`orbit-rmd-a-station-${phase.id}`}
                    key={phase.id}
                    onClick={() => focusPhase(phase.id)}
                    type="button"
                  >
                    <span className="orbit-rmd-dial">
                      <svg aria-hidden="true" viewBox="0 0 40 40">
                        <circle className="orbit-rmd-dial__track" cx="20" cy="20" r={DIAL_R} />
                        <circle
                          className="orbit-rmd-dial__value"
                          cx="20"
                          cy="20"
                          r={DIAL_R}
                          strokeDasharray={`${dash.toFixed(2)} ${(DIAL_C - dash).toFixed(2)}`}
                        />
                      </svg>
                      <b>{phase.progress}</b>
                    </span>
                    <span className="orbit-rmd-station__copy">
                      <b>{text(phase.title)}</b>
                      <span>{text(phase.phaseLabel)}</span>
                      <em>{text(phase.target)}</em>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Surface>

      <div className="orbit-rmd__cols">
        {column(active, t("roadmap.dir.now"), t("roadmap.dir.nowNone"), "now")}
        {column(upcoming, t("roadmap.dir.next"), t("roadmap.dir.nextNone"), "next")}

        <Surface
          aria-label={t("roadmap.areas.title")}
          className="orbit-rmd__col"
          fill
          meta={String(data.areas.length)}
          title={t("roadmap.areas.title")}
        >
          <div className="orbit-rmd-bars" data-testid="orbit-rmd-a-areas">
            {data.areas.map((area) => {
              const progress = areaProgress(area, projects);
              return (
                <div
                  className="orbit-rmd-bar"
                  data-state={visualState(area.status)}
                  data-testid={`orbit-rmd-a-area-${area.id}`}
                  key={area.id}
                >
                  <b>{text(area.title)}</b>
                  <span className="orbit-rmd-bar__pct">{progress} %</span>
                  <span className="orbit-rmd-bar__track">
                    <i style={{ width: `${progress}%` }} />
                  </span>
                  <em>{t(`roadmap.areaState.${visualState(area.status)}`)}</em>
                </div>
              );
            })}
          </div>
        </Surface>
      </div>

      {contextSlot
        ? createPortal(
            <div className="orbit-rmd__context">
              <section aria-label={t("roadmap.context.title")} className="orbit-block">
                <div className="orbit-block__head">
                  <span className="orbit-eyebrow">{t("roadmap.context.title")}</span>
                  <span className="orbit-rmd__context-count">{phases.length}</span>
                </div>
                <div className="orbit-list" data-testid="orbit-rmd-a-context-phases">
                  {phases.map((phase) => (
                    <ListRow
                      key={phase.id}
                      onClick={() => focusPhase(phase.id)}
                      selected={focused === phase.id}
                      subtitle={`${text(phase.phaseLabel)} · ${text(phase.target)}`}
                      title={text(phase.title)}
                      trailing={
                        <span
                          className="orbit-rmd__context-pct"
                          data-tone={visualState(phase.status)}
                        >
                          {phase.progress} %
                        </span>
                      }
                    />
                  ))}
                </div>
              </section>

              <section aria-label={t("roadmap.milestones.title")} className="orbit-block">
                <div className="orbit-block__head">
                  <span className="orbit-eyebrow">{t("roadmap.milestones.title")}</span>
                  <span className="orbit-rmd__context-count">{data.milestones.length}</span>
                </div>
                <div className="orbit-list" data-testid="orbit-rmd-a-context-stops">
                  {stops.map(({ milestone, anchor }) => (
                    <ListRow
                      key={milestone.id}
                      onClick={() => (anchor ? focusPhase(anchor.id) : undefined)}
                      selected={anchor ? focused === anchor.id : false}
                      subtitle={text(milestone.label)}
                      title={text(milestone.title)}
                      trailing={
                        <span
                          className="orbit-rmd__context-pct"
                          data-tone={milestoneState(milestone)}
                        >
                          {t(`roadmap.state.${milestoneState(milestone)}`)}
                        </span>
                      }
                    />
                  ))}
                </div>
              </section>

              <p className="orbit-rmd__context-hint">{t("roadmap.dir.railHint")}</p>
            </div>,
            contextSlot,
          )
        : null}
    </div>
  );
}
