import type {
  StrategyCalculationView,
  StrategyEditView,
  StrategyMetrics,
  StrategyPit,
  StrategyPlanState,
  StrategyPlanView,
  StrategyServiceSteps,
  StrategyTimeline,
} from "../../../contract/generated/strategy";
import { strategy } from "../../i18n/strategy";

// Only reading aids: every number shown comes from the calculation. Nothing
// here recalculates a plan; it spells what the host sent.
const t = strategy.calc;
const fixed = (digits: number) =>
  new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
const upToOne = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });
const upToThree = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 3 });
const oneDecimal = fixed(1);
const twoDecimals = fixed(2);

export const liters = (value: number) => `${upToOne.format(value)} L`;
export const percent = (value: number) => `${upToOne.format(value)} %`;
export const lapsOf = (value: number) => `${twoDecimals.format(value)} v`;

// 21664 seconds → «6:01:04»
export function clock(totalSeconds: number) {
  const whole = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;
  const two = (value: number) => String(value).padStart(2, "0");
  return `${hours}:${two(minutes)}:${two(seconds)}`;
}

// 90.472 seconds → «1:30,472»
export function lapTime(seconds: number) {
  const milliseconds = Math.round(seconds * 1000);
  const minutes = Math.floor(milliseconds / 60000);
  const rest = ((milliseconds % 60000) / 1000).toFixed(3).padStart(6, "0");
  return `${minutes}:${rest.replace(".", ",")}`;
}

// «6 horas y 1 minuto»: what a screen reader says instead of the clock
export function durationWords(totalSeconds: number) {
  const minutesTotal = Math.floor(Math.max(0, totalSeconds) / 60);
  const hours = Math.floor(minutesTotal / 60);
  const minutes = minutesTotal % 60;
  if (!hours && !minutes) return t.time.lessThanMinute;
  return [hours && t.time.hours(hours), minutes && t.time.minutes(minutes)]
    .filter(Boolean)
    .join(" y ");
}

// «de 1 L en 1 L y de 1 % en 1 %»: the steps the solver really used
export function stepsText({ fuelLiters, vePercent }: StrategyServiceSteps) {
  return t.certificate.steps(
    fuelLiters === null ? "" : upToThree.format(fuelLiters),
    vePercent === null ? "" : upToThree.format(vePercent),
  );
}

export type Notice = {
  tone: "ok" | "warn" | "error";
  title: string;
  details: string[];
};

// The sentence under the plan: what the certificate does and does not say.
export function certificateNotice(result: StrategyCalculationView): Notice {
  const steps = stepsText(result.steps);
  const { certificate, reason, degraded } = result;
  const c = t.certificate;
  const because = reason ? c.reasons[reason] : "";
  if (certificate === "proven")
    return degraded
      ? { tone: "warn", title: c.coarse, details: [c.coarseDetail(steps)] }
      : { tone: "ok", title: c.proven, details: [c.provenDetail(steps)] };
  if (certificate === "no_solution")
    return { tone: "error", title: c.noSolution, details: [`${because}.`] };
  // not proven, or no certificate at all: there is a plan only if it has figures
  const hasPlan = result.metrics !== null;
  const details = [
    reason === "searchBudgetExhausted" && !hasPlan
      ? `${c.searchStopped}.`
      : `${because}.`,
  ];
  if (degraded) details.push(c.coarseLine(steps));
  return {
    tone: "warn",
    title: hasPlan ? c.partial : c.unfinished,
    details,
  };
}

export function planSubtitle(result: StrategyCalculationView) {
  const { metrics, timeline } = result;
  if (!metrics) return "";
  if (metrics.pitCount === 0) return t.done.noStops(metrics.laps);
  const stops = t.time.stops(metrics.pitCount);
  return timeline
    ? t.done.summary(t.time.stints(timeline.stints.length), stops, metrics.laps)
    : t.done.stopsOnly(stops, metrics.laps);
}

// What the Paradas figure says about the tyres of the stops it has.
export function tyresNote(pits: readonly StrategyPit[]) {
  const fresh = pits.filter(({ changeTyres }) => changeTyres).length;
  if (!pits.length) return "";
  if (fresh === pits.length) return t.figures.allTyres;
  return fresh === 0
    ? t.figures.noTyres
    : t.figures.someTyres(fresh, pits.length);
}

export function reserveNote(metrics: StrategyMetrics, finishLiters?: number) {
  return [
    t.figures.askedReserve(twoDecimals.format(metrics.fuelReserveRequiredLaps)),
    finishLiters === undefined ? "" : liters(finishLiters),
  ]
    .filter(Boolean)
    .join(" · ");
}

