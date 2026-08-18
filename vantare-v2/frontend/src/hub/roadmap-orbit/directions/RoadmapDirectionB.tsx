import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../../i18n/I18nProvider";
import { Chip, Featured, Pill, Seg, SubtleStatus, Surface } from "../../../ui/orbit";
import { formatMessage } from "../../orbit/format-message";
import { pickText } from "../../roadmap/roadmap-data";
import { areaProgress, milestoneState, visualState } from "../roadmap-orbit-model";
import {
  currentPhase,
  deriveNextStep,
  milestoneAnchor,
  type RoadmapDirectionProps,
} from "./roadmap-direction-model";
import "../../../styles/orbit-roadmap-directions.css";

/** Orden del tablero: la fase manda, o mandan las áreas. */
type BoardOrder = "phase" | "area";

/** Geometría del dial grande (120 px sobre un `viewBox` de 120). */
const DIAL_R = 52;
const DIAL_C = 2 * Math.PI * DIAL_R;

/**
 * Dirección B del rework del Roadmap: **Tablero**.
 *
 * La fase en curso ocupa una superficie destacada con su dial y sus frentes
 * abiertos, los hitos caen a la derecha como una línea vertical y las áreas se
 * reparten debajo como tarjetas con barra y próximo paso. El segmentado de
 * arriba decide si el tablero se lee por fase o por área.
 *
 * El «próximo paso» no lo declara la fuente: se deriva del primer highlight de
 * una fase no terminada que mencione el área, y la tarjeta lo marca como
 * derivado en vez de presentarlo como un dato escrito a mano.
 */
