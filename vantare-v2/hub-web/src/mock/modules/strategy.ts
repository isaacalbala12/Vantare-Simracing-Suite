import type {
  HostError,
  HostToUi,
  UiToHost,
} from "../../contract/generated/contract";
import corpus from "../../contract/generated/corpus/strategy.json";
import type {
  StrategyAcceptedMark,
  StrategyAcceptedView,
  StrategyAmountLimits,
  StrategyAutomaticPlan,
  StrategyCalculationView,
  StrategyChange,
  StrategyEditCause,
  StrategyEditError,
  StrategyExportFileValue,
  StrategyExportTarget,
  StrategyField,
  StrategyFields,
  StrategyPlanView,
  StrategyReason,
  StrategySolverFields,
  StrategyStopFixed,
  StrategyStopLimits,
  StrategyUnreachableCause,
  StrategyView,
} from "../../contract/generated/strategy";
import { strategyReasons } from "../../contract/generated/strategy";
import type { MockContext, MockHandler } from "../context";

type PickMode = "open" | "saveAs" | "export";

function sample(state: string): StrategyView {
  const value = corpus.host.find(
    (item) =>
      item.result?.method === "strategy.open" &&
      item.result.value.state === state,
  )?.result?.value;
  if (!value) throw Error("Unknown strategy fixture");
  return structuredClone(value) as StrategyView;
}

type Summary = StrategyView["events"][number];

// The scene of an event that holds no confirmed inputs: the sample of the corpus.
function withoutInputs(): StrategyView {
  const value = corpus.host.find(
    (item) =>
      item.result?.method === "strategy.view" &&
      "events" in item.result.value &&
      item.result.value.events?.[0]?.hasInputs === false,
  )?.result?.value;
  if (!value) throw Error("Missing strategy fixture without inputs");
  return structuredClone(value) as StrategyView;
}

// QA: stored inputs that read as an input but do not validate. The form shows
// them, so the user can correct them, and the event does not count as having inputs.
function withInvalidInputs(): StrategyView {
  const view = sample("ready");
  view.events = view.events.map((event) => ({ ...event, hasInputs: false }));
  if (view.form) view.form.inputs.raceLaps = "0";
  return view;
}

const noInputs: StrategySolverFields = {
  basePaceSeconds: "",
  fuelPerLapLiters: "",
  raceLaps: "",
  veCapacityPercent: "",
  vePerLapPercent: "",
  tyreLifeLaps: "",
  degradationSeconds: "",
  refuelRate: "",
  veRate: "",
  tyreServiceSeconds: "",
  formationSeconds: "",
  fuelStep: "",
  veStep: "",
  reserveLaps: "",
  serviceMode: "",
};

const formKey = (event: string, variant: string) => `${event}/${variant}`;

// The host trims every text it writes.
function trimmed<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).map(([key, text]) => [key, String(text).trim()]),
  ) as unknown as T;
}

// A number as the document writes it (a whole number keeps «.0») and as the
// solver input prints it (plain): the host reads each entry from its own source.
function spell(value: string): string {
  const number = Number(value.trim());
  return Number.isInteger(number) ? `${number}.0` : String(number);
}
const plain = (value: string) => String(Number(value.trim()));

// The fields as the host reads them back after writing: trimmed, the numbers
// spelled by the document, and the defaults `new_event` gives an empty name or mode.
function hostFields(fields: StrategyFields): StrategyFields {
  const text = trimmed(fields);
  return {
    ...text,
    durationMinutes: plain(text.durationMinutes),
    fuelCapacityLiters: spell(text.fuelCapacityLiters),
    pitTransitSeconds: spell(text.pitTransitSeconds),
    variantName: text.variantName || "Base",
    variantMode: text.variantMode || "dry",
  };
}

// The inputs as the host reads them back from the stored solver input: plain
// numbers, except the reserve laps, which the event keeps as the document writes them.
function hostInputs(inputs: StrategySolverFields): StrategySolverFields {
  const text = trimmed(inputs);
  const numbers = Object.fromEntries(
    Object.entries(text)
      .filter(([key]) => key !== "serviceMode")
      .map(([key, value]) => [key, plain(value)]),
  );
  return { ...text, ...numbers, reserveLaps: spell(text.reserveLaps) };
}

const noPlan: StrategyPlanView = {
  state: "uncalculated",
  computeId: null,
  result: null,
  error: null,
  errorField: null,
  edit: null,
  accepted: null,
};

// What the document keeps of an accepted plan: when, the entries it was
// calculated from (a copy) and the plan. The proof of the solver is not kept.
interface AcceptedPlan {
  acceptedAt: string;
  entries: NonNullable<StrategyView["form"]>;
  result: NonNullable<StrategyPlanView["result"]>;
}
// The mock has a fixed clock, so its scenes and captures do not change.
const mockNow = "2026-11-19T18:42:00Z";
// A change of these never makes a plan stale: they are labels.
const labels: StrategyField[] = ["name", "variantName", "variantNote"];
const numericFields: StrategyField[] = [
  "durationMinutes",
  "fuelCapacityLiters",
  "pitTransitSeconds",
  "basePaceSeconds",
  "fuelPerLapLiters",
  "raceLaps",
  "veCapacityPercent",
  "vePerLapPercent",
  "tyreLifeLaps",
  "degradationSeconds",
  "refuelRate",
  "veRate",
  "tyreServiceSeconds",
  "formationSeconds",
  "fuelStep",
  "veStep",
  "reserveLaps",
];
const changeTextLimit = 64;

// 1.83 and 1.830 are the same number; a text is compared as written.
function sameEntry(field: StrategyField, before: string, after: string) {
  if (numericFields.includes(field)) {
    const [x, y] = [Number(before.trim()), Number(after.trim())];
    if (before.trim() !== "" && after.trim() !== "" && !Number.isNaN(x + y))
      return x === y;
  }
  return before.trim() === after.trim();
}

type Form = NonNullable<StrategyView["form"]>;

function entriesOf(form: Form): [StrategyField, string][] {
  return [...Object.entries(form.fields), ...Object.entries(form.inputs)] as [
    StrategyField,
    string,
  ][];
}

// The entries that differ from the copy, in the order of the form.
function changesOf(copy: Form, now: Form): StrategyChange[] {
  const current = new Map(entriesOf(now));
  const shown = (text: string) =>
    new TextEncoder().encode(text).length <= changeTextLimit ? text : null;
  return entriesOf(copy)
    .filter(
      ([field, before]) =>
        !labels.includes(field) &&
        !sameEntry(field, before, current.get(field) ?? ""),
    )
    .map(([field, before]) => ({
      field,
      before: shown(before),
      after: shown(current.get(field) ?? ""),
    }));
}

// The host replays the plan with the new data. The mock cannot: it says what
// the replay would say in the cases a scene needs (a thirstier car, a reserve the
// plan was not made for, another race length); every other change still reaches.
function unreachableCause(
  copy: Form,
  now: Form,
): StrategyUnreachableCause | null {
  if (copy.inputs.raceLaps !== now.inputs.raceLaps) return "scheduleMismatch";
  if (
    Number(now.inputs.fuelPerLapLiters) > Number(copy.inputs.fuelPerLapLiters)
  )
    return "resourceExhausted";
  if (Number(now.inputs.reserveLaps) > Number(copy.inputs.reserveLaps))
    return "reserveNotMet";
  return null;
}

function sameCalendar(
  a: NonNullable<StrategyPlanView["result"]>,
  b: NonNullable<StrategyPlanView["result"]>,
) {
  const [x, y] = [a.timeline, b.timeline];
  return (
    !!x &&
    !!y &&
    JSON.stringify(x.stints) === JSON.stringify(y.stints) &&
    x.pits.length === y.pits.length &&
    x.pits.every(
      (pit, index) =>
        pit.lap === y.pits[index].lap &&
        pit.fuelLiters === y.pits[index].fuelLiters &&
        pit.vePercent === y.pits[index].vePercent &&
        pit.changeTyres === y.pits[index].changeTyres &&
        pit.service === y.pits[index].service,
    )
  );
}

function calculation(state: "calculated" | "error"): StrategyPlanView {
  const plan = corpus.host.find(
    (item) =>
      item.result?.method === "strategy.view" &&
      "plan" in item.result.value &&
      item.result.value.plan?.state === state,
  )?.result?.value;
  if (!plan || !("plan" in plan))
    throw Error("Missing strategy calculation fixture");
  return structuredClone(plan.plan) as StrategyPlanView;
}

// The plan of the reason scenes (QA): the first sample of the corpus with that reason.
function reasonPlan(reason: StrategyReason): StrategyPlanView {
  const plan = corpus.host.find(
    (item) => item.result?.value?.plan?.result?.reason === reason,
  )?.result?.value.plan;
  if (!plan) throw Error("Missing strategy reason fixture");
  return structuredClone(plan) as StrategyPlanView;
}

