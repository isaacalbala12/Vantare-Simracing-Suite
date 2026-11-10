import {
  type HostToUi,
  methods,
  topics,
  type UiToHost,
} from "./generated/contract";
export const FRAME_LIMIT = 1024 * 1024;
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: string[]) {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
function integer(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 0xffffffff
  );
}
function oneOf(value: unknown, values: string[]): boolean {
  return typeof value === "string" && values.includes(value);
}
function core(value: unknown): boolean {
  if (
    !record(value) ||
    !exact(value, ["photos", "rights", "services", "access", "live"]) ||
    typeof value.live !== "boolean"
  )
    return false;
  if (
    !["photos", "rights", "services"].every((key) =>
      oneOf(value[key], ["connected", "unavailable", "incompatible"]),
    )
  )
    return false;
  return (
    record(value.access) &&
    exact(value.access, [
      "verified",
      "blocked",
      "tester",
      "calendar",
      "engineer",
      "strategy",
    ]) &&
    Object.values(value.access).every((item) => typeof item === "boolean")
  );
}
export function isUiMessage(value: unknown): value is UiToHost {
  if (!record(value)) return false;
  switch (value.kind) {
    case "hello":
      return exact(value, ["kind", "version"]) && integer(value.version);
    case "ready":
      return exact(value, ["kind"]);
    case "closeAnswer":
      return (
        exact(value, ["kind", "allow"]) && typeof value.allow === "boolean"
      );
    case "subscribe":
    case "unsubscribe":
      return (
        exact(value, ["kind", "topic"]) &&
        topics.some((topic) => topic === value.topic)
      );
    case "request":
      return (
        exact(value, ["kind", "id", "request"]) &&
        integer(value.id) &&
        record(value.request) &&
        exact(value.request, ["method"]) &&
        methods.some(
          (method) => record(value.request) && method === value.request.method,
        )
      );
    default:
      return false;
  }
}
export function isHostMessage(value: unknown): value is HostToUi {
  if (!record(value)) return false;
  switch (value.kind) {
    case "hello":
      return (
        exact(value, ["kind", "version", "theme", "window", "demo"]) &&
        integer(value.version) &&
        typeof value.demo === "boolean" &&
        record(value.theme) &&
        exact(value.theme, ["window", "sidebar", "text1"]) &&
        Object.values(value.theme).every(
          (color) => typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color),
        ) &&
        record(value.window) &&
        exact(value.window, ["width", "height", "minimized"]) &&
        integer(value.window.width) &&
        value.window.width >= 1280 &&
        value.window.width <= 8192 &&
        integer(value.window.height) &&
        value.window.height >= 720 &&
        value.window.height <= 8192 &&
        typeof value.window.minimized === "boolean"
      );
    case "response":
      return (
        exact(value, ["kind", "id", "result"]) &&
        integer(value.id) &&
        record(value.result) &&
        exact(value.result, ["method", "value"]) &&
        value.result.method === "core.get" &&
        core(value.result.value)
      );
    case "failure": {
      if (
        !exact(value, ["kind", "id", "error"]) ||
        !integer(value.id) ||
        !record(value.error)
      )
        return false;
      const error = value.error;
      return oneOf(error.kind, [
        "busy",
        "coreUnavailable",
        "unsupported",
        "denied",
      ])
        ? exact(error, ["kind"])
        : error.kind === "incompatible" &&
            exact(error, ["kind", "expected", "found"]) &&
            integer(error.expected) &&
            integer(error.found);
    }
    case "event": {
      if (!exact(value, ["kind", "event"]) || !record(value.event))
        return false;
      return value.event.topic === "core"
        ? exact(value.event, ["topic", "value"]) && core(value.event.value)
        : value.event.topic === "simStatus" &&
            exact(value.event, ["topic", "live"]) &&
            typeof value.event.live === "boolean";
    }
    case "closeRequested":
      return (
        exact(value, ["kind", "reason"]) &&
        oneOf(value.reason, ["window", "live", "controlEof"])
      );
    default:
      return false;
  }
}
export function bounded(value: unknown): boolean {
  try {
    return (
      typeof JSON.stringify(value) === "string" &&
      new TextEncoder().encode(JSON.stringify(value)).byteLength <= FRAME_LIMIT
    );
  } catch {
    return false;
  }
}
