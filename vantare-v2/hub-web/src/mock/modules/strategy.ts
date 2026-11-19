import type {
  HostError,
  HostToUi,
  UiToHost,
} from "../../contract/generated/contract";
import corpus from "../../contract/generated/corpus/strategy.json";
import type {
  StrategyEditError,
  StrategyFields,
  StrategyPlanView,
  StrategyReason,
  StrategySolverFields,
  StrategyView,
} from "../../contract/generated/strategy";
import { strategyReasons } from "../../contract/generated/strategy";
import type { MockContext, MockHandler } from "../context";

type PickMode = "open" | "saveAs";

function sample(state: string): StrategyView {
  const value = corpus.host.find(
    (item) =>
      item.result?.method === "strategy.open" &&
      item.result.value.state === state,
  )?.result?.value;
  if (!value) throw Error("Unknown strategy fixture");
  return structuredClone(value) as StrategyView;
}

type Form = NonNullable<StrategyView["form"]>;
type Summary = StrategyView["events"][number];

// The scene of an event that holds no confirmed inputs: the sample of the corpus.
function withoutInputs(): StrategyView {
  const value = corpus.host.find(
    (item) =>
      item.result?.method === "strategy.view" &&
      item.result.value.events[0]?.hasInputs === false,
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
};

function calculation(state: "calculated" | "error"): StrategyPlanView {
  const plan = corpus.host.find(
    (item) =>
      item.result?.method === "strategy.view" &&
      item.result.value.plan.state === state,
  )?.result?.value.plan;
  if (!plan) throw Error("Missing strategy calculation fixture");
  return structuredClone(plan) as StrategyPlanView;
}

// The plan of the reason scenes (QA): the first sample of the corpus with that reason.
function reasonPlan(reason: StrategyReason): StrategyPlanView {
  const plan = corpus.host.find(
    (item) => item.result?.value?.plan?.result?.reason === reason,
  )?.result?.value.plan;
  if (!plan) throw Error("Missing strategy reason fixture");
  return structuredClone(plan) as StrategyPlanView;
}

// QA: the plan of Opus' Fuji case (236 laps, 6 stints, 5 stops), to see a plan
// of a real size. Its figures were worked out by hand in the design, not by the solver.
function fujiPlan(unproven: boolean): StrategyPlanView {
  const stops = [43, 85, 127, 170, 212];
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
      })),
      canReset: false,
      error: null,
    },
  };
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
}

function startEditing(plan: StrategyPlanView): Editing | undefined {
  const pits = plan.result?.timeline?.pits;
  const stints = plan.result?.timeline?.stints;
  if (!pits || !stints || !plan.edit) return undefined;
  return {
    base: plan,
    shown: plan,
    laps: pits.map((pit) => pit.lap),
    raceLaps: stints[stints.length - 1].toLap,
    pending: false,
    error: null,
  };
}

function editView(editing: Editing) {
  const bounds = [0, ...editing.laps, editing.raceLaps];
  const pits = editing.base.result?.timeline?.pits ?? [];
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
    })),
    canReset: editing.pending || editing.shown !== editing.base,
    error: editing.error,
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
  };
}

// What the solver returns for a schedule: the mock always keeps it as given.
function recalculated(editing: Editing, computeId: number): StrategyPlanView {
  const plan = structuredClone(editing.base);
  const edit = editView(editing);
  const timeline = plan.result?.timeline;
  if (timeline) {
    timeline.stints = edit.stints;
    timeline.pits.forEach((pit, index) => {
      pit.lap = editing.laps[index];
    });
  }
  return { ...plan, computeId, edit };
}

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

// What the host checks in the 15 inputs, as compute does: whole laps, positive
// pace and rates, the other numbers not negative, a known service mode.
function validInputs(inputs: StrategySolverFields): boolean {
  const number = (value: string, minimum: number, positive = false) =>
    validNumber(value, positive ? Number.MIN_VALUE : minimum);
  return (
    /^[+]?[0-9]+$/.test(inputs.raceLaps.trim()) &&
    Number(inputs.raceLaps) >= 1 &&
    Number(inputs.raceLaps) <= 100000 &&
    number(inputs.basePaceSeconds, 0, true) &&
    number(inputs.refuelRate, 0, true) &&
    number(inputs.veRate, 0, true) &&
    number(inputs.fuelPerLapLiters, 0) &&
    number(inputs.veCapacityPercent, 0) &&
    Number(inputs.veCapacityPercent) <= 100 &&
    number(inputs.vePerLapPercent, 0) &&
    number(inputs.tyreLifeLaps, 0) &&
    Number.isInteger(Number(inputs.tyreLifeLaps)) &&
    number(inputs.degradationSeconds, 0) &&
    number(inputs.tyreServiceSeconds, 0) &&
    number(inputs.formationSeconds, 0) &&
    number(inputs.fuelStep, 0) &&
    number(inputs.veStep, 0) &&
    number(inputs.reserveLaps, 0) &&
    ["parallel", "sequential"].includes(inputs.serviceMode.trim())
  );
}