// QA: the stops of the Fuji case and what each admits with nothing else fixed.
// These numbers ARE the solver's (`fixed_stop_bounds` of the crate for 82 L at
// 1,83012 L per lap and 100 % at 2,3158 % per lap, steps of 1, a reserve of 0,8
// laps and the calendar 43-42-42-43-42-24): per stop, the levels one arrives
// with and the least and the most that can be fixed.
const fujiStops = [43, 85, 127, 170, 212];
const fujiLimits: [fuel: number[], ve: number[]][] = [
  [
    [3.3, 3.3, 74, 78],
    [0.42, 0.42, 97, 99],
  ],
  [
    [0.44, 4.44, 73, 81],
    [0.16, 2.16, 96, 99],
  ],
  [
    [0.57, 4.57, 75, 81],
    [0.89, 1.89, 98, 99],
  ],
  [
    [0.88, 2.88, 74, 81],
    [0.31, 0.31, 97, 99],
  ],
  [
    [0.01, 5.01, 41, 81],
    [0.05, 2.05, 56, 99],
  ],
];
const fujiPerLap = { fuel: 1.83012, ve: 2.3158 };
const nothingFixed: StrategyStopFixed = { fuelLiters: null, vePercent: null };

function fujiStopLimits(index: number): StrategyStopLimits {
  const used = ([arrivalMin, arrivalMax, min, max]: number[]) => ({
    kind: "used" as const,
    arrival: { min: arrivalMin, max: arrivalMax },
    range: { min, max },
    issue: null,
    failLap: null,
  });
  return {
    kind: "exact",
    fuel: used(fujiLimits[index][0]),
    ve: used(fujiLimits[index][1]),
  };
}

// The limits of an amount with what they say of the amount fixed in it. The
// mock does not work limits out: it keeps those of the plan the edit started
// from and only compares. The lap it runs out in is the best case of the next
// stint, and only the Fuji case has the consumption to give it (QA data).
function withIssue(
  limits: StrategyAmountLimits,
  fixed: number | null,
  lap: number,
  perLap: number | null,
): StrategyAmountLimits {
  if (limits.kind !== "used") return limits;
  const { arrival, range } = limits;
  const issue =
    fixed === null
      ? null
      : range === null
        ? "noRange"
        : fixed < range.min
          ? "belowMin"
          : fixed > range.max
            ? "aboveMax"
            : null;
  return {
    ...limits,
    issue,
    failLap:
      issue === "belowMin" && fixed !== null && arrival && perLap
        ? lap + Math.floor((arrival.max + fixed) / perLap) + 1
        : null,
  };
}

// The first stop whose fixed amount leaves no plan, as the limits say it.
function unreachableStop(limits: StrategyStopLimits[]): number | undefined {
  const index = limits.findIndex(
    (stop) =>
      stop.kind === "exact" &&
      [stop.fuel, stop.ve].some(
        (amount) => amount.kind === "used" && amount.issue !== null,
      ),
  );
  return index < 0 ? undefined : index;
}

// The figures a plan with fixed amounts is compared with.
function figures(plan: StrategyPlanView): StrategyAutomaticPlan | null {
  const metrics = plan.result?.metrics;
  const timeline = plan.result?.timeline;
  return metrics && timeline
    ? {
        totalSeconds: metrics.totalSeconds,
        fuelFinishLiters: timeline.fuelFinishLiters,
        veFinishPercent: timeline.veFinishPercent,
      }
    : null;
}

// QA: the plan of Opus' Fuji case (236 laps, 6 stints, 5 stops), to see a plan
// of a real size. Its figures were worked out by hand in the design, not by the solver.
function fujiPlan(unproven: boolean): StrategyPlanView {
  const stops = fujiStops;
  const loads = [
    [78, 99],
    [77, 97],
    [77, 98],
    [79, 99],
    [76, 96],
  ];
  const stints = [...stops, 236].map((toLap, index) => ({
    fromLap: (stops[index - 1] ?? 0) + 1,
    toLap,
  }));
  return {
    state: unproven ? "partial" : "calculated",
    computeId: 1,
    error: null,
    errorField: null,
    accepted: null,
    result: {
      certificate: unproven ? "not_proven" : "proven",
      degraded: false,
      reason: unproven ? "searchBudgetExhausted" : null,
      steps: { fuelLiters: 1, vePercent: 1 },
      metrics: {
        totalSeconds: 21664,
        laps: 236,
        pitCount: 5,
        fuelReserveRealLaps: 1.14,
        fuelReserveRequiredLaps: 0.8,
      },
      timeline: {
        pilot: "Isaac",
        basePaceSeconds: 90.472,
        fuelStartLiters: 82,
        fuelFinishLiters: 2.1,
        veStartPercent: 100,
        veFinishPercent: 4,
        stints,
        pits: stops.map((lap, index) => ({
          lap,
          fuelLiters: loads[index][0],
          vePercent: loads[index][1],
          changeTyres: true,
          service: "parallel" as const,
          pitSeconds: 1 + index + 60,
          pinned: { fuelLiters: false, vePercent: false, changeTyres: false },
        })),
      },
    },
    edit: {
      stints,
      stops: stops.map((lap, index) => ({
        lap,
        minLap: (stops[index - 1] ?? 0) + 1,
        maxLap: (stops[index + 1] ?? 236) - 1,
        fuelLiters: loads[index][0],
        vePercent: loads[index][1],
        fixed: { ...nothingFixed },
        pitSeconds: 1 + index + 60,
        limits: fujiStopLimits(index),
      })),
      canReset: false,
      error: null,
      cause: null,
      automatic: null,
    },
  };
}

// QA: the Fuji plan after a recalculation of the schedule with the first stop one
// lap earlier (the calendar the crate does solve), as the mock recalculation gives
// it: valid, not proven, two seconds slower than the proven plan. It is what a
// person sees after adjusting a stop of an accepted plan.
function fujiMovedPlan(): StrategyPlanView {
  const plan = fujiPlan(true);
  const pits = plan.result?.timeline?.pits;
  const stints = plan.result?.timeline?.stints;
  if (!plan.result?.metrics || !pits || !stints || !plan.edit) return plan;
  plan.result.metrics.totalSeconds += 2;
  pits[0].lap = 42;
  stints[0].toLap = 42;
  stints[1].fromLap = 43;
  plan.edit.stints = structuredClone(stints);
  plan.edit.stops[0].lap = 42;
  plan.edit.stops[0].maxLap = 84;
  plan.edit.stops[1].minLap = 43;
  // the mock has the limits of the Fuji calendar only, and this is another one
  for (const stop of plan.edit.stops) stop.limits = { kind: "unavailable" };
  return plan;
}

// QA: the plan a person gets after «Calcular con los datos nuevos» on an outdated
// accepted plan whose pace changed (90,472 → 90,9 s): the stops and loads come out
// the same on the 1 L / 1 % grid, only the time is longer (236 laps × 0,428 s, about
// 101 s). The host compares the calendar only, so it says `same: true` while the
// accepted plan is still outdated.
function fujiStaleSamePlan(): StrategyPlanView {
  const plan = fujiPlan(false);
  if (plan.result?.metrics && plan.result.timeline) {
    plan.result.metrics.totalSeconds += 101;
    plan.result.timeline.basePaceSeconds = 90.9;
  }
  return plan;
}

// QA: the document of Opus' Fuji case, so the header of the race fits its plan
// (236 laps in 360 minutes). Only the Fuji scenes use it.
function fujiDocument(view: StrategyView): StrategyView {
  const next = structuredClone(view);
  const [event] = next.events;
  if (event) {
    event.name = "Fuji 6 Horas";
    event.class = "Hypercar";
    event.track = "Fuji Speedway";
    event.strategies = event.strategies.map((variant, index) =>
      index === 0 ? { ...variant, name: "Seco" } : variant,
    );
  }
  if (next.form) {
    Object.assign(next.form.fields, {
      name: "Fuji 6 Horas",
      class: "Hypercar",
      track: "Fuji Speedway",
      durationMinutes: "360",
      fuelCapacityLiters: "82.0",
      pitTransitSeconds: "25.0",
      driverName: "Isaac Albalá",
      driverInitials: "IA",
      variantName: "Seco",
    });
    Object.assign(next.form.inputs, {
      basePaceSeconds: "90.472",
      fuelPerLapLiters: "1.83",
      raceLaps: "236",
      veCapacityPercent: "100",
      vePerLapPercent: "2.316",
      tyreLifeLaps: "43",
      degradationSeconds: "0",
      refuelRate: "4",
      veRate: "2.5",
      tyreServiceSeconds: "30",
      formationSeconds: "0",
      fuelStep: "1",
      veStep: "1",
      reserveLaps: "0.8",
      serviceMode: "parallel",
    });
  }
  return next;
}

