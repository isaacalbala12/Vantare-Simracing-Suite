import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../i18n/I18nProvider";
import {
  Button,
  ListRow,
  Note,
  Seg,
  StatRow,
  StatTile,
  SubtleStatus,
  Surface,
  Trace,
  TrackMap,
} from "../../ui/orbit";
import { formatMessage } from "../orbit/format-message";
import { useOrbitSlot } from "../orbit/use-orbit-slot";
import {
  DEMO_CORNERS,
  DEMO_TRACK,
  demoBands,
  demoChannels,
  demoDeltaSeries,
  demoInsights,
  demoSectors,
  demoSegments,
  demoTotalDelta,
  formatDelta,
  readoutAt,
  REFERENCE_SCALE,
  TELEMETRY_REFERENCES,
  type TelemetryReference,
  type TelemetrySession,
} from "./telemetry-orbit-model";
import {
  isTelemetryDemoEnabled,
  loadWailsTelemetrySessions,
  resolveTelemetrySessions,
} from "./telemetry-orbit-source";
import "../../styles/orbit-telemetry.css";

export const TELEMETRY_CONTEXT_SLOT_ID = "orbit-telemetry-context-slot";

/** Alturas fijas de las cuatro trazas (`06 § Telemetría`). */
const TRACE_HEIGHT = { speed: 150, pedals: 100, steer: 80, delta: 110 } as const;

export interface TelemetryOrbitPageProps {
  /** Fuerza el modo demo en tests y harness; por defecto manda el flag. */
  demo?: boolean;
  /** Inyección focal para tests; producción usa el catálogo Wails real. */
  loadSessions?: () => Promise<TelemetrySession[]>;
}

type TelemetryCatalogResult = {
  readonly attempt: number;
  readonly loader: TelemetryOrbitPageProps["loadSessions"];
  readonly locale: string;
  readonly sessions: TelemetrySession[];
  readonly state: "loading" | "ready" | "error";
};

/**
 * Telemetría de Command Orbit (`15-briefings/09-telemetria.md`).
 *
 * El catálogo real llega precocinado desde Analysis por el query ya publicado
 * en Wails. La pantalla no abre archivos ni recibe páginas DuckDB. Mapa,
 * comparación y trazas permanecen ausentes hasta que TA-04/TA-06 demuestren
 * distancia y referencia. El demo sigue siendo explícito y sintético.
 */
