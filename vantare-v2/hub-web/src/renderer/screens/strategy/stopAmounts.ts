import type { HostError } from "../../../contract/generated/contract";
import type {
  StrategyAmountLimits,
  StrategyAutomaticPlan,
  StrategyCalculationView,
  StrategyEditStop,
  StrategyEditView,
  StrategyStopAmount,
  StrategyTimeline,
} from "../../../contract/generated/strategy";
import { amounts } from "../../i18n/strategyAmounts";
import { clock, liters, percent, secondsText } from "./planText";

// Only reading aids: every number shown comes from the host (the limits of each
// stop, the lap a resource runs out in, the figures of the automatic plan). The
// screen never works a limit out; it spells what the host sent.

export type Amount = "fuel" | "ve";

const upToTwo = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });
const oneDecimal = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const number = (value: number) => upToTwo.format(value);
const withUnit = (amount: Amount, value: number) =>
  `${number(value)} ${amounts.unit[amount]}`;

// What is typed in the box of an amount: «70», «70,5» or «70.5». Anything else
// (letters, spaces inside, an exponent, two separators) is not a number here and
// is said at once, without asking the host.
export function parseAmount(text: string): number | null {
  const clean = text.trim();
  if (!/^-?\d+(?:[.,]\d+)?$/.test(clean)) return null;
  return Number(clean.replace(",", "."));
}

// 70.5 → «70,5»: what the box shows of a number the host holds
export const amountText = (value: number) => number(value);

// 62 seconds → «1:02,0»; 63.8 → «1:03,8»
export function pitTime(seconds: number) {
  const tenths = Math.round(Math.max(0, seconds) * 10);
  const minutes = Math.floor(tenths / 600);
  const rest = (tenths % 600) / 10;
  return `${minutes}:${oneDecimal.format(rest).padStart(4, "0")}`;
}

type Refusal = Extract<HostError, { kind: "strategyInvalidStopService" }>;

// The sentence for an amount the host refused: why, and the nearest amounts it
// would take. `step` is the one of the grid of that amount (null: not used).
export function amountMessage(error: Refusal, step: number | null): string {
  const e = amounts.errors;
  const fuel = error.amount === "fuelLiters";
  switch (error.reason) {
    case "negative":
      return e.negative;
    case "notInUse":
      return fuel ? e.notInUseFuel : e.notInUseEnergy;
    case "aboveCapacity":
      if (error.below === null)
        return fuel ? e.aboveFuelNoMax : e.aboveEnergyNoMax;
      return fuel
        ? e.aboveFuel(number(error.below))
        : e.aboveEnergy(number(error.below));
    case "offGrid": {
      const unit = fuel ? amounts.unit.fuel : amounts.unit.ve;
      const rule =
        step === null || step === 1
          ? fuel
            ? e.wholeFuel
            : e.wholeEnergy
          : e.grid(number(step), unit);
      const near =
        error.below !== null && error.above !== null
          ? e.pair(number(error.below), number(error.above))
          : error.below !== null || error.above !== null
            ? e.nearest(number(error.below ?? error.above ?? 0))
            : "";
      return [rule, near].filter(Boolean).join(" ");
    }
  }
}

export const refusalAmount = (amount: StrategyStopAmount): Amount =>
  amount === "fuelLiters" ? "fuel" : "ve";

// Which amount of which stop is fixed by hand, as the host says it.
export const isFixed = (stop: StrategyEditStop, amount: Amount) =>
  (amount === "fuel" ? stop.fixed.fuelLiters : stop.fixed.vePercent) !== null;
export const stopIsFixed = (stop: StrategyEditStop) =>
  isFixed(stop, "fuel") || isFixed(stop, "ve");
export const fixedStops = (edit: StrategyEditView | null) =>
  edit ? edit.stops.filter(stopIsFixed).length : 0;

