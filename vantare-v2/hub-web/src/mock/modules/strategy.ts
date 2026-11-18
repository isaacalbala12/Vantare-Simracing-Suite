import type { HostError } from "../../contract/generated/contract";
import corpus from "../../contract/generated/corpus/strategy.json";
import type {
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
  result: null,
  error: null,
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
  let saved = sample(
    ["ready", "recovered", "protected", "importedLegacy"].includes(scenario)
      ? scenario
      : "empty",
  );
  let current = structuredClone(saved);
  let opened = false;
  let sequence = 0;
  let pending: { fields: StrategyFields; valid: boolean } | undefined;
  let generation = context.core.accountGeneration;

  function edit(changes: Partial<StrategyView>) {
    pending = undefined;
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

    if (request.method === "strategy.compute") {
      if (pending) return failure({ kind: "busy" });
      if (
        request.eventId !== current.activeEventId ||
        request.strategyId !== current.activeStrategyId
      )
        return failure({ kind: "rejected" });
      const { fields, inputs } = request.form;
      pending = {
        fields,
        valid:
          validForm(fields, false) &&
          validNumber(inputs.basePaceSeconds, Number.MIN_VALUE) &&
          validNumber(inputs.fuelPerLapLiters, Number.MIN_VALUE),
      };
      current.plan = { ...noPlan, state: "calculating" };
    } else if (request.method === "strategy.cancel" && pending) {
      pending = undefined;
      current.plan = noPlan;
    } else if (request.method === "strategy.view" && pending) {
      const { valid, fields } = pending;
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
      current.plan = calculation(valid ? "calculated" : "error");
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
      current = structuredClone(saved);
    }
    return {
      kind: "response",
      id,
      result: { method: request.method, value: structuredClone(current) },
    };
  };
}