// The edited schedule of a plan, kept like the host keeps it: the stop laps,
// the plan they started from and whether they are recalculated.
interface Editing {
  base: StrategyPlanView;
  shown: StrategyPlanView;
  laps: number[];
  raceLaps: number;
  pending: boolean;
  error: StrategyEditError | null;
  // what the person fixed by hand in each stop, and what the base plan had fixed
  fixed: StrategyStopFixed[];
  baseFixed: StrategyStopFixed[];
  cause: StrategyEditCause | null;
  // the last plan calculated with nothing fixed: its stop laps and its figures
  automatic: { laps: number[]; figures: StrategyAutomaticPlan } | null;
  // the limits of the plan the edit started from, and the calendar they are of
  limits: { laps: number[]; stops: StrategyStopLimits[] };
  // QA: the Fuji case, the only one with a consumption to say where it runs out
  fuji: boolean;
}

// The seconds a fixed amount adds to its stop and to the plan (a QA figure,
// not the pit model): two per amount that is not the one the plan loads.
function fixedSeconds(
  fixed: StrategyStopFixed | undefined,
  pit: { fuelLiters: number; vePercent: number },
): number {
  const differs = (value: number | null | undefined, planned: number) =>
    value !== null && value !== undefined && value !== planned;
  return (
    2 *
    (Number(differs(fixed?.fuelLiters, pit.fuelLiters)) +
      Number(differs(fixed?.vePercent, pit.vePercent)))
  );
}

function somethingFixed(fixed: StrategyStopFixed[]): boolean {
  return fixed.some(
    (stop) => stop.fuelLiters !== null || stop.vePercent !== null,
  );
}

function startEditing(
  plan: StrategyPlanView,
  fuji: boolean,
): Editing | undefined {
  const pits = plan.result?.timeline?.pits;
  const stints = plan.result?.timeline?.stints;
  if (!pits || !stints || !plan.edit) return undefined;
  const laps = pits.map((pit) => pit.lap);
  const automatic = figures(plan);
  return {
    base: plan,
    shown: plan,
    laps,
    raceLaps: stints[stints.length - 1].toLap,
    pending: false,
    error: null,
    fixed: laps.map(() => ({ ...nothingFixed })),
    baseFixed: laps.map(() => ({ ...nothingFixed })),
    cause: null,
    automatic: automatic && { laps: [...laps], figures: automatic },
    limits: {
      laps: plan.edit.stops.map((stop) => stop.lap),
      stops: plan.edit.stops.map((stop) => structuredClone(stop.limits)),
    },
    fuji,
  };
}

// The limits of the stops of the edit: those of the calendar the edit started
// from, or none for any other calendar (as with a service step the calculation
// coarsens).
function stopLimits(editing: Editing): StrategyStopLimits[] {
  if (JSON.stringify(editing.laps) !== JSON.stringify(editing.limits.laps))
    return editing.laps.map(() => ({ kind: "unavailable" }));
  const perLap = editing.fuji ? fujiPerLap : null;
  return editing.limits.stops.map((stop, index) =>
    stop.kind !== "exact"
      ? stop
      : {
          kind: "exact",
          fuel: withIssue(
            stop.fuel,
            editing.fixed[index].fuelLiters,
            editing.laps[index],
            perLap?.fuel ?? null,
          ),
          ve: withIssue(
            stop.ve,
            editing.fixed[index].vePercent,
            editing.laps[index],
            perLap?.ve ?? null,
          ),
        },
  );
}

function editView(editing: Editing) {
  const bounds = [0, ...editing.laps, editing.raceLaps];
  const pits = editing.base.result?.timeline?.pits ?? [];
  const limits = stopLimits(editing);
  return {
    stints: bounds.slice(1).map((toLap, index) => ({
      fromLap: bounds[index] + 1,
      toLap,
    })),
    stops: editing.laps.map((lap, index) => ({
      lap,
      minLap: (editing.laps[index - 1] ?? 0) + 1,
      maxLap: (editing.laps[index + 1] ?? editing.raceLaps) - 1,
      fuelLiters: pits[index].fuelLiters,
      vePercent: pits[index].vePercent,
      fixed: { ...editing.fixed[index] },
      pitSeconds:
        pits[index].pitSeconds -
        fixedSeconds(editing.baseFixed[index], pits[index]) +
        fixedSeconds(editing.fixed[index], pits[index]),
      limits: limits[index],
    })),
    canReset: editing.pending || editing.shown !== editing.base,
    error: editing.error,
    cause: editing.cause,
    automatic:
      somethingFixed(editing.fixed) &&
      JSON.stringify(editing.automatic?.laps) === JSON.stringify(editing.laps)
        ? (editing.automatic?.figures ?? null)
        : null,
  };
}

function editedPlan(
  editing: Editing,
  computeId: number | null,
): StrategyPlanView {
  return {
    state: editing.pending ? "edited" : editing.shown.state,
    computeId,
    result: structuredClone(editing.shown.result),
    error: null,
    errorField: null,
    edit: editView(editing),
    accepted: null,
  };
}

// What the solver returns for a schedule: the mock always keeps it as given.
//
// In the Fuji scenes (`fuji`) it also says what the real solver says. The crate
// test `fuji_with_virtual_energy_recalculates_the_edited_schedule_with_the_fallback`
// shows that the exact search ends without a plan for a Fuji race with virtual
// energy and an edited calendar, and that the greedy fallback then keeps the
// calendar: the plan is valid but not proven (`partial`, reason
// `searchBudgetExhausted`). A proven plan is the fastest of all calendars, so
// another calendar is never faster: the QA figure adds two seconds per lap a
// stop moved. The loads of each stop are not recalculated here (hand-made QA data).
// A fixed amount is carried as it is, marked as fixed by hand, and each one
// that is not what the plan loaded adds two seconds to its stop and to the plan.
function recalculated(
  editing: Editing,
  computeId: number,
  fuji: boolean,
  // QA: a Fuji scene where the search does prove the plan with what is fixed
  proven = false,
): StrategyPlanView {
  const plan = structuredClone(editing.base);
  const edit = editView(editing);
  const timeline = plan.result?.timeline;
  if (timeline) {
    timeline.stints = edit.stints;
    timeline.pits.forEach((pit, index) => {
      const fixed = editing.fixed[index];
      pit.lap = editing.laps[index];
      pit.pitSeconds = edit.stops[index].pitSeconds;
      if (plan.result?.metrics)
        plan.result.metrics.totalSeconds +=
          fixedSeconds(fixed, pit) -
          fixedSeconds(editing.baseFixed[index], pit);
      pit.fuelLiters = fixed.fuelLiters ?? pit.fuelLiters;
      pit.vePercent = fixed.vePercent ?? pit.vePercent;
      pit.pinned = {
        fuelLiters: fixed.fuelLiters !== null,
        vePercent: fixed.vePercent !== null,
        changeTyres: false,
      };
    });
  }
  if (fuji && plan.result?.metrics) {
    const moved = editing.laps.reduce(
      (laps, lap, index) =>
        laps +
        Math.abs(
          lap - (editing.base.result?.timeline?.pits[index]?.lap ?? lap),
        ),
      0,
    );
    if (!(proven && moved === 0)) {
      plan.state = "partial";
      plan.result.certificate = "not_proven";
      plan.result.reason = "searchBudgetExhausted";
    }
    plan.result.metrics.totalSeconds += 2 * moved;
  }
  return { ...plan, computeId, edit };
}

// The one Fuji calendar the crate test `an_edit_that_needs_an_extra_stop_is_refused_with_max_stops`
// proves has no plan: the second stop one lap later (stints 43-43-41-43-42-24).
// On the 1 % grid a second 43-lap stint is impossible, so the answer is «no plan».
const fujiNoPlanLaps = [43, 86, 127, 170, 212];

// What the solver answers when no plan has the schedule: no metrics, no timeline.
function noSolution(
  plan: StrategyPlanView,
  computeId: number,
): StrategyPlanView {
  const result = structuredClone(plan.result);
  if (result) {
    result.certificate = "no_solution";
    result.reason = "constraintsUnsatisfiable";
    result.metrics = null;
    result.timeline = null;
  }
  return { ...plan, state: "calculated", computeId, result };
}

// The same data whatever the order of the keys: the host compares what it writes.
function sameData(a: unknown, b: unknown) {
  const sorted = (_: string, value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([x], [y]) => x.localeCompare(y)),
        )
      : value;
  return JSON.stringify(a, sorted) === JSON.stringify(b, sorted);
}

// QA: the scenes whose recalculation fails, and how
const recalculationErrors: Record<string, StrategyEditError> = {
  recalcError: "scheduleNotPreserved",
  plannedFujiNotPreserved: "scheduleNotPreserved",
  plannedFujiInvalidSchedule: "invalidSchedule",
  plannedFujiEventRules: "eventRulesConflict",
  plannedFujiEditFailed: "failed",
};

