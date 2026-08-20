import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../i18n/I18nProvider";
import { Accordion, Featured, Kbd, ListRow, Pill, StateChip, SubtleStatus, Surface } from "../../ui/orbit";
import { formatMessage } from "../orbit/format-message";
import { useOrbitSlot } from "../orbit/use-orbit-slot";
import { pickText, ROADMAP_FALLBACK, type RoadmapDataset } from "../roadmap/roadmap-data";
import {
  buildNarrative,
  deliveredCount,
  formatDeliveredDate,
  loadRoadmapSource,
  ROADMAP_SECTIONS,
  sectionCount,
  visualState,
  type RoadmapSection,
  type RoadmapSourceState,
} from "./roadmap-orbit-model";
import "../../styles/orbit-roadmap.css";

export const ROADMAP_CONTEXT_SLOT_ID = "orbit-roadmap-context-slot";

/** Canal de actualización activo. La shell solo conoce testers/nightly. */
export type RoadmapChannel = "stable" | "testers" | "nightly";

/** Milisegundos que dura el resaltado carmín tras saltar a una sección (`07`). */
const FOCUS_MS = 1600;

export interface RoadmapOrbitPageProps {
  channel?: RoadmapChannel;
  /** Semilla para tests y harness: evita esperar a la red. */
  dataset?: RoadmapDataset;
  sourceState?: RoadmapSourceState;
  /** Estado inicial del plegable HECHO. Solo lo usan tests y harness. */
  doneOpen?: boolean;
}

/**
 * Roadmap de Command Orbit — vista «Qué viene» (`15-briefings/10-roadmap.md`,
 * decisión D-R3-F-1).
 *
 * Una sola columna narrativa, tipo changelog invertido: arriba lo que se está
 * haciendo AHORA, después LO PRÓXIMO y al final LO HECHO plegado. Sin
 * porcentajes ni rejilla de tarjetas: la escala 0/10/25/50/75/100 de la fuente
 * es una estimación a mano y pintarla como barra la vendía como medida.
 *
 * Nada de lo que se lee aquí lo escribe la pantalla: fases e hitos salen de
 * `docs/roadmap-source.json` por el mismo cargador que usaba la página v5.2,
 * en el idioma activo del hub. Los únicos textos propios son los rótulos
 * (`roadmap.*`). Si la fuente remota no está disponible, la cabecera lo dice
 * en vez de presentar la copia empaquetada como la fuente.
 */
