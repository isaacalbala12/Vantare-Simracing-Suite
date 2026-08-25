import { useMemo, useState } from "react";
import {
  Accordion,
  Button,
  Chip,
  HorizontalTimeline,
  Note,
  StatRow,
  StatTile,
  Surface,
  type TimelineBlock,
} from "../../ui/orbit";
import type {
  StrategyOrbitCalculatedPlanV1,
  StrategyOrbitCalculationComparisonV1,
  StrategyPlanningInputsV2,
} from "../../strategy/strategy-application-client";
import { formatMessage } from "../orbit/format-message";
import { clockTime, type StrategyEvent, type StrategyVariant } from "./strategy-orbit-model";
import { strategyInputProvenance, type StrategyInputProvenanceView } from "./strategy-input-provenance";
import { StrategyInfographicCard } from "./StrategyInfographicCard";

type T = (key: string) => string;

interface StrategyAnalysisPanelProps {
  active: StrategyVariant;
  classes: readonly string[];
  comparison?: StrategyOrbitCalculationComparisonV1;
  eco?: StrategyVariant;
  ecoPlan?: StrategyOrbitCalculatedPlanV1;
  event: StrategyEvent;
  eventProvenance: "derived" | "manual" | "reference";
  plan: StrategyOrbitCalculatedPlanV1;
  planningInputs?: StrategyPlanningInputsV2;
  start: Date;
  t: T;
}

type TimelineRow = { name: string; own: boolean };

function classPaceReasonLabel(reason: string | undefined, t: T): string {
  return reason === "no_class_pace_source"
    ? t("strategy.inputs.reason.no_class_pace_source")
    : t("strategy.inputs.reason.unavailable");
}

function Provenance({ kind, t }: { kind: StrategyInputProvenanceView["kind"] | "derived"; t: T }) {
  return <Chip caseNormal>{t(`strategy.inputs.chip.${kind}`)}</Chip>;
}

function PlanStats({ label, plan, t, variant }: { label: string; plan?: StrategyOrbitCalculatedPlanV1; t: T; variant: "main" | "eco" }) {
  const source = t("strategy.analysis.engineDerived");
  // El aviso ya no es un umbral inventado aqui: el motor exige el margen de
  // producto (ISA-832) y dice si el plan lo cumple. Llegar por debajo no es un
  // plan, es una apuesta, y hay que decirlo con la cifra delante.
  const tightFinish = plan !== undefined && !plan.reserveSatisfied;
  return (
    <section className="orbit-analysis__plan-row" data-empty={plan ? undefined : "true"} data-plan={variant}>
      <header>
        <div><span>{label}</span>{plan ? <Provenance kind="derived" t={t} /> : null}</div>
        {!plan ? <small>{t("strategy.analysis.noEcoReason")}</small> : null}
      </header>
      <StatRow>
        <StatTile label={t("strategy.analysis.totalLaps")} sub={plan ? source : t("strategy.analysis.noEcoShort")} value={plan?.totalLaps ?? "—"} />
        <StatTile label={t("strategy.analysis.maxStint")} sub={plan ? source : t("strategy.analysis.noEcoShort")} value={plan?.maxLaps ?? "—"} />
        <StatTile label={t("strategy.analysis.stops")} sub={plan ? source : t("strategy.analysis.noEcoShort")} value={plan?.stops ?? "—"} />
        <StatTile label={t("strategy.analysis.startFuel")} sub={plan ? source : t("strategy.analysis.noEcoShort")} unit={plan ? "L" : undefined} value={plan ? plan.startFuelLiters.toFixed(1) : "—"} />
        <StatTile
          label={t("strategy.analysis.finishFuel")}
          sub={plan
            ? `${plan.reserveLaps.toFixed(2)} ${t("strategy.analysis.reserveLaps")} · ${formatMessage(t("strategy.analysis.reserveRequired"), { n: plan.reserveRequiredLaps.toFixed(2) })}`
            : t("strategy.analysis.noEcoShort")}
          tone={tightFinish ? "hot" : "neutral"}
          unit={plan ? "L" : undefined}
          value={plan ? plan.finishFuelLiters.toFixed(1) : "—"}
        />
      </StatRow>
      {tightFinish && plan ? (
        <Note title={t("strategy.analysis.reserveShortTitle")}>
          {formatMessage(t("strategy.analysis.reserveShortReason"), {
            got: plan.reserveLaps.toFixed(2),
            want: plan.reserveRequiredLaps.toFixed(2),
          })}
        </Note>
      ) : null}
    </section>
  );
}

