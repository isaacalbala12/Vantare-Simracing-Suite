import corpus from "../../contract/generated/corpus/strategy.json";
import type { StrategyView } from "../../contract/generated/strategy";
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
  let current = sample("empty");
  let opened = false;
  let sequence = 0;
  let generation = context.core.accountGeneration;
  return (message) => {
    if (message.kind !== "request") return undefined;
    const { id, request } = message;
    if (
      request.method !== "strategy.open" &&
      request.method !== "strategy.view" &&
      request.method !== "strategy.select"
    )
      return undefined;
    const allowed =
      context.core.access.verified && !context.core.access.blocked;
    if (!allowed || generation !== context.core.accountGeneration) {
      generation = context.core.accountGeneration;
      current = sample("empty");
      opened = false;
    }
    if (!allowed) return { kind: "failure", id, error: { kind: "denied" } };
    if (request.method === "strategy.open") {
      current = structuredClone(saved);
      opened = true;
    }
    if (request.method === "strategy.select") {
      if (!opened) return { kind: "failure", id, error: { kind: "denied" } };
      if (current.state === "protected")
        return { kind: "failure", id, error: { kind: "protected" } };
      if (request.revision !== current.revision)
        return {
          kind: "failure",
          id,
          error: {
            kind: "strategyConflict",
            current: structuredClone(current),
          },
        };
      const event = current.events.find(({ id }) => id === request.eventId);
      if (!event?.strategies.some(({ id }) => id === request.strategyId))
        return { kind: "failure", id, error: { kind: "rejected" } };
      if (
        request.eventId !== current.activeEventId ||
        request.strategyId !== current.activeStrategyId
      ) {
        current = {
          ...current,
          revision: (++sequence).toString(16).padStart(64, "0"),
          state: "ready",
          activeEventId: request.eventId,
          activeStrategyId: request.strategyId,
        };
        saved = structuredClone(current);
      }
    }
    return {
      kind: "response",
      id,
      result: { method: request.method, value: structuredClone(current) },
    };
  };
}
