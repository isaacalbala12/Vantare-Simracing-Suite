import {
  type HostToUi,
  methods,
  palettes,
  registrationStates,
  schemes,
  topics,
  type UiToHost,
} from "./generated/contract";
import { isSettings, isSettingsPatch, isZoom } from "./settings-validation";
import { exact, integer, oneOf, record } from "./validation-common";
export const FRAME_LIMIT = 1024 * 1024;
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
        oneOf(value.request.method, methods) &&
        (value.request.method === "settings.update"
          ? exact(value.request, ["method", "patch", "baseRevision"]) &&
            isSettingsPatch(value.request.patch) &&
            typeof value.request.baseRevision === "string" &&
            /^[0-9a-f]{64}$/.test(value.request.baseRevision)
          : exact(value.request, ["method"]))
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
        exact(value.theme, [
          "palette",
          "scheme",
          "window",
          "sidebar",
          "text1",
        ]) &&
        oneOf(value.theme.palette, palettes) &&
        oneOf(value.theme.scheme, schemes) &&
        [value.theme.window, value.theme.sidebar, value.theme.text1].every(
          (color) => typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color),
        ) &&
        record(value.window) &&
        exact(value.window, ["zoom", "width", "height", "minimized"]) &&
        isZoom(value.window.zoom) &&
        integer(value.window.width) &&
        value.window.width >= 1280 &&
        value.window.width <= 8192 &&
        integer(value.window.height) &&
        value.window.height >= 720 &&
        value.window.height <= 8192 &&
        typeof value.window.minimized === "boolean"
      );
    case "response": {
      if (
        !exact(value, ["kind", "id", "result"]) ||
        !integer(value.id) ||
        !record(value.result)
      )
        return false;
      const result = value.result;
      if (result.method === "shortcuts.get")
        return (
          exact(result, ["method", "value"]) &&
          record(result.value) &&
          exact(result.value, ["profiles", "protected"]) &&
          typeof result.value.protected === "boolean" &&
          Array.isArray(result.value.profiles) &&
          result.value.profiles.every(
            (item) =>
              record(item) &&
              exact(item, ["id", "name", "hotkey", "state"]) &&
              typeof item.id === "string" &&
              typeof item.name === "string" &&
              typeof item.hotkey === "string" &&
              oneOf(item.state, registrationStates),
          )
        );
      if (
        result.method === "notifications.test" ||
        result.method === "launcher.favorite"
      )
        return (
          exact(result, ["method", "accepted"]) &&
          typeof result.accepted === "boolean"
        );
      return (
        exact(result, ["method", "value"]) &&
        (result.method === "core.get"
          ? core(result.value)
          : oneOf(result.method, [
              "settings.get",
              "settings.update",
              "settings.retry",
              "settings.discard",
            ]) && isSettings(result.value))
      );
    }
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
        "protected",
        "io",
      ])
        ? exact(error, ["kind"])
        : error.kind === "conflict"
          ? exact(error, ["kind", "current"]) && isSettings(error.current)
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