export function create(context: MockContext): MockHandler {
  const scenario = context.sceneName.startsWith("strategy-")
    ? context.sceneName.slice(9)
    : "empty";
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
    "calculating",
    "compute",
  ].some((prefix) => scenario.startsWith(prefix))
    ? "ready"
    : scenario;
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
  if (scenario.startsWith("plannedFuji")) saved = fujiDocument(saved);
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
  function commit() {
    saved = structuredClone({ ...current, plan: noPlan });
    savedForms = structuredClone(forms);
  }
  function restore() {
    current = structuredClone(saved);
    forms = structuredClone(savedForms);
  }
  let opened = false;
  let sequence = 0;
  let computeSequence = 0;
  let pending:
    | {
        id: number;
        fields: StrategyFields;
        inputs: StrategySolverFields;
        valid: boolean;
      }
    | undefined;
  let editing: Editing | undefined;
  let recalculating: number | undefined;
  let generation = context.core.accountGeneration;
  // «Abrir otro archivo…» / «Guardar como…»: one ticket at a time, as in the host
  const primaryFile = "strategy-v2.json";
  const existingFiles = new Set([primaryFile, "carreras-2026.json"]);
  let ticket: { id: number; mode: PickMode; revision: string } | undefined;
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
      },
    ];
    view.activeEventId = "event-9";
    view.activeStrategyId = "variant-1";
    view.form = null; // set below, once the other document is the current one
    view.revision = (0x1000 + ++sequence).toString(16).padStart(64, "0");
    view.file = { name };
    return view;
  }

  // what the host checks when it records the ticket (and again when it answers)
  function pickError(mode: PickMode, revision: string): HostError | undefined {
    if (mode === "saveAs" && current.state === "protected")
      return { kind: "protected" };
    if (revision !== current.revision)
      return { kind: "strategyConflict", current: structuredClone(current) };
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
      result: { method: "strategy.pickFile", value: structuredClone(current) },
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
    if (message.path === null) return finishPick(message.id, held.mode, null);
    if (held.revision !== current.revision)
      return {
        kind: "failure",
        id: message.id,
        error: { kind: "strategyConflict", current: structuredClone(current) },
      };
    const name = message.path.split(/[\\/]/).pop() ?? "";
    return finishPick(message.id, held.mode, name || null);
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
      request.method !== "strategy.recalculate" &&
      request.method !== "strategy.resetEdit" &&
      request.method !== "strategy.save" &&
      request.method !== "strategy.pickFile" &&
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
      restore();
      opened = true;
      if (scenario.startsWith("planned")) {
        // QA: a document with its plan already calculated and editable; the
        // Fuji scenes have the size of a real race
        current.plan = scenario.startsWith("plannedFuji")
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
        editing = startEditing(current.plan);
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
        result: { method: request.method, value: structuredClone(current) },
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
        current.state === "protected"
      )
        return failure({ kind: "protected" });
      if (request.revision !== current.revision)
        return failure({
          kind: "strategyConflict",
          current: structuredClone(current),
        });
    }

    if (
      request.method === "strategy.moveBoundary" ||
      request.method === "strategy.moveStop" ||
      request.method === "strategy.recalculate" ||
      request.method === "strategy.resetEdit"
    ) {
      // another or an old plan, or none: the caller restarts from this view
      if (request.computeId !== current.plan.computeId)
        return failure({
          kind: "strategyConflict",
          current: structuredClone(current),
        });
      // the host answers a recalculation of a plan with no schedule `rejected`,
      // and the other three with the current view
      if (!editing)
        return request.method === "strategy.recalculate"
          ? failure({ kind: "rejected" })
          : failure({
              kind: "strategyConflict",
              current: structuredClone(current),
            });
      if (request.method === "strategy.resetEdit") {
        recalculating = undefined;
        editing.laps =
          editing.base.result?.timeline?.pits.map((pit) => pit.lap) ?? [];
        editing.shown = editing.base;
        editing.pending = false;
        editing.error = null;
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
        }
        current.plan = editedPlan(editing, request.computeId);
      }
      return {
        kind: "response",
        id,
        result: { method: request.method, value: structuredClone(current) },
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
        valid:
          validForm(fields, false) &&
          validNumber(inputs.basePaceSeconds, Number.MIN_VALUE) &&
          validNumber(inputs.fuelPerLapLiters, Number.MIN_VALUE),
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
        scenario === "plannedFujiNoSolution"
      ) {
        // QA: no plan for this schedule; the plan it started from stays the base
        editing.shown = noSolution(editing.base, finished);
        editing.pending = false;
        editing.error = null;
      } else {
        const done = recalculated(editing, finished);
        editing.base = done;
        editing.shown = done;
        editing.pending = false;
        editing.error = null;
      }
      current.plan = editedPlan(editing, finished);
    } else if (
      request.method === "strategy.view" &&
      pending &&
      // QA: this calculation never ends until it is cancelled
      scenario !== "calculating"
    ) {
      const { id, fields, inputs } = pending;
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
      editing = valid ? startEditing(current.plan) : undefined;
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
        if (!validForm(fields, false)) return failure({ kind: "rejected" });
        // inputs given: the same checks as create (and compute), all or nothing;
        // QA: the host refuses every confirmation with inputs
        if (
          inputs &&
          (scenario === "confirmRejected" ||
            !validInputs(inputs) ||
            fields.variantMode.trim() !== "dry")
        )
          return failure({ kind: "rejected" });
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
      result: { method: request.method, value: structuredClone(current) },
    };
  };
}
