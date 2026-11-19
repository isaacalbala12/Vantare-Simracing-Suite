import type {
  StrategyAcceptedView,
  StrategyCalculationView,
  StrategyChange,
  StrategyCompare,
  StrategyEditView,
  StrategyField,
  StrategyMetrics,
  StrategyPit,
  StrategyPlanState,
  StrategyPlanView,
  StrategyServiceSteps,
  StrategyTimeline,
  StrategyUnreachable,
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

export type Tone = "neutral" | "ok" | "warn" | "error";
export type Tag = { tone: Tone; text: string };

// A plan that can be kept: the host refuses (`strategyNotAcceptable`) a plan with
// no figures or no calendar, and one still being adjusted or calculated.
function hasCalendar(result: StrategyCalculationView | null) {
  return (
    !!result?.metrics &&
    !!result.timeline &&
    (result.certificate === "proven" || result.certificate === "not_proven")
  );
}

// The plan on view is a finished proposal (not being adjusted, not calculating).
export function isProposalOnView(plan: StrategyPlanView) {
  return (
    (plan.state === "calculated" || plan.state === "partial") &&
    plan.result !== null
  );
}

// The proposal on view is the plan already accepted (same stints and stops).
export function isAcceptedOnView(plan: StrategyPlanView) {
  return isProposalOnView(plan) && plan.accepted?.compare?.same === true;
}

// The proposal on view is not the plan accepted before.
export function differsFromAccepted(plan: StrategyPlanView) {
  const compare = plan.accepted?.compare;
  return isProposalOnView(plan) && !!compare && !compare.same;
}

// Only the accepted plan is on view: no proposal, as when the strategy is opened.
export function isAcceptedOnly(plan: StrategyPlanView) {
  return (
    plan.accepted !== null &&
    plan.result === null &&
    (plan.state === "uncalculated" || plan.state === "pendingChanges")
  );
}

export function canAccept(plan: StrategyPlanView) {
  return (
    isProposalOnView(plan) &&
    hasCalendar(plan.result) &&
    !isAcceptedOnView(plan)
  );
}

// A proposal that needs no warning: proven, with the step of the form.
export function isCleanProposal(plan: StrategyPlanView) {
  return (
    canAccept(plan) &&
    plan.result?.certificate === "proven" &&
    !plan.result.degraded
  );
}

// 2 seconds → «2,0 s»; 75 seconds → «1 min 15 s»
export function secondsText(seconds: number) {
  const whole = Math.abs(seconds);
  // a minute is said from the whole seconds: 59,96 s is «1 min», not «60,0 s»
  if (Math.round(whole) < 60) return `${oneDecimal.format(whole)} s`;
  const total = Math.round(whole);
  const [minutes, rest] = [Math.floor(total / 60), total % 60];
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

// «2,0 s más lenta» · «1,0 s más rápida» · «misma duración». The difference is the
// proposal minus the accepted plan: positive is slower.
export function differenceText(compare: StrategyCompare | null) {
  if (!compare) return "";
  const c = t.accept.compare;
  if (Math.abs(compare.deltaSeconds) < 0.05) return c.same;
  return compare.deltaSeconds > 0
    ? c.slower(secondsText(compare.deltaSeconds))
    : c.faster(secondsText(compare.deltaSeconds));
}

// The note of the Duración figure of a proposal that is not the accepted plan.
export function durationNote(compare: StrategyCompare | null) {
  if (!compare || Math.abs(compare.deltaSeconds) < 0.05) return undefined;
  const c = t.accept.compare;
  return compare.deltaSeconds > 0
    ? c.figureSlower(secondsText(compare.deltaSeconds))
    : c.figureFaster(secondsText(compare.deltaSeconds));
}

// «6:01:04 · 5 paradas»
export function planSummary(result: StrategyCalculationView) {
  const { metrics } = result;
  return metrics
    ? `${clock(metrics.totalSeconds)} · ${t.time.stops(metrics.pitCount)}`
    : "";
}

// «19 nov 2026» and «19:42», in the time zone of the screen unless one is given.
export function acceptedDay(iso: string, timeZone?: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(new Date(iso));
}
export function acceptedOn(iso: string, timeZone?: string) {
  const time = new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(new Date(iso));
  return t.accept.savedOn(acceptedDay(iso, timeZone), time);
}

const units: Partial<Record<StrategyField, string>> = {
  fuelCapacityLiters: "L",
  fuelPerLapLiters: "L",
  veCapacityPercent: "%",
  vePerLapPercent: "%",
  degradationSeconds: "s",
  pitTransitSeconds: "s",
  tyreServiceSeconds: "s",
  formationSeconds: "s",
  refuelRate: "L/s",
  veRate: "%/s",
  fuelStep: "L",
  veStep: "%",
  reserveLaps: "v",
  tyreLifeLaps: "vueltas",
  raceLaps: "vueltas",
  durationMinutes: "min",
};
const dateTime = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function changeLabel(field: StrategyField) {
  if (field in strategy.labels)
    return strategy.labels[field as keyof typeof strategy.labels];
  return field in t.accept.otherFields
    ? t.accept.otherFields[field as keyof typeof t.accept.otherFields]
    : "otro dato";
}

// A value of the form as the card of Carrera says it: the pace as a lap time,
// the numbers with their unit, the service mode in words.
export function changeValue(field: StrategyField, text: string) {
  const value = text.trim();
  if (value === "") return "—";
  const number = Number(value);
  if (field === "basePaceSeconds" && Number.isFinite(number) && number > 0)
    return lapTime(number);
  if (field === "serviceMode")
    return value === "parallel"
      ? strategy.together
      : value === "sequential"
        ? strategy.sequential
        : value;
  if (field === "startAt") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : dateTime.format(date);
  }
  const unit = units[field];
  return unit && Number.isFinite(number)
    ? `${upToThree.format(number)} ${unit}`
    : value;
}

// «Consumo por vuelta: 1,83 L → 1,85 L»
export function changeLine(change: StrategyChange) {
  const label = changeLabel(change.field);
  return change.before === null || change.after === null
    ? `${label}: ${t.accept.stale.hidden}`
    : `${label}: ${changeValue(change.field, change.before)} → ${changeValue(change.field, change.after)}`;
}

// Why the plan would not reach the finish. The lap comes only from the host and
// only for fuel and energy; until the solver crate reports it (E5e) it is null.
export function unreachableText(unreachable: StrategyUnreachable) {
  const u = t.accept.unreachable;
  switch (unreachable.cause) {
    case "resourceExhausted":
      return u.resourceExhausted(unreachable.failLap);
    case "reserveNotMet":
      return u.reserveNotMet;
    case "scheduleMismatch":
      return u.scheduleMismatch;
    default:
      return u.other;
  }
}

export function acceptedTag(accepted: StrategyAcceptedView): Tag {
  const tags = t.accept.tags;
  switch (accepted.state) {
    case "accepted":
      return { tone: "ok", text: tags.accepted };
    case "stale":
      return { tone: "warn", text: tags.stale };
    default:
      return { tone: "error", text: tags.unreachable };
  }
}

// The fields that changed, to mark them in the data cards of Carrera.
export function changedFields(plan: StrategyPlanView) {
  return new Set<StrategyField>(
    (plan.accepted?.changes ?? []).map(({ field }) => field),
  );
}

export type CardText = {
  tag: Tag | null;
  title: string;
  certificate: string;
  // a quiet line, or one that asks for attention
  notes: { tone: "info" | "warn"; text: string }[];
  // «Aceptar propuesta» in the card: only for a proposal that loses nothing and needs no warning
  accept: boolean;
};

// The card of the Carrera tab: what the plan says in a line, or nothing.
export function planCard(plan: StrategyPlanView): CardText | null {
  const { result, accepted } = plan;
  const c = t.card;
  const none = { tag: null, certificate: "", notes: [], accept: false };
  // only the accepted plan on view: its state is what the card says
  if (!result && isAcceptedOnly(plan) && accepted)
    return acceptedCard(accepted);
  if (!result) return null;
  const notice = certificateNotice(result);
  const certificate = `${notice.title}.`;
  if (result.certificate === "no_solution")
    return { ...none, title: c.noSolution, certificate };
  if (!result.metrics) return { ...none, title: c.unfinished, certificate };
  if (plan.state === "calculating") return { ...none, title: c.recalculating };
  if (plan.state === "edited")
    return {
      ...none,
      title: c.modified,
      notes: [{ tone: "warn", text: t.adjust.pending.accept }],
    };
  const duration = clock(result.metrics.totalSeconds);
  const stops = t.time.stops(result.metrics.pitCount);
  if (accepted && isAcceptedOnView(plan)) return acceptedCard(accepted);
  if (!canAccept(plan))
    return { ...none, title: c.done(duration, stops), certificate };
  const difference = differsFromAccepted(plan)
    ? differenceText(accepted?.compare ?? null)
    : null;
  return {
    tag: { tone: "neutral", text: t.accept.tags.proposal },
    title: c.done(duration, stops),
    certificate,
    notes:
      difference === null
        ? [{ tone: "info", text: t.accept.proposal }]
        : [{ tone: "warn", text: c.differs(difference) }],
    accept: isCleanProposal(plan) && difference === null,
  };
}

function acceptedCard(accepted: StrategyAcceptedView): CardText {
  const c = t.card;
  const duration = clock(accepted.result.metrics?.totalSeconds ?? 0);
  const stops = t.time.stops(accepted.result.metrics?.pitCount ?? 0);
  const tag = acceptedTag(accepted);
  if (accepted.state === "accepted")
    return {
      tag,
      title: c.accepted(duration, stops),
      certificate: `${certificateNotice(accepted.result).title}.`,
      notes: [],
      accept: false,
    };
  const [first] = accepted.changes;
  const changed =
    accepted.changes.length === 1 && first
      ? first.before === null || first.after === null
        ? c.changedHidden(changeLabel(first.field))
        : c.changedOne(
            changeLabel(first.field),
            changeValue(first.field, first.before),
            changeValue(first.field, first.after),
          )
      : c.changedMany(accepted.changes.length);
  return {
    tag,
    title: c.acceptedOutdated(duration, stops),
    certificate: changed,
    notes: [
      {
        tone: "warn",
        text:
          accepted.state === "stale"
            ? c.staleReaches
            : accepted.unreachable
              ? `${unreachableText(accepted.unreachable)} ${c.staleRecalculate}`
              : c.staleRecalculate,
      },
    ],
    accept: false,
  };
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