export function RoadmapOrbitPage({
  channel = "stable",
  dataset,
  sourceState,
  doneOpen = false,
}: RoadmapOrbitPageProps) {
  const { t, locale } = useI18n();
  const contextSlot = useOrbitSlot(ROADMAP_CONTEXT_SLOT_ID);
  const columnRef = useRef<HTMLDivElement | null>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const seeded = dataset !== undefined;
  const [loaded, setLoaded] = useState<RoadmapDataset>(dataset ?? ROADMAP_FALLBACK);
  const [state, setState] = useState<RoadmapSourceState>(
    sourceState ?? (seeded ? "remote" : "loading"),
  );
  const [focused, setFocused] = useState<RoadmapSection | null>(null);
  // El plegable de HECHO nace cerrado: lo publicado es contexto, no la lectura
  // principal. El estado vive aquí para que `<details>` no se descontrole al
  // repintar la sección.
  const [openDone, setOpenDone] = useState(doneOpen);

  useEffect(() => {
    if (seeded) return;
    const controller = new AbortController();
    loadRoadmapSource(controller.signal)
      .then((result) => {
        setLoaded(result.dataset);
        setState(result.state);
      })
      .catch(() => setState("fallback"));
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

  const narrative = useMemo(() => buildNarrative(data), [data]);
  const version = narrative.now ? text(narrative.now.target) : "";

  const focusSection = useCallback((section: RoadmapSection) => {
    setFocused(section);
    const node = columnRef.current?.querySelector<HTMLElement>(`[data-section="${section}"]`);
    // jsdom no implementa `scrollIntoView`; el salto es un extra sobre el
    // resaltado, que es lo que de verdad señala la sección.
    node?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    if (focusTimer.current) clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => setFocused(null), FOCUS_MS);
  }, []);

  const derived = t("roadmap.derived");

  /** Marca de derivación: se repite junto a cada bloque que no declara la fuente. */
  const derivedMark = (
    <span className="orbit-rm__derived" data-testid="orbit-roadmap-derived">
      {derived}
    </span>
  );

  const stateChipTone = (status: RoadmapDataset["phases"][number]["status"]) =>
    status === "done" ? "ok" : status === "planned" ? "warn" : "draft";

  /**
   * La fuente escribe el objetivo a mano y, en las fases sin versión, repite
   * el propio estado («Por planear», «Futuro»). Junto al chip de estado eso se
   * lee dos veces, así que ahí no se repite: el chip ya lo dice.
   */
  const targetOf = (phase: RoadmapDataset["phases"][number]) => {
    const target = text(phase.target);
    const label = t(`roadmap.state.${visualState(phase.status)}`);
    return target.trim().toLowerCase() === label.trim().toLowerCase() ? null : target;
  };

  return (
    <div className="orbit-rm" data-source={state} data-testid="orbit-roadmap">
      <header className="orbit-rm__head">
        <div className="orbit-rm__head-copy">
          <span className="orbit-eyebrow">{t("roadmap.eyebrow")}</span>
          <h2>{t("roadmap.title")}</h2>
          <p>{t("roadmap.lead")}</p>
        </div>
        <div className="orbit-rm__actions">
          <Pill dot="ring">
            <span data-testid="orbit-roadmap-channel">{t(`roadmap.channel.${channel}`)}</span>
          </Pill>
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

      <Surface aria-label={t("roadmap.title")} className="orbit-rm__reader" fill>
        <div className="orbit-rm__column" ref={columnRef}>
          {/* ───────────────────────────────────────────────────────── AHORA */}
          <section
            className="orbit-rm__section"
            data-focus={focused === "now" ? "true" : undefined}
            data-section="now"
            data-testid="orbit-roadmap-now"
          >
            <h3 className="orbit-rm__rule">
              <span>{t("roadmap.now.title")}</span>
            </h3>

            {narrative.now ? (
              <Featured className="orbit-rm__now">
                <div className="orbit-rm__now-head">
                  <span className="orbit-eyebrow">{text(narrative.now.phaseLabel)}</span>
                  {narrative.nowIndex > 0 ? (
                    <span className="orbit-rm__position" data-testid="orbit-roadmap-position">
                      {formatMessage(t("roadmap.now.position"), {
                        n: narrative.nowIndex,
                        total: narrative.total,
                      })}
                    </span>
                  ) : null}
                </div>
                <div className="orbit-rm__now-title">
                  <b>{text(narrative.now.title)}</b>
                  <Kbd keys={[text(narrative.now.target)]} />
                </div>
                {text(narrative.now.summary) ? (
                  <p className="orbit-rm__now-summary">{text(narrative.now.summary)}</p>
                ) : null}

                <ul className="orbit-rm__checklist" data-testid="orbit-roadmap-highlights">
                  {narrative.now.highlights.map((highlight, index) => (
                    <li className="orbit-rm__check" key={`now-${index}`}>
                      <i aria-hidden="true" />
                      <span>{text(highlight)}</span>
                    </li>
                  ))}
                </ul>
              </Featured>
            ) : (
              <p className="orbit-rm__empty">{t("roadmap.now.none")}</p>
            )}

            {narrative.nowMilestones.length > 0 ? (
              <div className="orbit-rm__anchored" data-testid="orbit-roadmap-now-milestones">
                <div className="orbit-rm__anchored-head">
                  <span className="orbit-eyebrow">{t("roadmap.now.anchored")}</span>
                  {derivedMark}
                </div>
                <p className="orbit-rm__note">{t("roadmap.derivedNote")}</p>
                <ul className="orbit-rm__stones">
                  {narrative.nowMilestones.map((milestone) => (
                    <li
                      data-testid={`orbit-roadmap-milestone-${milestone.id}`}
                      key={milestone.id}
                      data-state="active"
                    >
                      <b>{text(milestone.title)}</b>
                      <span>{text(milestone.body)}</span>
                      <em>{text(milestone.label)}</em>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          {/* ─────────────────────────────────────────────────────── PRÓXIMO */}
          <section
            className="orbit-rm__section"
            data-focus={focused === "next" ? "true" : undefined}
            data-section="next"
            data-testid="orbit-roadmap-next"
          >
            <h3 className="orbit-rm__rule">
              <span>{t("roadmap.next.title")}</span>
            </h3>

            {narrative.next.length === 0 ? (
              <p className="orbit-rm__empty">{t("roadmap.next.none")}</p>
            ) : (
              <ol className="orbit-rm__next">
                {narrative.next.map((phase) => (
                  <li
                    data-state={visualState(phase.status)}
                    data-testid={`orbit-roadmap-phase-${phase.id}`}
                    key={phase.id}
                  >
                    <div className="orbit-rm__next-head">
                      <b>{text(phase.title)}</b>
                      {targetOf(phase) ? (
                        <span className="orbit-rm__target">{targetOf(phase)}</span>
                      ) : null}
                      <StateChip state={stateChipTone(phase.status)}>
                        {t(`roadmap.state.${visualState(phase.status)}`)}
                      </StateChip>
                    </div>
                    <ul className="orbit-rm__bullets">
                      {phase.highlights.slice(0, 3).map((highlight, index) => (
                        <li key={`${phase.id}-${index}`}>{text(highlight)}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}

            {narrative.nextMilestones.length > 0 ? (
              <div className="orbit-rm__anchored" data-testid="orbit-roadmap-next-milestones">
                <div className="orbit-rm__anchored-head">
                  <span className="orbit-eyebrow">{t("roadmap.next.plans")}</span>
                  {derivedMark}
                </div>
                <ul className="orbit-rm__stones">
                  {narrative.nextMilestones.map((milestone) => (
                    <li
                      data-state="planned"
                      data-testid={`orbit-roadmap-milestone-${milestone.id}`}
                      key={milestone.id}
                    >
                      <b>{text(milestone.title)}</b>
                      <span>{text(milestone.body)}</span>
                      <em>{text(milestone.label)}</em>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          {/* ────────────────────────────────────────────────────────── HECHO */}
          <section
            className="orbit-rm__section"
            data-focus={focused === "done" ? "true" : undefined}
            data-section="done"
            data-testid="orbit-roadmap-done"
          >
            <h3 className="orbit-rm__rule">
              <span>{t("roadmap.done.title")}</span>
            </h3>

            <Accordion
              className="orbit-rm__done"
              onToggle={setOpenDone}
              open={openDone}
              summary={formatMessage(t("roadmap.done.summary"), {
                phases: narrative.done.length,
                releases: narrative.doneMilestones.length,
              })}
              title={t("roadmap.done.accordion")}
            >
              <div data-testid="orbit-roadmap-done-body">
                {narrative.done.length === 0 ? (
                  <p className="orbit-rm__empty">{t("roadmap.done.none")}</p>
                ) : (
                  <ol className="orbit-rm__next orbit-rm__next--done">
                    {narrative.done.map((phase) => (
                      <li
                        data-state="done"
                        data-testid={`orbit-roadmap-phase-${phase.id}`}
                        key={phase.id}
                      >
                        <div className="orbit-rm__next-head">
                          <b>{text(phase.title)}</b>
                          {targetOf(phase) ? (
                            <span className="orbit-rm__target">{targetOf(phase)}</span>
                          ) : null}
                          <StateChip state="ok">{t("roadmap.state.done")}</StateChip>
                        </div>
                        <ul className="orbit-rm__bullets">
                          {phase.highlights.map((highlight, index) => (
                            <li key={`${phase.id}-${index}`}>{text(highlight)}</li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ol>
                )}

                {/* Entregado recientemente: lo único de esta pantalla que no
                    sale del plan manual, sino de los commits mergeados a
                    nightly. Va aquí abajo y marcado, porque es un registro de
                    lo que ya pasó, no una promesa. */}
                {narrative.delivered.length > 0 ? (
                  <div className="orbit-rm__anchored" data-testid="orbit-roadmap-delivered">
                    <div className="orbit-rm__anchored-head">
                      <span className="orbit-eyebrow">{t("roadmap.delivered.title")}</span>
                      {derivedMark}
                    </div>
                    <p className="orbit-rm__note">
                      {formatMessage(t("roadmap.delivered.note"), {
                        n: deliveredCount(narrative),
                      })}
                    </p>
                    <ol className="orbit-rm__delivered">
                      {narrative.delivered.map((day) => (
                        <li data-testid={`orbit-roadmap-delivered-${day.date}`} key={day.date}>
                          <b>{formatDeliveredDate(day.date, locale)}</b>
                          <ul>
                            {day.entries.map((entry, index) => (
                              <li key={`${day.date}-${index}`}>
                                <em data-kind={entry.kind}>
                                  {t(`roadmap.delivered.kind.${entry.kind}`)}
                                  {entry.scope ? ` · ${entry.scope}` : ""}
                                </em>
                                <span>{entry.text}</span>
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}

                {narrative.doneMilestones.length > 0 ? (
                  <div className="orbit-rm__anchored">
                    <div className="orbit-rm__anchored-head">
                      <span className="orbit-eyebrow">{t("roadmap.done.released")}</span>
                      {derivedMark}
                    </div>
                    <ul className="orbit-rm__stones">
                      {narrative.doneMilestones.map((milestone) => (
                        <li
                          data-state="done"
                          data-testid={`orbit-roadmap-milestone-${milestone.id}`}
                          key={milestone.id}
                        >
                          <b>{text(milestone.title)}</b>
                          <span>{text(milestone.body)}</span>
                          <em>{text(milestone.label)}</em>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </Accordion>
          </section>
        </div>
      </Surface>

      {contextSlot
        ? createPortal(
            <div className="orbit-rm__context">
              <section aria-label={t("roadmap.context.title")} className="orbit-block">
                <div className="orbit-block__head">
                  <span className="orbit-eyebrow">{t("roadmap.context.title")}</span>
                </div>
                <div className="orbit-list" data-testid="orbit-roadmap-context">
                  {ROADMAP_SECTIONS.map((section) => (
                    <ListRow
                      key={section}
                      onClick={() => focusSection(section)}
                      selected={focused === section}
                      subtitle={t(`roadmap.context.${section}Sub`)}
                      title={t(`roadmap.${section}.title`)}
                      trailing={
                        <span className="orbit-rm__context-count">
                          {sectionCount(narrative, section)}
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