// Why an amount cannot be fixed whatever the other stops do, with the nearest
// amounts that can; `undefined` when it can. The same closed reasons as the host.
function invalidAmount(
  amount: "fuelLiters" | "vePercent",
  value: number | null,
  step: number | null,
  capacity: number,
): HostError | undefined {
  if (value === null) return undefined;
  const refusal = (
    reason: "negative" | "aboveCapacity" | "offGrid" | "notInUse",
    below: number | null,
    above: number | null,
  ): HostError => ({
    kind: "strategyInvalidStopService",
    amount,
    reason,
    below,
    above,
  });
  if (step === null || !(step > 0)) return refusal("notInUse", null, null);
  if (!(value >= 0)) return refusal("negative", null, 0);
  const top = Number.isFinite(capacity)
    ? Math.floor(capacity / step + 1e-9) * step
    : Number.MAX_VALUE;
  if (value > top + 1e-9 && value > capacity)
    return refusal("aboveCapacity", top, null);
  const steps = value / step;
  if (Math.abs(steps - Math.round(steps)) <= 1e-6) return undefined;
  const below = Math.floor(steps) * step;
  return refusal("offGrid", below, below + step <= top ? below + step : null);
}

function validNumber(value: string, minimum: number): boolean {
  return (
    value.trim() !== "" &&
    Number.isFinite(Number(value)) &&
    Number(value) >= minimum
  );
}

function validForm(fields: StrategyFields, creating: boolean): boolean {
  return (
    fields.name.trim() !== "" &&
    (creating || fields.variantName.trim() !== "") &&
    ["dry", "wet", "eco", "humid", ...(creating ? [""] : [])].includes(
      fields.variantMode.trim(),
    ) &&
    /^[+]?[0-9]+$/.test(fields.durationMinutes.trim()) &&
    Number(fields.durationMinutes) > 0 &&
    Number(fields.durationMinutes) <= 0xffffffff &&
    validNumber(fields.fuelCapacityLiters, Number.MIN_VALUE) &&
    validNumber(fields.pitTransitSeconds, 0) &&
    (fields.startAt.trim() === "" ||
      Number.isFinite(Date.parse(fields.startAt)))
  );
}

// What the host says of the entries the crate checks, as `compute` and `confirm`
// do: first the text that is not a number, in the order of `ManualField::ALL`
// (the three numeric fields — duration, tank, pit transit — then the inputs), and then the scalar the crate
// refuses, in its own order (laps, positive pace and rates, the other numbers not
// negative, a whole tyre life, VE capacity up to 100, a known service mode, no
// negative step). The tank and the pit transit live in `fields`: without them
// (`create`'s loose checks) only the inputs are looked at. `undefined`: nothing
// refused.
function refusedInput(
  inputs: StrategySolverFields,
  fields?: StrategyFields,
): StrategyField | undefined {
  const own: [StrategyField, string][] = fields
    ? [
        ["durationMinutes", fields.durationMinutes],
        ["fuelCapacityLiters", fields.fuelCapacityLiters],
        ["pitTransitSeconds", fields.pitTransitSeconds],
      ]
    : [];
  const textual: [StrategyField, string][] = [
    ...own,
    ["raceLaps", inputs.raceLaps],
    ["basePaceSeconds", inputs.basePaceSeconds],
    ["fuelPerLapLiters", inputs.fuelPerLapLiters],
    ["veCapacityPercent", inputs.veCapacityPercent],
    ["vePerLapPercent", inputs.vePerLapPercent],
    ["tyreLifeLaps", inputs.tyreLifeLaps],
    ["degradationSeconds", inputs.degradationSeconds],
    ["refuelRate", inputs.refuelRate],
    ["veRate", inputs.veRate],
    ["tyreServiceSeconds", inputs.tyreServiceSeconds],
    ["formationSeconds", inputs.formationSeconds],
    ["fuelStep", inputs.fuelStep],
    ["veStep", inputs.veStep],
    ["reserveLaps", inputs.reserveLaps],
  ];
  for (const [field, text] of textual)
    if (
      field === "raceLaps" || field === "durationMinutes"
        ? !/^[+]?[0-9]+$/.test(text.trim()) || Number(text) > 0xffffffff
        : !validNumber(text, -Infinity)
    )
      return field;
  const value = (text: string) => Number(text);
  const laps = value(inputs.raceLaps);
  if (laps < 1 || laps > 100000) return "raceLaps";
  if (value(inputs.basePaceSeconds) <= 0) return "basePaceSeconds";
  if (value(inputs.refuelRate) <= 0) return "refuelRate";
  if (value(inputs.veRate) <= 0) return "veRate";
  // the tank and the pit transit stand where the crate checks them
  const pit: [StrategyField, string][] = fields
    ? [["pitTransitSeconds", fields.pitTransitSeconds]]
    : [];
  const tank: [StrategyField, string][] = fields
    ? [["fuelCapacityLiters", fields.fuelCapacityLiters]]
    : [];
  const notNegative: [StrategyField, string][] = [
    ...pit,
    ["tyreServiceSeconds", inputs.tyreServiceSeconds],
    ["formationSeconds", inputs.formationSeconds],
    ...tank,
    ["veCapacityPercent", inputs.veCapacityPercent],
    ["tyreLifeLaps", inputs.tyreLifeLaps],
    ["fuelPerLapLiters", inputs.fuelPerLapLiters],
    ["vePerLapPercent", inputs.vePerLapPercent],
    ["degradationSeconds", inputs.degradationSeconds],
  ];
  for (const [field, text] of notNegative) if (value(text) < 0) return field;
  if (value(inputs.veCapacityPercent) > 100) return "veCapacityPercent";
  if (
    value(inputs.tyreLifeLaps) > 100000 ||
    !Number.isInteger(value(inputs.tyreLifeLaps))
  )
    return "tyreLifeLaps";
  if (!["parallel", "sequential"].includes(inputs.serviceMode.trim()))
    return "serviceMode";
  if (value(inputs.fuelStep) < 0) return "fuelStep";
  if (value(inputs.veStep) < 0) return "veStep";
  return undefined;
}

// The texts of the 13 fields that are not numbers, as the host names them when
// it confirms with no inputs.
function refusedOwn(fields: StrategyFields): StrategyField | undefined {
  if (!/^[+]?[0-9]+$/.test(fields.durationMinutes.trim()))
    return "durationMinutes";
  if (!validNumber(fields.fuelCapacityLiters, -Infinity))
    return "fuelCapacityLiters";
  if (!validNumber(fields.pitTransitSeconds, -Infinity))
    return "pitTransitSeconds";
  return undefined;
}

function validInputs(inputs: StrategySolverFields): boolean {
  return refusedInput(inputs) === undefined;
}

// What can go wrong when the plan is exported, as a QA scene: the first four are
// its own, the next four are those of E4a that an export can meet too.
const exportFaults = [
  "exportBusy",
  "exportInUse",
  "exportNotCsv",
  "nothingToExport",
  "fileUnavailable",
  "fileTooLarge",
  "pickExpired",
  "targetExists",
];