// «Has fijado 60 L en la parada 2.» for one stop with one amount; the count when
// there are more.
export function fixedSummary(edit: StrategyEditView | null): string {
  if (!edit) return "";
  const stops = edit.stops.flatMap((stop, index) =>
    stopIsFixed(stop) ? [{ stop, index }] : [],
  );
  const [only] = stops;
  if (stops.length === 0) return "";
  if (stops.length > 1) return amounts.summary.many(stops.length);
  const parts = [
    only.stop.fixed.fuelLiters !== null &&
      withUnit("fuel", only.stop.fixed.fuelLiters),
    only.stop.fixed.vePercent !== null &&
      withUnit("ve", only.stop.fixed.vePercent),
  ].filter(Boolean);
  return amounts.summary.one(only.index + 1, parts.join(" y "));
}

export type Limits = {
  // «Se llega con entre 0,4 y 4,4 L.»
  arrival: string | null;
  // «Puedes fijar de 73 a 81 L.»
  range: string | null;
  // what the host says of the amount fixed here, when it leaves no plan
  issue: string | null;
};

// The lines of limits of an amount, from `limits` of the stop in the last view.
// With no exact limits (fine steps) there is only the generic line.
export function limitLines(
  amount: Amount,
  limits: StrategyAmountLimits,
  fixed: number | null,
): Limits {
  if (limits.kind !== "used")
    return { arrival: null, range: null, issue: null };
  const l = amounts.limits;
  const unit = amounts.unit[amount];
  const arrival = limits.arrival
    ? l.arrival(
        oneDecimal.format(limits.arrival.min),
        oneDecimal.format(limits.arrival.max),
        unit,
      )
    : l.noArrival;
  const range = limits.range
    ? l.range(number(limits.range.min), number(limits.range.max), unit)
    : l.noRange;
  if (fixed === null || limits.issue === null)
    return { arrival, range, issue: null };
  const value = withUnit(amount, fixed);
  const i = amounts.issue;
  switch (limits.issue) {
    case "belowMin": {
      const first =
        limits.failLap !== null
          ? i.belowMinLap(value, amount, limits.failLap)
          : i.belowMinReserve(value);
      return {
        arrival,
        range,
        issue: limits.range
          ? `${first} ${i.needsAtLeast(withUnit(amount, limits.range.min))}`
          : first,
      };
    }
    case "aboveMax":
      return {
        arrival,
        range,
        issue: limits.range
          ? i.aboveMax(value, withUnit(amount, limits.range.max))
          : i.noRange,
      };
    case "noRange":
      return { arrival, range, issue: i.noRange };
  }
}

// The difference between a plan with fixed amounts and the automatic one, as it
// is said («2,0 s»). Null unless the host gave the automatic figures and this
// plan is the slower of the two.
export function automaticGap(
  result: StrategyCalculationView | null,
  automatic: StrategyAutomaticPlan | null | undefined,
) {
  const total = result?.metrics?.totalSeconds;
  if (total === undefined || !automatic) return null;
  // Decided by the root (#2723): this subtraction of two figures the host sent is
  // formatting, not a calculation of the plan; the host stays the one that works out
  // both durations. 0,05 s is what «0,0 s» rounds to, so it is not said.
  const gap = total - automatic.totalSeconds;
  if (!(gap >= 0.05)) return null;
  return { text: secondsText(gap), automatic: clock(automatic.totalSeconds) };
}

// How the plan finishes, as it is and as the automatic plan does: what the last
// stop's amounts are told against. Null when the host gave no automatic plan.
export function finishFigures(
  timeline: StrategyTimeline,
  automatic: StrategyAutomaticPlan | null | undefined,
) {
  if (!automatic) return undefined;
  return {
    fuel: {
      value: liters(timeline.fuelFinishLiters),
      automatic: liters(automatic.fuelFinishLiters),
    },
    ve: {
      value: percent(timeline.veFinishPercent),
      automatic: percent(automatic.veFinishPercent),
    },
  };
}
