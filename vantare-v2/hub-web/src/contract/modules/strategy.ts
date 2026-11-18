import {
  strategyLimits,
  strategyMethods,
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
    ]) &&
    revision(value.revision) &&
    oneOf(value.state, strategyStates) &&
    Array.isArray(value.events) &&
    value.events.every(event) &&
    (value.activeEventId === null || id(value.activeEventId)) &&
    (value.activeStrategyId === null || id(value.activeStrategyId)) &&
    value.dirty === false
  );
}
export function isRequest(value: Record<string, unknown>): boolean {
  if (value.method === "strategy.select")
    return (
      exact(value, ["method", "eventId", "strategyId", "revision"]) &&
      id(value.eventId) &&
      id(value.strategyId) &&
      revision(value.revision)
    );
  return oneOf(value.method, strategyMethods) && exact(value, ["method"]);
}
export function isReply(value: Record<string, unknown>): boolean {
  return (
    oneOf(value.method, strategyMethods) &&
    exact(value, ["method", "value"]) &&
    view(value.value)
  );
}
export function isError(value: Record<string, unknown>): boolean {
  return (
    value.kind === "strategyConflict" &&
    exact(value, ["kind", "current"]) &&
    view(value.current)
  );
}
export function isEvent(_value: Record<string, unknown>): boolean {
  return false;
}