export function RoadmapDirectionB({
  data,
  sourceState,
  channel,
  projects,
  contextSlot,
}: RoadmapDirectionProps) {
  const { t, locale } = useI18n();
  const [order, setOrder] = useState<BoardOrder>("phase");

  const text = useCallback(
    (value: Parameters<typeof pickText>[0]) => pickText(value, locale),
    [locale],
  );

  const phases = data.phases;
  const active = useMemo(() => currentPhase(phases), [phases]);
  const version = active ? text(active.target) : "";

  /** Áreas resueltas una sola vez: porcentaje real y próximo paso derivado. */
  const areas = useMemo(() => {
    const resolved = data.areas.map((area) => ({
      area,
      progress: areaProgress(area, projects),
      step: deriveNextStep(area, phases, text),
    }));
    if (order === "area") {
      // «Por área» ordena por avance descendente; «Por fase» respeta el orden
      // declarado en la fuente.
      return [...resolved].sort((a, b) => b.progress - a.progress);
    }
    return resolved;
  }, [data.areas, order, phases, projects, text]);

  /**
   * Frentes abiertos de la fase: las áreas cuyo próximo paso derivado sale de
   * esta misma fase. Es una relación derivada, no declarada, y por eso se
   * pinta junto al recuento de highlights que sí declara la fuente.
   */
  const openFronts = useMemo(
    () =>
      active
        ? areas.filter(({ step }) => step?.phase.id === active.id).map(({ area }) => area)
        : [],
    [active, areas],
  );

  const milestones = useMemo(
    () =>
      data.milestones.map((milestone) => ({
        milestone,
        anchor: milestoneAnchor(milestone, phases),
      })),
    [data.milestones, phases],
  );

  const featured = active ? (
    <Featured className="orbit-rmd-b__featured" data-testid="orbit-rmd-b-featured">
      <div className="orbit-rmd-b__featured-copy">
        <span className="orbit-eyebrow">
          {formatMessage(t("roadmap.dir.featuredEyebrow"), {
            label: text(active.phaseLabel),
            state: t(`roadmap.state.${visualState(active.status)}`),
          })}
        </span>
        <h3>{text(active.title)}</h3>
        <p>{text(active.summary)}</p>
        <div className="orbit-rmd-b__fronts" data-testid="orbit-rmd-b-fronts">
          <span className="orbit-rmd-b__fronts-label">
            {formatMessage(t("roadmap.dir.fronts"), { n: active.highlights.length })}
          </span>
          {openFronts.length > 0 ? (
            <span className="orbit-rmd-b__fronts-label" data-derived="true">
              {t("roadmap.dir.areasInvolved")}
              <i>{t("roadmap.dir.derived")}</i>
            </span>
          ) : null}
          {openFronts.map((area) => (
            <Chip caseNormal key={area.id}>
              {text(area.title)}
            </Chip>
          ))}
        </div>
        <ul className="orbit-rmd-b__highlights">
          {active.highlights.map((highlight, index) => (
            <li key={`${active.id}-${index}`}>
              <i aria-hidden="true">{index + 1}</i>
              {text(highlight)}
            </li>
          ))}
        </ul>
      </div>
      <div className="orbit-rmd-b__dial">
        <svg aria-hidden="true" viewBox="0 0 120 120">
          <circle className="orbit-rmd-dial__track" cx="60" cy="60" r={DIAL_R} />
          <circle
            className="orbit-rmd-dial__value"
            cx="60"
            cy="60"
            r={DIAL_R}
            strokeDasharray={`${((active.progress / 100) * DIAL_C).toFixed(2)} ${(
              DIAL_C -
              (active.progress / 100) * DIAL_C
            ).toFixed(2)}`}
          />
        </svg>
        <b>{active.progress} %</b>
        <span>{text(active.target)}</span>
      </div>
    </Featured>
  ) : (
    <Surface className="orbit-rmd-b__featured-empty" title={t("roadmap.kpi.phase")}>
      <p className="orbit-rmd__empty" data-testid="orbit-rmd-b-featured-empty">
        {t("roadmap.kpi.phaseNoneSub")}
      </p>
    </Surface>
  );

  const areasBlock = (
    <Surface
      aria-label={t("roadmap.areas.title")}
      className="orbit-rmd-b__areas-card"
      fill
      meta={String(data.areas.length)}
      title={t("roadmap.areas.title")}
    >
      <div className="orbit-rmd-b__areas" data-testid="orbit-rmd-b-areas">
        {areas.map(({ area, progress, step }) => (
          <article
            className="orbit-rmd-b-area"
            data-state={visualState(area.status)}
            data-testid={`orbit-rmd-b-area-${area.id}`}
            key={area.id}
          >
            <header>
              <b>{text(area.title)}</b>
              <span className="orbit-rmd-b-area__pct">{progress} %</span>
            </header>
            <span className="orbit-rmd-bar__track">
              <i style={{ width: `${progress}%` }} />
            </span>
            <em>{t(`roadmap.areaState.${visualState(area.status)}`)}</em>
            {step ? (
              <p className="orbit-rmd-b-area__step">
                <span className="orbit-rmd-b-area__step-tag">
                  {t("roadmap.dir.nextStep")}
                  <i>{t("roadmap.dir.derived")}</i>
                </span>
                {step.text}
              </p>
            ) : (
              <p className="orbit-rmd-b-area__step" data-empty="true">
                {t("roadmap.dir.nextStepNone")}
              </p>
            )}
          </article>
        ))}
      </div>
    </Surface>
  );

  return (
    <div className="orbit-rmd orbit-rmd--b" data-source={sourceState} data-testid="orbit-roadmap-direction-b">
      <header className="orbit-rmd__head">
        <div className="orbit-rmd__head-copy">
          <span className="orbit-eyebrow">{t("roadmap.eyebrow")}</span>
          <h2>{t("roadmap.title")}</h2>
        </div>
        <div className="orbit-rmd__head-side">
          <Seg<BoardOrder>
            label={t("roadmap.dir.orderLabel")}
            onChange={setOrder}
            options={[
              { value: "phase", label: t("roadmap.dir.byPhase") },
              { value: "area", label: t("roadmap.dir.byArea") },
            ]}
            value={order}
          />
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

      <div className="orbit-rmd-b__grid" data-order={order}>
        <div className="orbit-rmd-b__main">{order === "phase" ? featured : areasBlock}</div>

        <Surface
          aria-label={t("roadmap.milestones.title")}
          className="orbit-rmd-b__stops-card"
          fill
          meta={t("roadmap.milestones.meta")}
          title={t("roadmap.milestones.title")}
        >
          <ol className="orbit-rmd-b__stops" data-testid="orbit-rmd-b-milestones">
            {milestones.map(({ milestone, anchor }) => (
              <li
                data-state={milestoneState(milestone)}
                data-testid={`orbit-rmd-b-milestone-${milestone.id}`}
                key={milestone.id}
              >
                <i aria-hidden="true" />
                <b>{text(milestone.title)}</b>
                <span>{text(milestone.body)}</span>
                <em>
                  {formatMessage(t("roadmap.dir.stopMeta"), {
                    label: text(milestone.label),
                    phase: anchor ? text(anchor.phaseLabel) : "—",
                  })}
                </em>
              </li>
            ))}
          </ol>
        </Surface>

        <div className="orbit-rmd-b__rest">{order === "phase" ? areasBlock : featured}</div>
      </div>

      {contextSlot
        ? createPortal(
            <div className="orbit-rmd__context">
              <section aria-label={t("roadmap.context.title")} className="orbit-block">
                <div className="orbit-block__head">
                  <span className="orbit-eyebrow">{t("roadmap.context.title")}</span>
                  <span className="orbit-rmd__context-count">{phases.length}</span>
                </div>
                <ul className="orbit-rmd-b__phase-list" data-testid="orbit-rmd-b-context">
                  {phases.map((phase) => (
                    <li data-state={visualState(phase.status)} key={phase.id}>
                      <b>{text(phase.title)}</b>
                      <span>{`${text(phase.phaseLabel)} · ${text(phase.target)}`}</span>
                      <em>{phase.progress} %</em>
                    </li>
                  ))}
                </ul>
              </section>
              <p className="orbit-rmd__context-hint">{t("roadmap.dir.boardHint")}</p>
            </div>,
            contextSlot,
          )
        : null}
    </div>
  );
}
