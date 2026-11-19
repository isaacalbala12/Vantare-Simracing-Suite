import {
  type StrategyFields,
  type StrategySolverFields,
  strategyAcceptedMarks,
  strategyAcceptedStates,
  strategyChangeTextLimit,
  strategyEditErrors,
  strategyFields,
  strategyFileModes,
  strategyFileNameMax,
  strategyLimits,
  strategyMethods,
  strategyPickPathMax,
  strategyReasons,
  strategyStates,
  strategyUnreachableCauses,
} from "../generated/strategy";
import { exact, integer, oneOf, record } from "../validation-common";

export { strategyMethods as methods } from "../generated/strategy";

const bytes = new TextEncoder();
function id(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value !== "" &&
    bytes.encode(value).length <= strategyLimits.id &&
    !/[\\/:]|\p{Cc}/u.test(value)
  );
}
function text(value: unknown): boolean {
  return (
    typeof value === "string" &&
    bytes.encode(value).length <= strategyLimits.text &&
    !/\p{Cc}/u.test(value)
  );
}
// The file of the document is only its name: one segment, no separators, no
// controls, never "." or "..". The path never reaches the renderer.
function fileName(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value !== "" &&
    value !== "." &&
    value !== ".." &&
    bytes.encode(value).length <= strategyFileNameMax &&
    // separators, the stream colon, controls and bidirectional marks, as in Rust
    !/[\\/:]|\p{Cc}|[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(value)
  );
}
function file(value: unknown): boolean {
  return (
    value === null ||
    (record(value) && exact(value, ["name"]) && fileName(value.name))
  );
}
// The trusted answer of the main process; the renderer port never admits it.
export function isPickedStrategyFile(value: Record<string, unknown>): boolean {
  return (
    exact(value, ["kind", "id", "path"]) &&
    integer(value.id) &&
    (value.path === null ||
      (typeof value.path === "string" &&
        !value.path.includes("\0") &&
        bytes.encode(value.path).length <= strategyPickPathMax))
  );
}
function revision(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{64}$/.test(value) &&
    value.length === 64
  );
}
function variant(value: unknown): boolean {
  return (
    record(value) &&
    exact(value, ["id", "name"]) &&
    id(value.id) &&
    text(value.name)
  );
}
function event(value: unknown): boolean {
  return (
    record(value) &&
    exact(value, [
      "id",
      "name",
      "class",
      "track",
      "drivers",
      "strategies",
      "hasInputs",
      "acceptedPlan",
    ]) &&
    id(value.id) &&
    text(value.name) &&
    text(value.class) &&
    text(value.track) &&
    integer(value.drivers) &&
    value.drivers >= 0 &&
    value.drivers <= 0xffffffff &&
    Array.isArray(value.strategies) &&
    value.strategies.every(variant) &&
    // some variant keeps plain stored inputs that are valid for the solver; it
    // is not a plan (the document keeps none) nor a promise that compute takes them
    typeof value.hasInputs === "boolean" &&
    // the accepted plans of its variants: stale when any of them is
    oneOf(value.acceptedPlan, strategyAcceptedMarks)
  );
}
function count(value: unknown): value is number {
  return integer(value) && value >= 0 && value <= 0xffffffff;
}
function number(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function measure(value: unknown): boolean {
  return value === null || number(value);
}
const metricValues = ["totalSeconds", "fuelReserveRequiredLaps"];
function metrics(value: unknown): boolean {
  return (
    record(value) &&
    exact(value, [
      ...metricValues,
      "laps",
      "pitCount",
      "fuelReserveRealLaps",
    ]) &&
    metricValues.every((key) => number(value[key])) &&
    count(value.laps) &&
    count(value.pitCount) &&
    measure(value.fuelReserveRealLaps)
  );
}
const timelineValues = [
  "basePaceSeconds",
  "fuelStartLiters",
  "fuelFinishLiters",
  "veStartPercent",
  "veFinishPercent",
];
function timeline(value: unknown): boolean {
  return (
    record(value) &&
    exact(value, [...timelineValues, "pilot", "stints", "pits"]) &&
    text(value.pilot) &&
    timelineValues.every((key) => number(value[key])) &&
    Array.isArray(value.stints) &&
    value.stints.length <= strategyLimits.pits + 1 &&
    value.stints.every(
      (stint) =>
        record(stint) &&
        exact(stint, ["fromLap", "toLap"]) &&
        count(stint.fromLap) &&
        count(stint.toLap),
    ) &&
    Array.isArray(value.pits) &&
    value.pits.length <= strategyLimits.pits &&
    value.pits.every(
      (pit) =>
        record(pit) &&
        exact(pit, [
          "lap",
          "fuelLiters",
          "vePercent",
          "changeTyres",
          "service",
          "pitSeconds",
          "pinned",
        ]) &&
        count(pit.lap) &&
        number(pit.fuelLiters) &&
        number(pit.vePercent) &&
        typeof pit.changeTyres === "boolean" &&
        oneOf(pit.service, ["parallel", "sequential"]) &&
        number(pit.pitSeconds) &&
        // which amounts were fixed by hand (reserved: always false for now)
        record(pit.pinned) &&
        exact(pit.pinned, ["fuelLiters", "vePercent", "changeTyres"]) &&
        typeof pit.pinned.fuelLiters === "boolean" &&
        typeof pit.pinned.vePercent === "boolean" &&
        typeof pit.pinned.changeTyres === "boolean",
    )
  );
}
// Opaque and session-local; 0 is reserved as "none", which is spelled null.
function computeId(value: unknown): boolean {
  return integer(value) && value >= 1 && value <= 0xffffffff;
}
function result(value: unknown): boolean {
  return (
    record(value) &&
    exact(value, [
      "certificate",
      "steps",
      "degraded",
      "reason",
      "metrics",
      "timeline",
    ]) &&
    typeof value.degraded === "boolean" &&
    (value.certificate === null ||
      oneOf(value.certificate, ["proven", "not_proven", "no_solution"])) &&
    // a reason exactly when the result is not a proven plan, and one of those its
    // certificate allows: the search did not finish (partial, with or without a
    // plan) or no plan fits (the rules, or nothing at all)
    (value.certificate === "proven"
      ? value.reason === null
      : value.certificate === "no_solution"
        ? oneOf(value.reason, ["constraintsUnsatisfiable", "noFeasiblePlan"])
        : oneOf(value.reason, [
            "searchBudgetExhausted",
            "fineGridNoFallback",
          ])) &&
    (value.reason === null || oneOf(value.reason, strategyReasons)) &&
    record(value.steps) &&
    exact(value.steps, ["fuelLiters", "vePercent"]) &&
    measure(value.steps.fuelLiters) &&
    measure(value.steps.vePercent) &&
    (value.metrics === null || metrics(value.metrics)) &&
    (value.timeline === null || timeline(value.timeline))
  );
}
// The edited schedule: contiguous stints from lap 1, one stop between each two,
// every stop on the last lap of its stint and inside its own range.
function edit(value: unknown): boolean {
  if (
    !record(value) ||
    !exact(value, ["stints", "stops", "canReset", "error"]) ||
    typeof value.canReset !== "boolean" ||
    !(value.error === null || oneOf(value.error, strategyEditErrors)) ||
    !Array.isArray(value.stints) ||
    value.stints.length < 1 ||
    value.stints.length > strategyLimits.pits + 1 ||
    !Array.isArray(value.stops) ||
    value.stops.length !== value.stints.length - 1
  )
    return false;
  const { stints, stops } = value;
  let next = 1;
  for (const stint of stints) {
    if (
      !record(stint) ||
      !exact(stint, ["fromLap", "toLap"]) ||
      !count(stint.fromLap) ||
      !count(stint.toLap) ||
      stint.fromLap !== next ||
      stint.toLap < stint.fromLap
    )
      return false;
    next = stint.toLap + 1;
  }
  return stops.every(
    (stop, index) =>
      record(stop) &&
      exact(stop, ["lap", "minLap", "maxLap", "fuelLiters", "vePercent"]) &&
      count(stop.lap) &&
      count(stop.minLap) &&
      count(stop.maxLap) &&
      stop.lap === stints[index].toLap &&
      stop.minLap <= stop.lap &&
      stop.lap <= stop.maxLap &&
      number(stop.fuelLiters) &&
      number(stop.vePercent),
  );
}
// A finite number, negative or not: the seconds of a proposal minus those of the accepted plan.
function signed(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function rfc3339(value: unknown): boolean {
  return (
    text(value) &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)$/.test(
      value as string,
    )
  );
}
// Names and notes are labels: they never make a plan stale.
const labels = ["name", "variantName", "variantNote"];
function change(value: unknown): boolean {
  const shown = (entry: unknown) =>
    entry === null ||
    (typeof entry === "string" &&
      bytes.encode(entry).length <= strategyChangeTextLimit &&
      !/\p{Cc}/u.test(entry));
  return (
    record(value) &&
    exact(value, ["field", "before", "after"]) &&
    oneOf(value.field, strategyFields) &&
    !labels.includes(value.field as string) &&
    shown(value.before) &&
    shown(value.after)
  );
}
type Kept = {
  certificate: unknown;
  metrics: unknown;
  timeline: {
    stints: { fromLap: number; toLap: number }[];
    pits: { lap: number }[];
  } | null;
};
// The plan accepted for the active variant, apart from the proposal: its metrics
// and timeline are never null, and what it says of the changes agrees with its state.
function accepted(value: unknown): boolean {
  if (
    !record(value) ||
    !exact(value, [
      "state",
      "acceptedAt",
      "saved",
      "result",
      "changes",
      "unreachable",
      "compare",
    ]) ||
    !oneOf(value.state, strategyAcceptedStates) ||
    !rfc3339(value.acceptedAt) ||
    typeof value.saved !== "boolean" ||
    !result(value.result) ||
    !Array.isArray(value.changes)
  )
    return false;
  const kept = value.result as Kept;
  if (
    !(kept.certificate === "proven" || kept.certificate === "not_proven") ||
    kept.metrics === null ||
    kept.timeline === null ||
    kept.timeline.stints.length !== kept.timeline.pits.length + 1 ||
    // contiguous from lap 1, each stop on the last lap of its stint
    !kept.timeline.stints.every(
      (stint, index, all) =>
        stint.toLap >= stint.fromLap &&
        stint.fromLap === (index === 0 ? 1 : all[index - 1].toLap + 1),
    ) ||
    !kept.timeline.pits.every(
      (pit, index) => pit.lap === kept.timeline?.stints[index].toLap,
    )
  )
    return false;
  const fields = value.changes.map((entry) =>
    record(entry) ? entry.field : 0,
  );
  if (
    value.changes.length > strategyFields.length ||
    !value.changes.every(change) ||
    new Set(fields).size !== fields.length
  )
    return false;
  const unreachable = value.unreachable;
  if (value.state === "accepted") {
    if (value.changes.length !== 0 || unreachable !== null) return false;
  } else if (value.changes.length === 0) return false;
  if (value.state === "staleUnreachable") {
    if (
      !record(unreachable) ||
      !exact(unreachable, ["cause", "failLap"]) ||
      !oneOf(unreachable.cause, strategyUnreachableCauses) ||
      !(unreachable.failLap === null || count(unreachable.failLap))
    )
      return false;
  } else if (unreachable !== null) return false;
  const { compare } = value;
  return (
    compare === null ||
    (record(compare) &&
      exact(compare, ["same", "deltaSeconds"]) &&
      typeof compare.same === "boolean" &&
      signed(compare.deltaSeconds))
  );
}
function plan(value: unknown): boolean {
  if (
    !record(value) ||
    !exact(value, [
      "state",
      "computeId",
      "result",
      "error",
      "errorField",
      "edit",
      "accepted",
    ]) ||
    !(value.accepted === null || accepted(value.accepted))
  )
    return false;
  const noError = value.error === null && value.errorField === null;
  switch (value.state) {
    case "uncalculated":
    case "pendingChanges":
      return (
        value.computeId === null &&
        value.result === null &&
        value.edit === null &&
        noError
      );
    case "calculating":
      // A first calculation has neither result nor edit; a recalculation keeps both.
      return (
        computeId(value.computeId) &&
        noError &&
        ((value.result === null && value.edit === null) ||
          (result(value.result) && edit(value.edit)))
      );
    case "partial":
    case "calculated":
      return (
        computeId(value.computeId) &&
        result(value.result) &&
        (value.edit === null || edit(value.edit)) &&
        noError
      );
    case "edited":
      return (
        computeId(value.computeId) &&
        result(value.result) &&
        edit(value.edit) &&
        noError
      );
    case "error":
      return (
        computeId(value.computeId) &&
        value.result === null &&
        value.edit === null &&
        oneOf(value.error, ["invalidInput", "failed"]) &&
        (value.errorField === null ||
          (value.error === "invalidInput" &&
            oneOf(value.errorField, strategyFields)))
      );
    default:
      return false;
  }
}
// The accepted plan belongs to the active variant, whose event says so in the
// collection: stale exactly when the plan is.
function acceptedAgrees(value: Record<string, unknown>): boolean {
  const { accepted: kept } = value.plan as {
    accepted: { state: string } | null;
  };
  if (kept === null) return true;
  if (value.activeEventId === null || value.activeStrategyId === null)
    return false;
  const event = (value.events as { id: string; acceptedPlan: string }[]).find(
    ({ id }) => id === value.activeEventId,
  );
  if (!event) return false;
  return kept.state === "accepted"
    ? event.acceptedPlan !== "none"
    : event.acceptedPlan === "stale";
}
function view(value: unknown): boolean {
  return (
    record(value) &&
    exact(value, [
      "revision",
      "state",
      "events",
      "activeEventId",
      "activeStrategyId",
      "dirty",
      "plan",
      "file",
      "form",
    ]) &&
    revision(value.revision) &&
    file(value.file) &&
    oneOf(value.state, strategyStates) &&
    Array.isArray(value.events) &&
    value.events.every(event) &&
    (value.activeEventId === null || id(value.activeEventId)) &&
    (value.activeStrategyId === null || id(value.activeStrategyId)) &&
    typeof value.dirty === "boolean" &&
    plan(value.plan) &&
    acceptedAgrees(value) &&
    // the entries of the active variant: only with an active event and variant
    // (and null when a stored text is over the limit)
    (value.form === null ||
      (value.activeEventId !== null &&
        value.activeStrategyId !== null &&
        form(value.form)))
  );
}
const fieldKeys = [
  "name",
  "durationMinutes",
  "fuelCapacityLiters",
  "pitTransitSeconds",
  "track",
  "class",
  "variantName",
  "variantNote",
  "variantMode",
  "startAt",
  "team",
  "driverName",
  "driverInitials",
] satisfies (keyof StrategyFields)[];

function fields(value: unknown): boolean {
  return (
    record(value) &&
    exact(value, fieldKeys) &&
    fieldKeys.every((key) => text(value[key]))
  );
}

const solverKeys = [
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
  "serviceMode",
] satisfies (keyof StrategySolverFields)[];

function solverInputs(value: unknown): boolean {
  return (
    record(value) &&
    exact(value, solverKeys) &&
    solverKeys.every((key) => text(value[key]))
  );
}

function form(value: unknown): boolean {
  return (
    record(value) &&
    exact(value, ["fields", "inputs"]) &&
    fields(value.fields) &&
    solverInputs(value.inputs)
  );
}

export function isRequest(value: Record<string, unknown>): boolean {
  switch (value.method) {
    case "strategy.select":
      return (
        exact(value, ["method", "eventId", "strategyId", "revision"]) &&
        id(value.eventId) &&
        id(value.strategyId) &&
        revision(value.revision)
      );
    case "strategy.confirm":
      return (
        exact(value, [
          "method",
          "eventId",
          "strategyId",
          "revision",
          "fields",
          "inputs",
        ]) &&
        id(value.eventId) &&
        id(value.strategyId) &&
        revision(value.revision) &&
        fields(value.fields) &&
        // the key is required; `null` confirms the fields only (Rust also accepts
        // it missing, as in create)
        (value.inputs === null || solverInputs(value.inputs))
      );
    case "strategy.create":
      return (
        exact(value, [
          "method",
          "revision",
          "fields",
          "basePaceSeconds",
          "fuelPerLapLiters",
          "inputs",
        ]) &&
        revision(value.revision) &&
        fields(value.fields) &&
        (value.basePaceSeconds === null || text(value.basePaceSeconds)) &&
        (value.fuelPerLapLiters === null || text(value.fuelPerLapLiters)) &&
        // the 15 inputs replace the loose pair: never both
        (value.inputs === null ||
          (solverInputs(value.inputs) &&
            value.basePaceSeconds === null &&
            value.fuelPerLapLiters === null))
      );
    case "strategy.compute":
      return (
        exact(value, ["method", "eventId", "strategyId", "revision", "form"]) &&
        id(value.eventId) &&
        id(value.strategyId) &&
        revision(value.revision) &&
        form(value.form)
      );
    case "strategy.cancel":
      return (
        exact(value, ["method", "computeId"]) && computeId(value.computeId)
      );
    case "strategy.moveBoundary":
      return (
        exact(value, ["method", "revision", "computeId", "index", "lap"]) &&
        revision(value.revision) &&
        computeId(value.computeId) &&
        count(value.index) &&
        count(value.lap)
      );
    case "strategy.moveStop":
      return (
        exact(value, ["method", "revision", "computeId", "index", "delta"]) &&
        revision(value.revision) &&
        computeId(value.computeId) &&
        count(value.index) &&
        (value.delta === -1 || value.delta === 1)
      );
    case "strategy.recalculate":
    case "strategy.resetEdit":
      return (
        exact(value, ["method", "revision", "computeId"]) &&
        revision(value.revision) &&
        computeId(value.computeId)
      );
    case "strategy.pickFile":
      return (
        exact(value, ["method", "mode", "revision"]) &&
        oneOf(value.mode, strategyFileModes) &&
        revision(value.revision)
      );
    case "strategy.accept":
      return (
        exact(value, ["method", "revision", "computeId"]) &&
        revision(value.revision) &&
        computeId(value.computeId)
      );
    case "strategy.unaccept":
    case "strategy.showAccepted":
    case "strategy.save":
    case "strategy.discard":
      return exact(value, ["method", "revision"]) && revision(value.revision);
    default:
      return oneOf(value.method, strategyMethods) && exact(value, ["method"]);
  }
}
export function isReply(value: Record<string, unknown>): boolean {
  return (
    oneOf(value.method, strategyMethods) &&
    exact(value, ["method", "value"]) &&
    view(value.value)
  );
}
export function isError(value: Record<string, unknown>): boolean {
  if (
    oneOf(value.kind, [
      "strategyDirty",
      "strategyEditPending",
      "strategyImportFailed",
      "strategyInvalidText",
      "strategyFileUnavailable",
      "strategyFileTooLarge",
      "strategyTargetExists",
      "strategyPickExpired",
      "strategyNotAcceptable",
      "strategyNoAcceptedPlan",
    ])
  )
    return exact(value, ["kind"]);
  if (value.kind === "strategyInvalidInput")
    return (
      exact(value, ["kind", "field"]) &&
      (value.field === null || oneOf(value.field, strategyFields))
    );
  return (
    value.kind === "strategyConflict" &&
    exact(value, ["kind", "current"]) &&
    view(value.current)
  );
}
export function isEvent(_value: Record<string, unknown>): boolean {
  return false;
}