function sourceLine(label: string, unit: string, view: StrategyInputProvenanceView, t: T): string {
  const value = view.value === undefined ? "—" : `${view.value} ${unit}`.trim();
  const cause = view.kind === "missing" ? `; ${t("strategy.analysis.cause")}: ${view.reason ?? "unavailable"}` : "";
  return `${label}: ${value} [${t(`strategy.inputs.chip.${view.kind}`)}${cause}]`;
}

export function StrategyAnalysisPanel({
  active, classes, comparison, eco, ecoPlan, event, eventProvenance, plan, planningInputs, start, t,
}: StrategyAnalysisPanelProps) {
  const [copied, setCopied] = useState(false);
  const ownClass = event.vehicleClass || t("strategy.analysis.ownClass");
  const classNames = classes.length ? [...new Set(classes)] : [ownClass];
  if (!classNames.includes(ownClass)) classNames.push(ownClass);
  const rows: TimelineRow[] = classNames.map((name) => ({ name, own: name === ownClass }));
  const classPace = planningInputs?.projection?.classPace;
  const classPaceSeconds = (className: string): number | undefined => {
    if (classPace?.presence !== "valid") return undefined;
    const value = classPace.byClassName[className];
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
  };
  const otherRows = rows.filter((row) => !row.own);
  const missingClassPaceRows = otherRows.filter((row) => classPaceSeconds(row.name) === undefined);
  const classPaceMissingReason = classPaceReasonLabel(classPace?.reason, t);
  const spanMin = Math.ceil(event.durationMin * 1.02);
  const timelineBlocks = (row: TimelineRow): TimelineBlock[] => {
    if (!row.own) return [];
    const primary = plan.stints.map((stint) => ({
      id: `main-${stint.i}`,
      start: new Date(start.getTime() + stint.start * 1000),
      durationMin: (stint.end - stint.start) / 60,
      color: "var(--orbit-carmine)",
      ink: "light" as const,
      label: `${stint.laps}v`,
      tip: `${t("strategy.analysis.stint")} ${stint.i + 1} · ${stint.lap0}–${stint.lap1}`,
    }));
    const pits = plan.stopDetails.map((stop) => ({
      id: `pit-${stop.index}`,
      start: new Date(start.getTime() + plan.stints[stop.index].end * 1000),
      durationMin: stop.pitLossSeconds / 60,
      color: "var(--orbit-ember)",
      label: t("strategy.pit.label"),
      tip: `${t("strategy.analysis.lap")} ${stop.lap}`,
    }));
    const saving = ecoPlan && eco?.id !== active.id ? ecoPlan.stints.map((stint) => ({
      id: `eco-${stint.i}`,
      start: new Date(start.getTime() + stint.start * 1000),
      durationMin: (stint.end - stint.start) / 60,
      color: "transparent",
      label: `${stint.laps}v`,
      tip: `${t("strategy.analysis.savingPlan")} · ${t("strategy.analysis.stint")} ${stint.i + 1}`,
      variant: "outline" as const,
    })) : [];
    return [...primary, ...pits, ...saving];
  };

  const pace = strategyInputProvenance(planningInputs, "base_pace_seconds", plan.avgPace);
  const fuel = strategyInputProvenance(planningInputs, "fuel_per_lap_liters", plan.avgFuel);
  const tank = strategyInputProvenance(planningInputs, "tank_liters", event.tankL);
  const pit = strategyInputProvenance(planningInputs, "pit_loss_seconds", event.pitS);
  const log = useMemo(() => {
    const lines = [
      t("strategy.analysis.logHeader"),
      `${t("strategy.analysis.plan")}: ${active.name} [${t("strategy.inputs.chip.derived")}]`,
      `${t("strategy.analysis.duration")}: ${event.durationMin} min [${t(`strategy.inputs.chip.${eventProvenance}`)}]`,
      sourceLine(t("strategy.analysis.pace"), "s/v", pace, t),
      sourceLine(t("strategy.analysis.consumption"), "L/v", fuel, t),
      sourceLine(t("strategy.analysis.capacity"), "L", tank, t),
      sourceLine(t("strategy.analysis.pitLoss"), "s", pit, t),
      "",
      `${t("strategy.analysis.result")}: ${plan.totalLaps} v · ${plan.stops} ${t("strategy.analysis.stops")} · ${clockTime(plan.total)} [${t("strategy.inputs.chip.derived")}]`,
      ...plan.stopDetails.map((stop) => `${t("strategy.analysis.stop")} ${stop.index + 1}: ${t("strategy.analysis.lap")} ${stop.lap}; ${stop.fuelInLiters.toFixed(1)} L → ${stop.fuelOutLiters.toFixed(1)} L; ${stop.pitLossSeconds.toFixed(1)} s [${t("strategy.inputs.chip.derived")}]`),
    ];
    if (ecoPlan) lines.push(`${t("strategy.analysis.savingPlan")}: ${ecoPlan.totalLaps} v · ${ecoPlan.stops} ${t("strategy.analysis.stops")} · ${clockTime(ecoPlan.total)} [${t("strategy.inputs.chip.derived")}]`);
    return lines.join("\n");
  }, [active.name, ecoPlan, event.durationMin, eventProvenance, fuel, pace, pit, plan, t, tank]);

  const delta = comparison?.totalDeltaSeconds;
  const deltaText = delta === undefined
    ? t("strategy.analysis.noComparison")
    : `${delta >= 0 ? "+" : "−"}${clockTime(Math.abs(delta))} ${delta >= 0 ? t("strategy.analysis.slower") : t("strategy.analysis.faster")}`;

  return (
    <div className="orbit-analysis" data-testid="orbit-strategy-analysis">
      <Surface className="orbit-analysis__plans" meta={t("strategy.analysis.sameColumns")} title={t("strategy.analysis.keyFigures")}>
        <PlanStats label={t("strategy.analysis.recommendedPlan")} plan={plan} t={t} variant="main" />
        <PlanStats label={eco?.id === active.id ? t("strategy.analysis.ecoIsRecommended") : t("strategy.analysis.savingPlan")} plan={ecoPlan} t={t} variant="eco" />
      </Surface>

      <Surface meta={ecoPlan ? t("strategy.analysis.timelineHint") : t("strategy.analysis.timelineNoEco")} title={t("strategy.analysis.timelineTitle")}>
        <HorizontalTimeline
          blocks={timelineBlocks}
          className="orbit-analysis__timeline"
          headWidth={150}
          label={t("strategy.analysis.timelineTitle")}
          rowLabel={(row) => <span
            className="orbit-analysis__class"
            data-class-name={row.name}
            data-class-pace-seconds={classPaceSeconds(row.name)}
            data-own={row.own ? "true" : undefined}
          ><i aria-hidden="true" />{row.name}</span>}
          rows={rows}
          spanMin={spanMin}
          start={start}
          tickEveryMin={Math.max(15, Math.min(60, Math.round(event.durationMin / 6 / 15) * 15))}
        />
        {missingClassPaceRows.length ? <Note title={t("strategy.analysis.classPaceMissingTitle")}>{classPaceMissingReason}</Note> : null}
      </Surface>

      <Surface title={t("strategy.analysis.multiclassTitle")}>
        {rows.length === 1 ? (
          <Note title={t("strategy.analysis.monoclassTitle")}>{t("strategy.analysis.monoclassReason")}</Note>
        ) : (
          <>
            <div className="orbit-analysis__leader">
              <span>{t("strategy.analysis.leaderLaps")}<b>—</b></span>
              <span>{t("strategy.analysis.leaderStops")}<b>—</b></span>
              <small>{t("strategy.analysis.leaderMissingReason")}</small>
            </div>
            <div className="orbit-analysis__table-wrap">
              <table className="orbit-analysis__table">
                <thead><tr><th>{t("strategy.analysis.class")}</th><th>{t("strategy.analysis.firstCatch")}</th><th>{t("strategy.analysis.frequency")}</th><th>{t("strategy.analysis.totalPasses")}</th></tr></thead>
                <tbody>{otherRows.map((row) => {
                  const paceSeconds = classPaceSeconds(row.name);
                  return <tr data-class-name={row.name} data-class-pace-seconds={paceSeconds} key={row.name}>
                    <th>{row.name}</th><td colSpan={3}>{paceSeconds === undefined ? classPaceMissingReason : "—"}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          </>
        )}
      </Surface>

      <section className="orbit-analysis__section" aria-labelledby="orbit-analysis-stops">
        <header><div><span className="orbit-eyebrow">{t("strategy.analysis.sequence")}</span><h3 id="orbit-analysis-stops">{t("strategy.analysis.stopPlan")}</h3></div><Provenance kind="derived" t={t} /></header>
        {plan.stopDetails.length ? <div className="orbit-analysis__stops">{plan.stopDetails.map((stop) => {
          const tyres = Object.values(active.tyres[stop.index + 1] ?? {}).filter(Boolean).length;
          return <article className="orbit-analysis__stop" key={stop.index} data-testid={`orbit-analysis-stop-${stop.index}`}>
            <header><span>{String(stop.index + 1).padStart(2, "0")}</span><div><b>{t("strategy.analysis.stop")} {stop.index + 1}</b><small>{t("strategy.analysis.lap")} {stop.lap}</small></div></header>
            <dl>
              <div><dt>{t("strategy.analysis.levelIn")}</dt><dd>{stop.fuelInLiters.toFixed(1)} L</dd></div>
              <div><dt>{t("strategy.analysis.levelOut")}</dt><dd>{stop.fuelOutLiters.toFixed(1)} L</dd></div>
              <div><dt>{t("strategy.analysis.pitTime")}</dt><dd>{stop.pitLossSeconds.toFixed(1)} s</dd></div>
            </dl>
            {stop.pitBreakdownAvailable ? <dl className="orbit-analysis__breakdown">
              <div><dt>{t("strategy.analysis.pitTransit")}</dt><dd>{stop.pitTransitSeconds.toFixed(1)} s</dd></div>
              <div><dt>{t("strategy.analysis.pitServices")}</dt><dd>{stop.pitServiceSeconds.toFixed(1)} s</dd></div>
              <div><dt>{t("strategy.analysis.pitOverlap")}</dt><dd>−{stop.pitOverlapSeconds.toFixed(1)} s</dd></div>
            </dl> : <p>{t("strategy.analysis.pitBreakdownReason")}</p>}
            <footer><Chip caseNormal>{plan.stints[stop.index + 1]?.savingLevel && plan.stints[stop.index + 1].savingLevel !== "none" ? t("strategy.analysis.savingYes") : t("strategy.analysis.savingNo")}</Chip><Chip caseNormal>{tyres ? `${tyres} ${t("strategy.analysis.tyres")}` : t("strategy.analysis.noTyreAdjustment")}</Chip></footer>
          </article>;
        })}</div> : <Note title={t("strategy.analysis.noStopsTitle")}>{t("strategy.analysis.noStopsReason")}</Note>}
      </section>

      <Surface className="orbit-analysis__times" meta={deltaText} title={t("strategy.analysis.timesTitle")}>
        <div className="orbit-analysis__time-grid">
          {[{ label: t("strategy.analysis.recommendedPlan"), value: plan }, ...(ecoPlan && eco?.id !== active.id ? [{ label: t("strategy.analysis.savingPlan"), value: ecoPlan }] : [])].map((item) => <article key={item.label}><header><b>{item.label}</b><Provenance kind="derived" t={t} /></header><dl><div><dt>{t("strategy.analysis.drivingTime")}</dt><dd>{clockTime(item.value.drivingSeconds)}</dd></div><div><dt>{t("strategy.analysis.boxTime")}</dt><dd>{clockTime(item.value.pitSeconds)}</dd></div><div><dt>{t("strategy.analysis.totalTime")}</dt><dd>{clockTime(item.value.total)}</dd></div></dl></article>)}
        </div>
        {!ecoPlan ? <Note title={t("strategy.analysis.noEcoTitle")}>{t("strategy.analysis.noEcoReason")}</Note> : null}
      </Surface>

      <StrategyInfographicCard
        event={event}
        inputs={[
          { label: t("strategy.analysis.pace"), unit: "s/v", view: pace },
          { label: t("strategy.analysis.consumption"), unit: "L", view: fuel },
          { label: t("strategy.analysis.capacity"), unit: "L", view: tank },
          { label: t("strategy.analysis.pitLoss"), unit: "s", view: pit },
        ]}
        plan={plan}
        planName={active.name}
        sessionCount={planningInputs?.projection?.sourceSessions?.length}
        start={start}
        subtitle={event.subtitle.includes(event.vehicleClass) ? event.subtitle : [event.vehicleClass, event.subtitle].filter(Boolean).join(" · ")}
        t={t}
        title={event.name}
      />

      <Accordion className="orbit-analysis__log" summary={t("strategy.analysis.logSummary")} title={t("strategy.analysis.logTitle")}>
        <div className="orbit-analysis__log-actions"><Button onClick={() => void navigator.clipboard.writeText(log).then(() => setCopied(true))} size="sm" variant="ghost">{copied ? t("strategy.analysis.copied") : t("strategy.analysis.copy")}</Button></div>
        <pre data-testid="orbit-analysis-log">{log}</pre>
      </Accordion>
    </div>
  );
}
