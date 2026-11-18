import {
  type StrategyFields,
  type StrategySolverFields,
  strategyEditErrors,
  strategyFields,
  strategyFileModes,
  strategyFileNameMax,
  strategyLimits,
  strategyMethods,
  strategyPickPathMax,
  strategyReasons,
  strategyStates,
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
    exact(value, ["id", "name", "class", "track", "drivers", "strategies"]) &&
    id(value.id) &&
    text(value.name) &&
    text(value.class) &&
    text(value.track) &&
    integer(value.drivers) &&
    value.drivers >= 0 &&
    value.drivers <= 0xffffffff &&
    Array.isArray(value.strategies) &&
    value.strategies.every(variant)
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
        ]) &&
        count(pit.lap) &&
        number(pit.fuelLiters) &&
        number(pit.vePercent) &&
        typeof pit.changeTyres === "boolean" &&
        oneOf(pit.service, ["parallel", "sequential"]),
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
    ])
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
    ]) &&
    revision(value.revision) &&
    file(value.file) &&
    oneOf(value.state, strategyStates) &&
    Array.isArray(value.events) &&
    value.events.every(event) &&
    (value.activeEventId === null || id(value.activeEventId)) &&
    (value.activeStrategyId === null || id(value.activeStrategyId)) &&
    typeof value.dirty === "boolean" &&
    plan(value.plan)
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

function form(value: unknown): boolean {
  if (
    !record(value) ||
    !exact(value, ["fields", "inputs"]) ||
    !fields(value.fields)
  )
    return false;
  const { inputs } = value;
  return (
    record(inputs) &&
    exact(inputs, solverKeys) &&
    solverKeys.every((key) => text(inputs[key]))
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
        ]) &&
        id(value.eventId) &&
        id(value.strategyId) &&
        revision(value.revision) &&
        fields(value.fields)
      );
    case "strategy.create":
      return (
        exact(value, [
          "method",
          "revision",
          "fields",
          "basePaceSeconds",
          "fuelPerLapLiters",
        ]) &&
        revision(value.revision) &&
        fields(value.fields) &&
        (value.basePaceSeconds === null || text(value.basePaceSeconds)) &&
        (value.fuelPerLapLiters === null || text(value.fuelPerLapLiters))
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
    ])
  )
    return exact(value, ["kind"]);
  return (
    value.kind === "strategyConflict" &&
    exact(value, ["kind", "current"]) &&
    view(value.current)
  );
}
export function isEvent(_value: Record<string, unknown>): boolean {
  return false;
}