export function create(context: MockContext): MockHandler {
  const scenario = context.sceneName.startsWith("strategy-")
    ? context.sceneName.slice(9)
    : "empty";
  // The scene is the fault itself (`exportInUse`, on the usual sample plan) or the
  // fault after `plannedFuji` or `acceptedFuji` (`plannedFujiExportInUse`: Opus' Fuji plan,
  // calculated; `acceptedFujiExportInUse`: the same plan, accepted and saved).
  const fault = (() => {
    const rest = scenario.replace(/^(plannedFuji|acceptedFuji)/, "");
    const name = rest.charAt(0).toLowerCase() + rest.slice(1);
    return exportFaults.includes(name) ? name : undefined;
  })();
  if (context.sceneName.startsWith("strategy-") && scenario !== "denied") {
    context.core.access.verified = true;
    context.core.accountGeneration = "a".repeat(64);
  }
  // the recalculation, reason, file, data and error scenes (QA) start from a ready document
  const opening = [
    "recalc",
    "reason",
    "file",
    "target",
    "pick",
    "noInputs",
    "invalidInputs",
    "confirmRejected",
    "planned",
    "accepted",
    "calculating",
    "compute",
    "export",
    "nothingToExport",
  ].some((prefix) => scenario.startsWith(prefix))
    ? "ready"
    : scenario;
  // the scenes of Opus' Fuji case: the plan and, later, the accepted plan
  const fuji = /^(planned|accepted)Fuji/.test(scenario);
  let saved =
    scenario === "noInputs"
      ? withoutInputs()
      : scenario === "invalidInputs"
        ? withInvalidInputs()
        : sample(
            ["ready", "recovered", "protected", "importedLegacy"].includes(
              opening,
            )
              ? opening
              : "empty",
          );
  if (fuji) saved = fujiDocument(saved);
  // QA: the data changed after the plan was accepted (the plan keeps the old ones)
  if (saved.form && /^acceptedFuji(Stale|StaleSame|List)$/.test(scenario))
    saved.form.inputs.basePaceSeconds = "90.9";
  if (saved.form && /^acceptedFujiUnreachable(New)?$/.test(scenario))
    saved.form.inputs.fuelPerLapLiters = "1.85";
  // QA: a collection with an accepted plan, an outdated one and none
  if (scenario === "acceptedFujiList")
    saved.events.push(
      {
        id: "event-2",
        name: "Le Mans 24 Horas",
        class: "Hypercar",
        track: "Circuit de la Sarthe",
        drivers: 1,
        strategies: [{ id: "variant-1", name: "Base" }],
        hasInputs: true,
        acceptedPlan: "none",
      },
      {
        id: "event-3",
        name: "Sprint de Spa",
        class: "GT3",
        track: "Spa-Francorchamps",
        drivers: 1,
        strategies: [{ id: "variant-1", name: "Base" }],
        hasInputs: false,
        acceptedPlan: "none",
      },
    );
  let current = structuredClone(saved);
  // The entries of each variant written in this session (create, confirm and a
  // calculation), as the host keeps them in the document; the others are the
  // sample's. `saved` and `savedForms` move together.
  let forms: Record<string, Form> = {};
  let savedForms: Record<string, Form> = {};
  const initial = current.form;
  if (initial && current.activeEventId && current.activeStrategyId)
    forms[formKey(current.activeEventId, current.activeStrategyId)] =
      structuredClone(initial);
  savedForms = structuredClone(forms);

  // The form of a variant: what was written, or the sample's form named after it.
  function formOf(
    event: Summary,
    variant: Summary["strategies"][number],
  ): Form {
    const written = forms[formKey(event.id, variant.id)];
    if (written) return structuredClone(written);
    const base = structuredClone(
      (initial ?? sample("ready").form) as Form,
    ) as Form;
    base.fields = {
      ...base.fields,
      name: event.name,
      class: event.class,
      track: event.track,
      variantName: variant.name,
    };
    // Only the first variant of an event that has inputs stores them; the others
    // show empty inputs but for the pace and consumption, which belong to the event.
    const stored = event.hasInputs && event.strategies[0]?.id === variant.id;
    if (!stored)
      base.inputs = {
        ...noInputs,
        basePaceSeconds: base.inputs.basePaceSeconds,
        fuelPerLapLiters: base.inputs.fuelPerLapLiters,
      };
    return base;
  }
  function activeForm(view: StrategyView): Form | null {
    const event = view.events.find(({ id }) => id === view.activeEventId);
    const variant = event?.strategies.find(
      ({ id }) => id === view.activeStrategyId,
    );
    return event && variant ? formOf(event, variant) : null;
  }
  // The accepted plan of each variant, in the draft and in the saved file.
  let accepts: Record<string, AcceptedPlan> = {};
  let savedAccepts: Record<string, AcceptedPlan> = {};
  const activeKey = () =>
    current.activeEventId && current.activeStrategyId
      ? formKey(current.activeEventId, current.activeStrategyId)
      : undefined;
  // The accepted plan of the active variant as the view shows it, apart from the proposal.
  function acceptedView(): StrategyAcceptedView | null {
    const key = activeKey();
    const kept = key ? accepts[key] : undefined;
    const now = activeForm(current);
    if (!key || !kept || !now) return null;
    const changes = changesOf(kept.entries, now);
    const cause = changes.length ? unreachableCause(kept.entries, now) : null;
    const proposal = ["calculated", "partial", "edited"].includes(
      current.plan.state,
    )
      ? current.plan.result
      : null;
    const total = (result: StrategyPlanView["result"]) =>
      result?.metrics?.totalSeconds;
    return {
      state: !changes.length
        ? "accepted"
        : cause
          ? "staleUnreachable"
          : "stale",
      acceptedAt: kept.acceptedAt,
      saved: JSON.stringify(savedAccepts[key]) === JSON.stringify(kept),
      result: structuredClone(kept.result),
      changes,
      // the lap of the failure comes with the solver crate (E5e)
      unreachable: cause ? { cause, failLap: null } : null,
      compare:
        proposal && total(proposal) !== undefined
          ? {
              same: sameCalendar(kept.result, proposal),
              deltaSeconds: (total(proposal) ?? 0) - (total(kept.result) ?? 0),
            }
          : null,
    };
  }
  // The view as the host answers it: the plan with its accepted plan, and the
  // mark of every event.
  function shown(): StrategyView {
    const view = structuredClone(current);
    view.plan = { ...view.plan, accepted: acceptedView() };
    view.events = view.events.map((event) => {
      const marks = event.strategies
        .map((variant) => {
          const kept = accepts[formKey(event.id, variant.id)];
          const now = formOf(event, variant);
          return kept
            ? changesOf(kept.entries, now).length
              ? "stale"
              : "accepted"
            : "none";
        })
        .filter((mark) => mark !== "none");
      const acceptedPlan: StrategyAcceptedMark = marks.includes("stale")
        ? "stale"
        : marks.length
          ? "accepted"
          : "none";
      return { ...event, acceptedPlan };
    });
    return view;
  }
  function commit() {
    saved = structuredClone({ ...current, plan: noPlan });
    savedForms = structuredClone(forms);
    savedAccepts = structuredClone(accepts);
  }
  function restore() {
    current = structuredClone(saved);
    forms = structuredClone(savedForms);
    accepts = structuredClone(savedAccepts);
  }
  // Changes the document without touching the plan on screen (accepting or removing).
  function touch() {
    current = {
      ...current,
      revision: (++sequence).toString(16).padStart(64, "0"),
      state: "ready",
      dirty: true,
    };
  }
  let opened = false;
  let seeded = false;
  let sequence = 0;
  let computeSequence = 0;
  let pending:
    | {
        id: number;
        fields: StrategyFields;
        inputs: StrategySolverFields;
        valid: boolean;
        field?: StrategyField;
      }
    | undefined;
  let editing: Editing | undefined;
  let recalculating: number | undefined;
  let generation = context.core.accountGeneration;
  // «Abrir otro archivo…» / «Guardar como…»: one ticket at a time, as in the host
  const primaryFile = "strategy-v2.json";
  const existingFiles = new Set([primaryFile, "carreras-2026.json"]);
  let ticket:
    | {
        id: number;
        mode: PickMode;
        revision: string;
        target?: StrategyExportTarget;
      }
    | undefined;
  // the reason scenes (QA): the calculation ends with this reason
  const reason = strategyReasons.find(
    (value) => scenario === `reason${value[0].toUpperCase()}${value.slice(1)}`,
  );

  function otherDocument(name: string): StrategyView {
    // QA: the chosen file is a damaged one (recovered) or one of a future version
    const damaged =
      scenario === "pickRecovered"
        ? "recovered"
        : scenario === "pickProtected"
          ? "protected"
          : undefined;
    const view = structuredClone(sample(damaged ?? "ready"));
    if (damaged) {
      view.revision = (0x1000 + ++sequence).toString(16).padStart(64, "0");
      view.file = { name };
      return view;
    }
    view.events = [
      {
        id: "event-9",
        name: "Sprint",
        class: "GT3",
        track: "Spa",
        drivers: 1,
        strategies: [{ id: "variant-1", name: "Base" }],
        hasInputs: true,
        acceptedPlan: "none" as const,
      },
    ];
    view.activeEventId = "event-9";
    view.activeStrategyId = "variant-1";
    view.form = null; // set below, once the other document is the current one
    view.revision = (0x1000 + ++sequence).toString(16).padStart(64, "0");
    view.file = { name };
    return view;
  }

  // The plan an export writes, or the error the host answers: the same checks, in
  // the same order. The text is a plain approximation of the host's, not its bytes.
  function exportSource(
    target: StrategyExportTarget,
  ): { result: StrategyCalculationView; head: string } | HostError {
    const plan = current.plan;
    if (target.kind === "proposal") {
      if (plan.computeId !== target.computeId)
        return { kind: "strategyConflict", current: shown() };
      if (plan.state === "calculating") return { kind: "busy" };
      if (plan.state === "edited") return { kind: "strategyEditPending" };
      if (
        !["calculated", "partial"].includes(plan.state) ||
        !plan.result?.timeline ||
        !plan.result.metrics
      )
        return { kind: "strategyNothingToExport" };
      return { result: plan.result, head: "PROPUESTA SIN ACEPTAR" };
    }
    const kept = shown().plan.accepted;
    if (!kept) return { kind: "strategyNothingToExport" };
    const mark = {
      accepted: "",
      stale: " · DESACTUALIZADO",
      staleUnreachable: " · DESACTUALIZADO · NO LLEGA A META",
    }[kept.state];
    return {
      result: kept.result,
      head: `PLAN ACEPTADO · ${kept.acceptedAt}${mark}`,
    };
  }
  function exportText(source: {
    result: StrategyCalculationView;
    head: string;
  }): string {
    const event = current.events.find(({ id }) => id === current.activeEventId);
    const variant = event?.strategies.find(
      ({ id }) => id === current.activeStrategyId,
    );
    const { metrics, timeline } = source.result;
    const lines = [
      source.head,
      `Carrera: ${event?.name ?? ""} · Estrategia: ${variant?.name ?? ""}`,
      `Duración del plan ${metrics?.totalSeconds ?? 0} s · ${metrics?.pitCount ?? 0} paradas`,
    ];
    for (const [index, stint] of (timeline?.stints ?? []).entries()) {
      lines.push(
        `Stint ${index + 1} · vueltas ${stint.fromLap}–${stint.toLap}`,
      );
      const pit = timeline?.pits[index];
      if (pit)
        lines.push(
          `Parada ${index + 1} · vuelta ${pit.lap} · +${pit.fuelLiters} L · +${pit.vePercent} %`,
        );
    }
    lines.push("Hecho con Vantare");
    return lines.join("\n");
  }
  const exportName = () => {
    const event = current.events.find(({ id }) => id === current.activeEventId);
    return `${event?.name ?? "Plan de estrategia"}.csv`;
  };

  // what the host checks when it records the ticket (and again when it answers)
  function pickError(mode: PickMode, revision: string): HostError | undefined {
    if (mode === "saveAs" && current.state === "protected")
      return { kind: "protected" };
    if (revision !== current.revision)
      return { kind: "strategyConflict", current: shown() };
    if (mode === "open") {
      if (pending || recalculating !== undefined) return { kind: "busy" };
      if (current.dirty) return { kind: "strategyDirty" };
      if (editing?.pending) return { kind: "strategyEditPending" };
    } else if (current.events.length === 0 && !current.dirty)
      return { kind: "rejected" };
    return undefined;
  }

  // the final answer; `name` is the last segment of what the main process chose
  function finishPick(
    id: number,
    mode: PickMode,
    name: string | null,
  ): HostToUi {
    const fail = (error: HostError): HostToUi => ({
      kind: "failure",
      id,
      error,
    });
    const respond = (): HostToUi => ({
      kind: "response",
      id,
      result: { method: "strategy.pickFile", value: shown() },
    });
    if (name === null) return respond();
    const sceneError = (
      {
        fileUnavailable: { kind: "strategyFileUnavailable" },
        fileTooLarge: { kind: "strategyFileTooLarge" },
        pickExpired: { kind: "strategyPickExpired" },
      } as Record<string, HostError>
    )[scenario];
    if (sceneError) return fail(sceneError);
    if (scenario === "targetExists" && mode === "saveAs")
      return fail({ kind: "strategyTargetExists" });
    const error = pickError(mode, current.revision);
    if (error) return fail(error);
    if (mode === "open") {
      pending = undefined;
      editing = undefined;
      recalculating = undefined;
      saved = otherDocument(name);
      forms = {};
      current = structuredClone(saved);
      current.form = activeForm(current);
      saved = structuredClone(current);
      savedForms = {};
      return respond();
    }
    if (name !== current.file?.name) {
      // never over a file nobody observed, nor the primary one from another document
      if (existingFiles.has(name))
        return fail({ kind: "strategyTargetExists" });
      existingFiles.add(name);
      current.file = { name };
    }
    current.dirty = false;
    commit();
    return respond();
  }

  // the final answer of an export dialog; `name` is the last segment chosen
  function finishExport(
    id: number,
    target: StrategyExportTarget,
    name: string | null,
  ): HostToUi {
    const respond = (value: StrategyExportFileValue): HostToUi => ({
      kind: "response",
      id,
      result: { method: "strategy.exportFile", value },
    });
    if (name === null) return respond({ kind: "cancelled" });
    const fail = (error: HostError): HostToUi => ({
      kind: "failure",
      id,
      error,
    });
    const sceneError = (
      {
        fileUnavailable: { kind: "strategyFileUnavailable" },
        fileTooLarge: { kind: "strategyFileTooLarge" },
        pickExpired: { kind: "strategyPickExpired" },
        exportInUse: { kind: "strategyFileInUse" },
        exportNotCsv: { kind: "strategyExportNotCsv" },
        targetExists: { kind: "strategyTargetExists" },
      } as Record<string, HostError>
    )[fault ?? ""];
    if (sceneError) return fail(sceneError);
    if (!/\.csv$/iu.test(name)) return fail({ kind: "strategyExportNotCsv" });
    const source = exportSource(target);
    if ("kind" in source) return fail(source);
    return respond({ kind: "saved", file: { name } });
  }

  function answerPick(
    message: Extract<UiToHost, { kind: "pickedStrategyFile" }>,
  ): HostToUi {
    const held = ticket;
    const denied = (): HostToUi => ({
      kind: "failure",
      id: message.id,
      error: { kind: "denied" },
    });
    if (!held || held.id !== message.id) return denied();
    ticket = undefined;
    if (
      !(context.core.access.verified && !context.core.access.blocked) ||
      generation !== context.core.accountGeneration
    )
      return denied();
    if (message.path === null)
      return held.target
        ? finishExport(message.id, held.target, null)
        : finishPick(message.id, held.mode, null);
    if (held.revision !== current.revision)
      return {
        kind: "failure",
        id: message.id,
        error: { kind: "strategyConflict", current: shown() },
      };
    const name = message.path.split(/[\\/]/).pop() ?? "";
    return held.target
      ? finishExport(message.id, held.target, name || null)
      : finishPick(message.id, held.mode, name || null);
  }

  function edit(changes: Partial<StrategyView>) {
    pending = undefined;
    editing = undefined;
    recalculating = undefined;
    current = {
      ...current,
      plan:
        current.plan.state === "uncalculated"
          ? noPlan
          : { ...noPlan, state: "pendingChanges" },
      ...changes,
      revision: (++sequence).toString(16).padStart(64, "0"),
      state: "ready",
      dirty: true,
    };
    current.form = activeForm(current);
  }

  return (message) => {
    if (message.kind === "pickedStrategyFile") return answerPick(message);
    if (message.kind !== "request") return undefined;
    const { id, request } = message;
    if (
      request.method !== "strategy.open" &&
      request.method !== "strategy.view" &&
      request.method !== "strategy.select" &&
      request.method !== "strategy.create" &&
      request.method !== "strategy.confirm" &&
      request.method !== "strategy.compute" &&
      request.method !== "strategy.cancel" &&
      request.method !== "strategy.moveBoundary" &&
      request.method !== "strategy.moveStop" &&
      request.method !== "strategy.setStopService" &&
      request.method !== "strategy.clearStopServices" &&
      request.method !== "strategy.recalculate" &&
      request.method !== "strategy.resetEdit" &&
      request.method !== "strategy.save" &&
      request.method !== "strategy.pickFile" &&
      request.method !== "strategy.accept" &&
      request.method !== "strategy.unaccept" &&
      request.method !== "strategy.showAccepted" &&
      request.method !== "strategy.export" &&
      request.method !== "strategy.exportFile" &&
      request.method !== "strategy.discard"
    )
      return undefined;
    const failure = (error: HostError) =>
      ({ kind: "failure", id, error }) as const;
    const allowed =
      context.core.access.verified && !context.core.access.blocked;
    if (!allowed || generation !== context.core.accountGeneration) {
      generation = context.core.accountGeneration;
      pending = undefined;
      editing = undefined;
      recalculating = undefined;
      restore();
      opened = false;
    }
    if (!allowed) return failure({ kind: "denied" });
    if (request.method === "strategy.open") {
      if (current.dirty) return failure({ kind: "strategyDirty" });
      if (scenario === "importFailed")
        return failure({ kind: "strategyImportFailed" });
      if (scenario === "invalidText")
        return failure({ kind: "strategyInvalidText" });
      pending = undefined;
      editing = undefined;
      recalculating = undefined;
      // QA: a file that already holds an accepted plan (saved), as it was
      // calculated, or from entries that have changed since
      if (scenario.startsWith("accepted") && !seeded) {
        seeded = true;
        const key = activeKey();
        const form = activeForm(saved);
        const result = fuji
          ? fujiPlan(scenario === "acceptedFujiPartial").result
          : calculation("calculated").result;
        if (key && form && result) {
          const entries = structuredClone(form);
          if (scenario === "acceptedStale")
            entries.inputs.basePaceSeconds = "90";
          if (scenario === "acceptedUnreachable")
            entries.inputs.fuelPerLapLiters = "1.5";
          // the Fuji plan was accepted with the entries of the Fuji case
          if (/^acceptedFuji(Stale|StaleSame|List)$/.test(scenario))
            entries.inputs.basePaceSeconds = "90.472";
          if (/^acceptedFujiUnreachable(New)?$/.test(scenario))
            entries.inputs.fuelPerLapLiters = "1.83";
          savedAccepts[key] = { acceptedAt: mockNow, entries, result };
        }
        // the other event of the list that has an accepted plan, up to date
        const other = saved.events.find(({ id }) => id === "event-2");
        const kept = other && formOf(other, other.strategies[0]);
        if (scenario === "acceptedFujiList" && other && kept && result)
          savedAccepts[formKey(other.id, other.strategies[0].id)] = {
            acceptedAt: mockNow,
            entries: kept,
            result,
          };
      }
      restore();
      opened = true;
      if (
        scenario.startsWith("planned") ||
        scenario === "acceptedFujiNew" ||
        scenario === "acceptedFujiUnreachableNew" ||
        scenario === "acceptedFujiStaleSame"
      ) {
        // QA: a document with its plan already calculated and editable; the
        // Fuji scenes have the size of a real race. `acceptedFujiNew` has the
        // proposal of an adjusted calendar next to the plan accepted before, and
        // `acceptedFujiUnreachableNew` the same next to one that no longer reaches
        // the finish (the fuel per lap went up).
        current.plan =
          scenario === "acceptedFujiNew" ||
          scenario === "acceptedFujiUnreachableNew"
            ? fujiMovedPlan()
            : scenario === "acceptedFujiStaleSame"
              ? fujiStaleSamePlan()
              : scenario.startsWith("plannedFuji")
                ? fujiPlan(scenario === "plannedFujiPartial")
                : {
                    ...calculation("calculated"),
                    computeId: ++computeSequence,
                  };
        computeSequence = Math.max(
          computeSequence,
          current.plan.computeId ?? 0,
        );
        // QA: a plan with no editable schedule (a race by time)
        if (scenario === "plannedFujiNoEdit") current.plan.edit = null;
        editing = startEditing(current.plan, fuji);
      }
    }
    if (!opened) return failure({ kind: "denied" });
    if (request.method === "strategy.pickFile") {
      const error = pickError(request.mode, request.revision);
      if (error) return failure(error);
      // played without the main process: the dialog answers at once
      if (id < 0x80000000)
        return finishPick(
          id,
          request.mode,
          request.mode === "open"
            ? "carreras-2026.json"
            : "copia-estrategia.json",
        );
      if (ticket) return failure({ kind: "busy" });
      ticket = { id, mode: request.mode, revision: request.revision };
      return {
        kind: "response",
        id,
        result: { method: request.method, value: shown() },
      };
    }
    if (
      request.method === "strategy.export" ||
      request.method === "strategy.exportFile"
    ) {
      if (request.revision !== current.revision)
        return failure({ kind: "strategyConflict", current: shown() });
      // the host checks the calculation the proposal names before anything else
      if (
        request.target.kind === "proposal" &&
        current.plan.computeId !== request.target.computeId
      )
        return failure({ kind: "strategyConflict", current: shown() });
      if (fault === "exportBusy") return failure({ kind: "busy" });
      if (fault === "nothingToExport")
        return failure({ kind: "strategyNothingToExport" });
      const source = exportSource(request.target);
      if ("kind" in source) return failure(source);
      if (request.method === "strategy.export")
        return {
          kind: "response",
          id,
          result: {
            method: "strategy.export",
            value: { text: exportText(source) },
          },
        };
      // played without the main process: the dialog answers at once
      if (id < 0x80000000)
        return finishExport(id, request.target, exportName());
      if (ticket) return failure({ kind: "busy" });
      ticket = {
        id,
        mode: "export",
        revision: request.revision,
        target: request.target,
      };
      return {
        kind: "response",
        id,
        result: {
          method: "strategy.exportFile",
          value: { kind: "ticket", suggestedName: exportName() },
        },
      };
    }
    if ("revision" in request) {
      if (
        (request.method === "strategy.create" ||
          request.method === "strategy.select") &&
        current.dirty
      )
        return failure({ kind: "strategyDirty" });
      if (
        request.method !== "strategy.discard" &&
        request.method !== "strategy.showAccepted" &&
        current.state === "protected"
      )
        return failure({ kind: "protected" });
      if (request.revision !== current.revision)
        return failure({
          kind: "strategyConflict",
          current: shown(),
        });
    }

    if (
      request.method === "strategy.moveBoundary" ||
      request.method === "strategy.moveStop" ||
      request.method === "strategy.setStopService" ||
      request.method === "strategy.clearStopServices" ||
      request.method === "strategy.recalculate" ||
      request.method === "strategy.resetEdit"
    ) {
      // another or an old plan, or none: the caller restarts from this view
      if (request.computeId !== current.plan.computeId)
        return failure({
          kind: "strategyConflict",
          current: shown(),
        });
      // the host answers a recalculation of a plan with no schedule `rejected`,
      // and the other three with the current view
      if (!editing)
        return request.method === "strategy.recalculate"
          ? failure({ kind: "rejected" })
          : failure({
              kind: "strategyConflict",
              current: shown(),
            });
      if (request.method === "strategy.resetEdit") {
        recalculating = undefined;
        editing.laps =
          editing.base.result?.timeline?.pits.map((pit) => pit.lap) ?? [];
        // back to the last plan with a calendar, and to what was fixed in it
        editing.fixed = structuredClone(editing.baseFixed);
        editing.shown = editing.base;
        editing.pending = false;
        editing.error = null;
        editing.cause = null;
        current.plan = editedPlan(editing, request.computeId);
      } else if (
        request.method === "strategy.setStopService" ||
        request.method === "strategy.clearStopServices"
      ) {
        if (recalculating !== undefined) return failure({ kind: "busy" });
        const before = JSON.stringify(editing.fixed);
        if (request.method === "strategy.clearStopServices") {
          editing.fixed = editing.laps.map(() => ({ ...nothingFixed }));
        } else {
          if (!editing.fixed[request.index])
            return failure({ kind: "rejected" });
          const steps = editing.base.result?.steps;
          const form = activeForm(current);
          const refusal =
            invalidAmount(
              "fuelLiters",
              request.fuelLiters,
              steps?.fuelLiters ?? null,
              Number(form?.fields.fuelCapacityLiters),
            ) ??
            invalidAmount(
              "vePercent",
              request.vePercent,
              steps?.vePercent ?? null,
              Number(form?.inputs.veCapacityPercent),
            );
          if (refusal) return failure(refusal);
          editing.fixed[request.index] = {
            fuelLiters: request.fuelLiters,
            vePercent: request.vePercent,
          };
        }
        if (JSON.stringify(editing.fixed) !== before) {
          editing.pending = true;
          editing.error = null;
          editing.cause = null;
        }
        current.plan = editedPlan(editing, request.computeId);
      } else if (request.method === "strategy.recalculate") {
        if (recalculating !== undefined || pending)
          return failure({ kind: "busy" });
        if (!editing.pending) return failure({ kind: "rejected" });
        recalculating = ++computeSequence;
        current.plan = {
          ...editedPlan(editing, recalculating),
          state: "calculating",
        };
      } else {
        if (recalculating !== undefined) return failure({ kind: "busy" });
        const stop = editView(editing).stops[request.index];
        const lap =
          request.method === "strategy.moveBoundary"
            ? request.lap
            : (stop?.lap ?? 0) + request.delta;
        if (
          !stop ||
          lap < stop.minLap ||
          lap > stop.maxLap ||
          (request.method === "strategy.moveStop" &&
            request.delta !== 1 &&
            request.delta !== -1)
        )
          return failure({ kind: "rejected" });
        if (lap !== stop.lap) {
          editing.laps[request.index] = lap;
          editing.pending = true;
          editing.error = null;
          editing.cause = null;
        }
        current.plan = editedPlan(editing, request.computeId);
      }
      return {
        kind: "response",
        id,
        result: { method: request.method, value: shown() },
      };
    }
    if (request.method === "strategy.compute") {
      if (pending || recalculating !== undefined)
        return failure({ kind: "busy" });
      if (editing?.pending) return failure({ kind: "strategyEditPending" });
      if (
        request.eventId !== current.activeEventId ||
        request.strategyId !== current.activeStrategyId
      )
        return failure({ kind: "rejected" });
      const { fields, inputs } = request.form;
      pending = {
        id: ++computeSequence,
        fields,
        inputs,
        valid: validForm(fields, false) && validInputs(inputs),
        field: refusedInput(inputs, fields),
      };
      editing = undefined; // accepted: the old schedule goes with the old plan
      current.plan = { ...noPlan, state: "calculating", computeId: pending.id };
    } else if (
      request.method === "strategy.cancel" &&
      recalculating === request.computeId &&
      editing
    ) {
      // a cancelled recalculation leaves the edit pending, as it was
      recalculating = undefined;
      current.plan = editedPlan(editing, request.computeId);
    } else if (
      request.method === "strategy.cancel" &&
      pending?.id === request.computeId
    ) {
      // a stale id (another or a finished calculation) changes nothing
      pending = undefined;
      current.plan = noPlan;
    } else if (
      request.method === "strategy.view" &&
      recalculating !== undefined &&
      editing &&
      // QA: this recalculation never ends until it is cancelled
      scenario !== "plannedFujiRecalculating"
    ) {
      const finished = recalculating;
      recalculating = undefined;
      const failure = recalculationErrors[scenario];
      if (failure) {
        // QA: the recalculation fails; the edit stays pending with its error
        editing.error = failure;
      } else if (
        scenario === "recalcNoSolution" ||
        scenario === "plannedFujiNoSolution" ||
        (fuji &&
          JSON.stringify(editing.laps) === JSON.stringify(fujiNoPlanLaps))
      ) {
        // QA: no plan for this schedule; the plan it started from stays the base
        editing.shown = noSolution(editing.base, finished);
        editing.pending = false;
        editing.error = null;
        editing.cause = null;
      } else if (unreachableStop(stopLimits(editing)) !== undefined) {
        // no plan respects what is fixed: the first stop the limits point at
        editing.shown = noSolution(editing.base, finished);
        editing.pending = false;
        editing.error = null;
        editing.cause = {
          kind: "fixedAmountUnreachable",
          stop: unreachableStop(stopLimits(editing)) ?? 0,
        };
      } else {
        const done = recalculated(
          editing,
          finished,
          fuji,
          scenario === "plannedFujiFixedProven",
        );
        const automatic = figures(done);
        if (!somethingFixed(editing.fixed) && automatic)
          editing.automatic = { laps: [...editing.laps], figures: automatic };
        editing.base = done;
        editing.baseFixed = structuredClone(editing.fixed);
        editing.shown = done;
        editing.pending = false;
        editing.error = null;
        editing.cause = null;
      }
      current.plan = editedPlan(editing, finished);
    } else if (
      request.method === "strategy.view" &&
      pending &&
      // QA: this calculation never ends until it is cancelled
      scenario !== "calculating"
    ) {
      const { id, fields, inputs, field } = pending;
      // QA: the calculation of these scenes ends rejecting an input or failing
      const valid =
        pending.valid &&
        scenario !== "computeInvalid" &&
        scenario !== "computeFailed";
      pending = undefined;
      if (valid) {
        // a calculation confirms its inputs, whatever it finds (the host keeps no plan)
        if (current.activeEventId && current.activeStrategyId)
          forms[formKey(current.activeEventId, current.activeStrategyId)] = {
            fields: hostFields(fields),
            inputs: hostInputs(inputs),
          };
        const events = current.events.map((event) =>
          event.id !== current.activeEventId
            ? event
            : {
                ...event,
                hasInputs: true,
                name: fields.name.trim(),
                class: fields.class.trim(),
                track: fields.track.trim(),
                strategies: event.strategies.map((variant) =>
                  variant.id !== current.activeStrategyId
                    ? variant
                    : { ...variant, name: fields.variantName.trim() },
                ),
              },
        );
        edit({ events });
      }
      current.plan = {
        ...(valid && reason
          ? reasonPlan(reason)
          : scenario === "computeFailed"
            ? { ...noPlan, state: "error", error: "failed" }
            : calculation(valid ? "calculated" : "error")),
        computeId: id,
      };
      // a real refusal names its field; the QA scene keeps the sample's
      if (!valid && field) current.plan.errorField = field;
      editing = valid ? startEditing(current.plan, fuji) : undefined;
    }
    if (request.method === "strategy.accept") {
      // another or an old plan, or none: the caller restarts from this view
      if (request.computeId !== current.plan.computeId)
        return failure({ kind: "strategyConflict", current: shown() });
      if (recalculating !== undefined || pending)
        return failure({ kind: "busy" });
      if (editing?.pending) return failure({ kind: "strategyEditPending" });
      const key = activeKey();
      const form = activeForm(current);
      const result = current.plan.result;
      if (
        !key ||
        !form ||
        !["calculated", "partial"].includes(current.plan.state) ||
        !result?.metrics ||
        !result.timeline ||
        !["proven", "not_proven"].includes(result.certificate ?? "")
      )
        return failure({ kind: "strategyNotAcceptable" });
      accepts[key] = {
        acceptedAt: mockNow,
        entries: form,
        result: structuredClone(result),
      };
      // the plan on screen stays; the document is «Sin guardar»
      touch();
    } else if (request.method === "strategy.unaccept") {
      const key = activeKey();
      if (!key || !accepts[key])
        return failure({ kind: "strategyNoAcceptedPlan" });
      delete accepts[key];
      touch();
    } else if (request.method === "strategy.showAccepted") {
      const key = activeKey();
      if (!key || !accepts[key])
        return failure({ kind: "strategyNoAcceptedPlan" });
      // the proposal goes; the document does not change
      pending = undefined;
      editing = undefined;
      recalculating = undefined;
      current.plan = noPlan;
    }
    if (request.method === "strategy.create") {
      const { fields, inputs } = request;
      if (
        !validForm(fields, true) ||
        [request.basePaceSeconds, request.fuelPerLapLiters].some(
          (value) => value?.trim() && !validNumber(value, Number.MIN_VALUE),
        ) ||
        // QA: the host refuses every creation with inputs
        (inputs && scenario === "createRejected") ||
        // the inputs replace the loose pair; they are checked as compute does
        (inputs &&
          (request.basePaceSeconds !== null ||
            request.fuelPerLapLiters !== null ||
            !validInputs(inputs) ||
            fields.variantMode.trim() !== "dry"))
      )
        return failure({ kind: "rejected" });
      // the limit of events is the last check, as in the host
      if (current.events.length >= 32)
        return failure({ kind: "strategyInvalidText" });
      let number = 1;
      while (
        current.events.some((event) => event.id === `native-event-${number}`)
      )
        number++;
      const event = {
        id: `native-event-${number}`,
        name: fields.name.trim(),
        class: fields.class.trim(),
        track: fields.track.trim(),
        drivers: 1,
        strategies: [
          { id: "variant-1", name: fields.variantName.trim() || "Base" },
        ],
        hasInputs: inputs !== null,
        acceptedPlan: "none" as const,
      };
      forms[formKey(event.id, "variant-1")] = {
        fields: hostFields(fields),
        inputs: inputs
          ? hostInputs(inputs)
          : {
              ...noInputs,
              basePaceSeconds: request.basePaceSeconds?.trim()
                ? spell(request.basePaceSeconds)
                : "",
              fuelPerLapLiters: request.fuelPerLapLiters?.trim()
                ? spell(request.fuelPerLapLiters)
                : "",
            },
      };
      edit({
        events: [...current.events, event],
        activeEventId: event.id,
        activeStrategyId: "variant-1",
      });
    }
    if (
      request.method === "strategy.select" ||
      request.method === "strategy.confirm"
    ) {
      const index = current.events.findIndex(
        ({ id }) => id === request.eventId,
      );
      const event = current.events[index];
      const variant =
        event?.strategies.findIndex(({ id }) => id === request.strategyId) ??
        -1;
      if (!event || variant < 0) return failure({ kind: "rejected" });
      const active =
        request.eventId === current.activeEventId &&
        request.strategyId === current.activeStrategyId;
      if (request.method === "strategy.confirm") {
        if (!active && current.dirty) return failure({ kind: "strategyDirty" });
        const { fields, inputs } = request;
        // the crate refuses the data: the field to blame, or none. With inputs
        // the checks are compute's, all or nothing and with its field (QA: the
        // host refuses every confirmation with inputs); without them only the
        // texts of the fields it confirms can name one.
        const field = inputs
          ? scenario === "confirmRejected"
            ? "raceLaps"
            : refusedInput(inputs, fields)
          : refusedOwn(fields);
        if (field) return failure({ kind: "strategyInvalidInput", field });
        if (
          !validForm(fields, false) ||
          (inputs && fields.variantMode.trim() !== "dry")
        )
          return failure({ kind: "strategyInvalidInput", field: null });
        const events = structuredClone(current.events);
        const updated = events[index];
        updated.name = fields.name.trim();
        updated.class = fields.class.trim();
        updated.track = fields.track.trim();
        updated.strategies[variant].name = fields.variantName.trim();
        if (inputs) updated.hasInputs = true;
        // the inputs given replace the stored ones as a whole; null keeps them
        const next = {
          fields: hostFields(fields),
          inputs: inputs
            ? hostInputs(inputs)
            : formOf(event, event.strategies[variant]).inputs,
        };
        const key = formKey(updated.id, updated.strategies[variant].id);
        // the same data again is no change: neither the revision nor the plan move
        const unchanged =
          inputs &&
          sameData(events, current.events) &&
          sameData(next, formOf(event, event.strategies[variant]));
        if (!unchanged) {
          forms[key] = next;
          edit({ events });
        }
      } else if (!active) {
        edit({
          activeEventId: request.eventId,
          activeStrategyId: request.strategyId,
        });
        current.plan = noPlan;
        current.dirty = false;
        commit();
      }
    }
    if (request.method === "strategy.save") {
      current.dirty = false;
      commit();
    } else if (request.method === "strategy.discard") {
      pending = undefined;
      editing = undefined;
      recalculating = undefined;
      restore();
    }
    return {
      kind: "response",
      id,
      result: { method: request.method, value: shown() },
    };
  };
}
