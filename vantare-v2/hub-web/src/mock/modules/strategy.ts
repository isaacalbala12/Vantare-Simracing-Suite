import type { HostError } from "../../contract/generated/contract";
import corpus from "../../contract/generated/corpus/strategy.json";
import type {
  StrategyEditError,
  StrategyFields,
  StrategyPlanView,
  StrategyView,
} from "../../contract/generated/strategy";
import type { MockContext, MockHandler } from "../context";

function sample(state: string): StrategyView {
  const value = corpus.host.find(
    (item) =>
      item.result?.method === "strategy.open" &&
      item.result.value.state === state,
  )?.result?.value;
  if (!value) throw Error("Unknown strategy fixture");
  return structuredClone(value) as StrategyView;
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
    result.metrics = null;
    result.timeline = null;
  }
  return { ...plan, state: "calculated", computeId, result };
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

export function create(context: MockContext): MockHandler {
  const scenario = context.sceneName.startsWith("strategy-")
    ? context.sceneName.slice(9)
    : "empty";
  if (context.sceneName.startsWith("strategy-") && scenario !== "denied") {
    context.core.access.verified = true;
    context.core.accountGeneration = "a".repeat(64);
  }
  // the two recalculation scenes (QA) start from a ready document
  const opening = scenario.startsWith("recalc") ? "ready" : scenario;
  let saved = sample(
    ["ready", "recovered", "protected", "importedLegacy"].includes(opening)
      ? opening
      : "empty",
  );
  let current = structuredClone(saved);
  let opened = false;
  let sequence = 0;
  let computeSequence = 0;
  let pending:
    | { id: number; fields: StrategyFields; valid: boolean }
    | undefined;
  let editing: Editing | undefined;
  let recalculating: number | undefined;
  let generation = context.core.accountGeneration;

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
  }

  return (message) => {
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
      current = structuredClone(saved);
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
      current = structuredClone(saved);
      opened = true;
    }
    if (!opened) return failure({ kind: "denied" });
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
      editing
    ) {
      const finished = recalculating;
      recalculating = undefined;
      if (scenario === "recalcError") {
        // QA: the solver did not keep the schedule; the edit stays pending
        editing.error = "scheduleNotPreserved";
      } else if (scenario === "recalcNoSolution") {
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
    } else if (request.method === "strategy.view" && pending) {
      const { id, valid, fields } = pending;
      pending = undefined;
      if (valid) {
        const events = current.events.map((event) =>
          event.id !== current.activeEventId
            ? event
            : {
                ...event,
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
        ...calculation(valid ? "calculated" : "error"),
        computeId: id,
      };
      editing = valid ? startEditing(current.plan) : undefined;
    }
    if (request.method === "strategy.create") {
      const { fields } = request;
      if (current.events.length >= 32)
        return failure({ kind: "strategyInvalidText" });
      if (
        !validForm(fields, true) ||
        [request.basePaceSeconds, request.fuelPerLapLiters].some(
          (value) => value?.trim() && !validNumber(value, Number.MIN_VALUE),
        )
      )
        return failure({ kind: "rejected" });
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
        const { fields } = request;
        if (!validForm(fields, false)) return failure({ kind: "rejected" });
        const events = structuredClone(current.events);
        const updated = events[index];
        updated.name = fields.name.trim();
        updated.class = fields.class.trim();
        updated.track = fields.track.trim();
        updated.strategies[variant].name = fields.variantName.trim();
        edit({ events });
      } else if (!active) {
        edit({
          activeEventId: request.eventId,
          activeStrategyId: request.strategyId,
        });
        current.plan = noPlan;
        current.dirty = false;
        saved = structuredClone({ ...current, plan: noPlan });
      }
    }
    if (request.method === "strategy.save") {
      current.dirty = false;
      saved = structuredClone({ ...current, plan: noPlan });
    } else if (request.method === "strategy.discard") {
      pending = undefined;
      editing = undefined;
      recalculating = undefined;
      current = structuredClone(saved);
    }
    return {
      kind: "response",
      id,
      result: { method: request.method, value: structuredClone(current) },
    };
  };
}