export function TelemetryOrbitPage({ demo, loadSessions }: TelemetryOrbitPageProps) {
  const { locale, t } = useI18n();
  const contextSlot = useOrbitSlot(TELEMETRY_CONTEXT_SLOT_ID);
  const stackRef = useRef<HTMLDivElement | null>(null);

  const demoOn = demo ?? isTelemetryDemoEnabled();
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const [catalogResult, setCatalogResult] = useState<TelemetryCatalogResult>({
    attempt: 0,
    loader: loadSessions,
    locale,
    sessions: [],
    state: "loading",
  });
  useEffect(() => {
    if (demoOn) return;
    let current = true;
    const load = loadSessions ?? (() => loadWailsTelemetrySessions(locale));
    void load().then(
      (sessions) => {
        if (!current) return;
        setCatalogResult({
          attempt: catalogAttempt,
          loader: loadSessions,
          locale,
          sessions,
          state: "ready",
        });
      },
      () => {
        if (!current) return;
        setCatalogResult({
          attempt: catalogAttempt,
          loader: loadSessions,
          locale,
          sessions: [],
          state: "error",
        });
      },
    );
    return () => {
      current = false;
    };
  }, [catalogAttempt, demoOn, loadSessions, locale]);
  const resultIsCurrent = catalogResult.attempt === catalogAttempt
    && catalogResult.loader === loadSessions
    && catalogResult.locale === locale;
  const catalogState = demoOn
    ? "ready"
    : resultIsCurrent
      ? catalogResult.state
      : "loading";
  const source = useMemo(
    () => resolveTelemetrySessions(
      demoOn,
      resultIsCurrent ? catalogResult.sessions : [],
    ),
    [catalogResult.sessions, demoOn, resultIsCurrent],
  );
  const synthetic = source.synthetic;

  const [reference, setReference] = useState<TelemetryReference>("best");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [axis, setAxis] = useState<"distance" | "time">("distance");

  const scale = REFERENCE_SCALE[reference];
  const mine = useMemo(() => (synthetic ? demoChannels(true) : null), [synthetic]);
  const ref = useMemo(() => (synthetic ? demoChannels(false) : null), [synthetic]);
  const deltaSeries = useMemo(
    () => (synthetic ? demoDeltaSeries(scale) : []),
    [scale, synthetic],
  );
  const segments = useMemo(() => (synthetic ? demoSegments(scale) : []), [scale, synthetic]);
  const insights = useMemo(() => (synthetic ? demoInsights(scale) : []), [scale, synthetic]);
  const sectors = useMemo(() => (synthetic ? demoSectors(scale) : []), [scale, synthetic]);
  const bands = useMemo(() => (synthetic ? demoBands() : []), [synthetic]);

  const session = source.sessions.find((item) => item.id === sessionId) ?? source.sessions[0];
  const mode = synthetic
    ? "demo"
    : catalogState === "loading"
      ? "loading"
      : catalogState === "error"
        ? "error"
        : source.sessions.length > 0
          ? "real"
          : "empty";
  const realCatalogSession = !synthetic && catalogState === "ready" && Boolean(session);
  const unavailableBody = catalogState === "error"
    ? t("telemetry.error.body")
    : realCatalogSession
      ? t("telemetry.analysis.pending")
      : t("telemetry.empty.body");

  const focusCorner = useCallback(
    (id: string) => {
      const corner = DEMO_CORNERS.find((item) => item.name === id);
      if (!corner) return;
      setSelected(id);
      setCursor(corner.pos);
    },
    [],
  );

  const onStackMove = useCallback(
    (event: { clientX: number }) => {
      const node = stackRef.current;
      if (!node || !mine) return;
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0) return;
      const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      setCursor(x);
    },
    [mine],
  );

  const readout =
    cursor === null || !mine
      ? t("telemetry.traces.cursorEmpty")
      : (() => {
          const value = readoutAt(mine, cursor);
          return formatMessage(t("telemetry.traces.cursor"), {
            meters: value.meters,
            speed: value.speed,
          });
        })();

  const totalDelta = synthetic ? demoTotalDelta(scale) : 0;
  const none = t("telemetry.kpi.none");

  return (
    <div
      className="orbit-tel"
      data-mode={mode}
      data-testid="orbit-telemetry"
    >
      <header className="orbit-tel__head">
        <div className="orbit-tel__head-copy">
          <span className="orbit-eyebrow">{t("telemetry.eyebrow")}</span>
          <h2 data-testid="orbit-telemetry-title">
            {session
              ? formatMessage(t("telemetry.title"), { track: session.track, car: session.car })
              : t("telemetry.titleEmpty")}
          </h2>
          <p>{t("telemetry.lead")}</p>
        </div>
        <div className="orbit-tel__actions">
          <Seg<TelemetryReference>
            label={t("telemetry.refs.label")}
            onChange={setReference}
            options={TELEMETRY_REFERENCES.map((value) => ({
              value,
              label: t(`telemetry.refs.${value}`),
              disabled: !synthetic,
              title: !synthetic ? t("telemetry.refs.unavailable") : undefined,
            }))}
            value={reference}
          />
          <span data-testid="orbit-telemetry-status">
            <SubtleStatus tone={synthetic ? "attn" : "neutral"}>
              {synthetic
                ? t("telemetry.status.synthetic")
                : catalogState === "loading"
                  ? t("telemetry.status.loading")
                  : catalogState === "error"
                    ? t("telemetry.status.error")
                : source.sessions.length > 0
                  ? t("telemetry.status.real")
                  : t("telemetry.status.empty")}
            </SubtleStatus>
          </span>
        </div>
      </header>

      <StatRow className="orbit-tel__stats">
        <StatTile
          label={t("telemetry.kpi.lap")}
          sub={
            synthetic
              ? formatMessage(t("telemetry.kpi.lapSub"), {
                  lap: 9,
                  laps: 12,
                  optimal: t("telemetry.demo.optimal"),
                })
              : realCatalogSession
                ? t("telemetry.kpi.pendingSub")
                : t("telemetry.kpi.noneSub")
          }
          value={synthetic ? t("telemetry.demo.lap") : none}
        />
        <StatTile
          label={t("telemetry.kpi.delta")}
          sub={
            synthetic
              ? formatMessage(t("telemetry.kpi.deltaSub"), {
                  reference: t("telemetry.demo.reference"),
                  label: t("telemetry.demo.referenceLabel"),
                })
              : realCatalogSession
                ? t("telemetry.kpi.pendingSub")
                : t("telemetry.kpi.noneSub")
          }
          tone={synthetic ? "hot" : "neutral"}
          unit={synthetic ? t("telemetry.traces.deltaUnit") : undefined}
          value={
            synthetic ? (
              <span data-testid="orbit-telemetry-delta">{formatDelta(totalDelta, 3)}</span>
            ) : (
              none
            )
          }
        />
        <StatTile
          label={t("telemetry.kpi.sectors")}
          sub={
            synthetic
              ? sectors.map((sector) => formatDelta(sector.delta)).join(" · ")
              : realCatalogSession
                ? t("telemetry.kpi.pendingSub")
                : t("telemetry.kpi.noneSub")
          }
          value={
            synthetic ? (
              <span className="orbit-tel__sectors" data-testid="orbit-telemetry-sectors">
                {sectors.map((sector) => (
                  <b data-tone={sector.tone} key={sector.id}>
                    {sector.id}
                  </b>
                ))}
              </span>
            ) : (
              none
            )
          }
        />
        <StatTile
          label={t("telemetry.kpi.consistency")}
          sub={
            synthetic
              ? formatMessage(t("telemetry.kpi.consistencySub"), { good: 8, laps: 12 })
              : realCatalogSession
                ? t("telemetry.kpi.pendingSub")
                : t("telemetry.kpi.noneSub")
          }
          tone={synthetic ? "ok" : "neutral"}
          unit={synthetic ? "%" : undefined}
          value={synthetic ? "94" : none}
        />
      </StatRow>

      <div className="orbit-tel__grid">
        <Surface
          aria-label={t("telemetry.map.title")}
          className="orbit-tel__map"
          meta={t("telemetry.map.meta")}
          title={t("telemetry.map.title")}
        >
          {synthetic ? (
            <>
              <div className="orbit-tel__map-wrap">
                <TrackMap
                  cursor={cursor ?? undefined}
                  label={t("telemetry.map.title")}
                  onSegment={focusCorner}
                  path={DEMO_TRACK}
                  segments={segments}
                  selected={selected}
                />
              </div>
              <div className="orbit-tel__legend">
                <span data-tone="gain">
                  <i aria-hidden="true" />
                  {t("telemetry.map.gain")}
                </span>
                <span data-tone="flat">
                  <i aria-hidden="true" />
                  {t("telemetry.map.neutral")}
                </span>
                <span data-tone="loss">
                  <i aria-hidden="true" />
                  {t("telemetry.map.loss")}
                </span>
                <span className="orbit-tel__legend-hint">{t("telemetry.map.hint")}</span>
              </div>
            </>
          ) : (
            <p className="orbit-tel__empty" data-testid="orbit-telemetry-map-empty">
              {realCatalogSession ? unavailableBody : t("telemetry.map.empty")}
            </p>
          )}
        </Surface>

        <Surface
          aria-label={t("telemetry.insights.title")}
          className="orbit-tel__insights"
          fill
          meta={t("telemetry.insights.meta")}
          title={t("telemetry.insights.title")}
        >
          {insights.length > 0 ? (
            <div className="orbit-tel__insight-list" data-testid="orbit-telemetry-insights">
              {insights.map((insight) => (
                <button
                  className="orbit-tel-insight"
                  data-on={selected === insight.id ? "true" : undefined}
                  data-testid={`orbit-telemetry-insight-${insight.id}`}
                  data-tone={insight.tone}
                  key={insight.id}
                  onClick={() => focusCorner(insight.id)}
                  type="button"
                >
                  <span className="orbit-tel-insight__ic">{insight.corner}</span>
                  <span className="orbit-tel-insight__copy">
                    <b>
                      {formatMessage(t(`telemetry.insights.${insight.tone}`), {
                        corner: insight.corner,
                      })}
                    </b>
                    <span>{t(insight.whyKey)}</span>
                  </span>
                  <span className="orbit-tel-insight__dv">
                    {formatDelta(insight.delta)} {t("telemetry.traces.deltaUnit")}
                    <small>{insight.meters} m</small>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="orbit-tel__empty" data-testid="orbit-telemetry-insights-empty">
              {synthetic ? t("telemetry.insights.empty") : unavailableBody}
            </p>
          )}
        </Surface>

        <Surface
          actions={
            <Seg<"distance" | "time">
              label={t("telemetry.traces.axis")}
              // El eje temporal necesita la marca de tiempo por muestra, que la
              // fuente todavía no expone: la opción queda deshabilitada con el
              // motivo y el manejador es real, no un `undefined` mudo (D-94).
              onChange={setAxis}
              options={[
                {
                  value: "distance",
                  label: t("telemetry.traces.distance"),
                  disabled: !synthetic,
                  title: !synthetic ? t("telemetry.refs.unavailable") : undefined,
                },
                {
                  value: "time",
                  label: t("telemetry.traces.time"),
                  disabled: true,
                  title: t("telemetry.traces.timeDisabled"),
                },
              ]}
              value={axis}
            />
          }
          aria-label={t("telemetry.traces.title")}
          className="orbit-tel__traces"
          fill
          meta={<span data-testid="orbit-telemetry-cursor">{readout}</span>}
          title={t("telemetry.traces.title")}
        >
          {mine && ref ? (
            <>
              <div
                className="orbit-tel__stack"
                data-testid="orbit-telemetry-stack"
                onMouseMove={onStackMove}
                ref={stackRef}
              >
                <Trace
                  bands={bands}
                  channel="speed"
                  cursor={cursor ?? undefined}
                  height={TRACE_HEIGHT.speed}
                  mine={mine.speed}
                  reference={ref.speed}
                  title={t("telemetry.traces.speed")}
                  unit={t("telemetry.traces.speedUnit")}
                />
                <Trace
                  bands={bands}
                  channel="pedals"
                  cursor={cursor ?? undefined}
                  extra={mine.brake}
                  height={TRACE_HEIGHT.pedals}
                  mine={mine.throttle}
                  title={t("telemetry.traces.pedals")}
                  unit={t("telemetry.traces.pedalsUnit")}
                />
                <Trace
                  bands={bands}
                  channel="steer"
                  cursor={cursor ?? undefined}
                  height={TRACE_HEIGHT.steer}
                  mine={mine.steer}
                  reference={ref.steer}
                  title={t("telemetry.traces.steer")}
                  unit={t("telemetry.traces.steerUnit")}
                />
                <Trace
                  bands={bands}
                  channel="delta"
                  cursor={cursor ?? undefined}
                  height={TRACE_HEIGHT.delta}
                  mine={deltaSeries}
                  title={t("telemetry.traces.delta")}
                  unit={t("telemetry.traces.deltaUnit")}
                />
              </div>
              <div className="orbit-tel__legend orbit-tel__legend--traces">
                <span data-tone="mine">
                  <i aria-hidden="true" />
                  {t("telemetry.traces.mine")}
                </span>
                <span data-tone="ref">
                  <i aria-hidden="true" />
                  {t("telemetry.traces.ref")}
                </span>
                <span data-tone="gain">
                  <i aria-hidden="true" />
                  {t("telemetry.traces.throttle")}
                </span>
                <span data-tone="loss">
                  <i aria-hidden="true" />
                  {t("telemetry.traces.brake")}
                </span>
              </div>
            </>
          ) : (
            <p className="orbit-tel__empty" data-testid="orbit-telemetry-traces-empty">
              {realCatalogSession ? unavailableBody : t("telemetry.traces.empty")}
            </p>
          )}
        </Surface>
      </div>

      {synthetic ? (
        <Note className="orbit-tel__note" title={t("telemetry.status.synthetic")}>
          {t("telemetry.demo.note")}
        </Note>
      ) : catalogState === "error" ? (
        <Note className="orbit-tel__note" title={t("telemetry.status.error")}>
          {t("telemetry.error.body")} {" "}
          <Button onClick={() => setCatalogAttempt((attempt) => attempt + 1)} size="sm">
            {t("telemetry.error.retry")}
          </Button>
        </Note>
      ) : (
        <Note className="orbit-tel__note">{unavailableBody}</Note>
      )}

      {contextSlot
        ? createPortal(
            <div className="orbit-tel__context">
              <section aria-label={t("telemetry.context.title")} className="orbit-block">
                <div className="orbit-block__head">
                  <span className="orbit-eyebrow">{t("telemetry.context.title")}</span>
                  <span className="orbit-tel__context-count">{source.sessions.length}</span>
                </div>
                <div className="orbit-list" data-testid="orbit-telemetry-sessions">
                  {source.sessions.map((item) => (
                    <ListRow
                      key={item.id}
                      onClick={() => setSessionId(item.id)}
                      selected={item.id === session?.id}
                      subtitle={formatMessage(t("telemetry.context.session"), {
                        when: item.when,
                        laps: item.laps ?? none,
                        best: item.best ?? none,
                      })}
                      title={`${item.track} · ${item.car}`}
                    />
                  ))}
                  {source.sessions.length === 0 ? (
                    <p className="orbit-tel__empty" data-testid="orbit-telemetry-sessions-empty">
                      {t("telemetry.context.empty")}
                    </p>
                  ) : null}
                </div>
              </section>
              <p className="orbit-tel__context-hint">{t("telemetry.context.hint")}</p>
            </div>,
            contextSlot,
          )
        : null}
    </div>
  );
}