// «82,0 L · 100 %»; a resource the car does not use (0) is left out.
export function load(fuelLiters: number, vePercent: number) {
  const fuel = oneDecimal.format(fuelLiters);
  return [fuelLiters > 0 && `${fuel} L`, vePercent > 0 && percent(vePercent)]
    .filter(Boolean)
    .join(" · ");
}

// The load added in a stop: «+78 L · +99 %»
export function addedLoad(pit: StrategyPit) {
  return (
    [
      pit.fuelLiters > 0 && `+${liters(pit.fuelLiters)}`,
      pit.vePercent > 0 && `+${percent(pit.vePercent)}`,
    ]
      .filter(Boolean)
      .join(" · ") || t.noLoad
  );
}

export const reserveFigure = (value: number | null) =>
  value === null ? "—" : lapsOf(value);

// The timeline of the plan as it is edited: the stints and the stop laps of the
// schedule, with the amounts each stop had in the plan it started from.
export function scheduleTimeline(
  timeline: StrategyTimeline,
  edit: StrategyEditView | null,
): StrategyTimeline {
  if (
    !edit ||
    edit.stints.length !== timeline.stints.length ||
    edit.stops.length !== timeline.pits.length
  )
    return timeline;
  return {
    ...timeline,
    stints: edit.stints,
    pits: timeline.pits.map((pit, index) => ({
      ...pit,
      lap: edit.stops[index].lap,
    })),
  };
}

// The stops that are not on the lap the plan has: «Parada 2: de la 85 a la 86».
export function movedStops(
  timeline: StrategyTimeline | null,
  edit: StrategyEditView | null,
) {
  if (!timeline || !edit) return [];
  return edit.stops.flatMap((stop, index) => {
    const from = timeline.pits[index]?.lap;
    return from === undefined || from === stop.lap
      ? []
      : [{ stop: index + 1, from, to: stop.lap }];
  });
}

export function editSummary(moves: ReturnType<typeof movedStops>) {
  const a = t.adjust;
  const [only] = moves;
  if (!only) return a.backAtStart;
  return moves.length === 1
    ? a.moved(only.stop, only.from, only.to)
    : a.movedMany(moves.length);
}

// The card of the Carrera tab: what the plan says in a line, or nothing.
export function planCard(plan: StrategyPlanView) {
  const { result } = plan;
  if (!result) return null;
  const c = t.card;
  const notice = certificateNotice(result);
  const certificate = `${notice.title}.`;
  if (result.certificate === "no_solution")
    return { title: c.noSolution, certificate };
  if (!result.metrics) return { title: c.unfinished, certificate };
  if (plan.state === "calculating")
    return { title: c.recalculating, certificate: "" };
  if (plan.state === "edited") return { title: c.modified, certificate: "" };
  return {
    title: c.done(
      clock(result.metrics.totalSeconds),
      t.time.stops(result.metrics.pitCount),
    ),
    certificate,
  };
}

// The plan on view is a recalculated one of this session, and no adjustment is
// pending on it (the warning of the editor says it then): it is not in the file.
export function isTrialPlan(plan: StrategyPlanView, recalculated: boolean) {
  return (
    recalculated &&
    (plan.state === "calculated" || plan.state === "partial") &&
    plan.result?.metrics != null
  );
}

// The line for the single role="status": says what changed in the plan since
// the screen last saw it. A plan that was already there on opening is silent.
// `hadResult`: the plan before already had a result, so a calculation that ends
// is a recalculation.
export function planAnnouncement(
  plan: StrategyPlanView,
  before: StrategyPlanState | undefined,
  hadResult = false,
): string | undefined {
  const a = t.announce;
  if (plan.state === "calculating") {
    if (before === "calculating") return undefined;
    return plan.result ? a.recalculating : a.calculating;
  }
  if (before !== "calculating") return undefined;
  const recalculated = hadResult;
  switch (plan.state) {
    case "uncalculated":
      return a.cancelled;
    case "error":
      return a.failed;
    case "edited":
      // a cancelled recalculation; one that failed says why in its own alert
      return plan.edit?.error ? undefined : a.recalcCancelled;
    case "calculated":
    case "partial": {
      const { result } = plan;
      if (!result) return undefined;
      if (result.certificate === "no_solution") return a.noSolution;
      if (!result.metrics) return a.unfinished;
      if (result.certificate !== "proven")
        return recalculated ? a.recalculatedUnproven : a.unproven;
      const duration = durationWords(result.metrics.totalSeconds);
      const stops = t.time.stops(result.metrics.pitCount);
      return recalculated
        ? a.recalculated(duration, stops)
        : a.done(duration, stops);
    }
    default:
      return undefined;
  }
}
