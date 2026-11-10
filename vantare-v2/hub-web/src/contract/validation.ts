import { isCore as core } from "./core-validation";
import {
  type HostToUi,
  methods,
  palettes,
  registrationStates,
  schemes,
  topics,
  type UiToHost,
} from "./generated/contract";
import { isPilot, isPilotFields, isPilotRevision } from "./pilot-validation";
import { isDiagnostic, isPrivacy, isPrivacyPatch } from "./privacy-validation";
import { isSettings, isSettingsPatch, isZoom } from "./settings-validation";
import { isUpdates } from "./updates-validation";
import { exact, integer, oneOf, record } from "./validation-common";
export const FRAME_LIMIT = 1024 * 1024;
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
        (value.request.method === "pilot.save"
          ? exact(value.request, ["method", "fields", "baseRevision"]) &&
            isPilotFields(value.request.fields) &&
            isPilotRevision(value.request.baseRevision)
          : value.request.method === "privacy.update"
            ? exact(value.request, ["method", "patch", "baseRevision"]) &&
              isPrivacyPatch(value.request.patch) &&
              typeof value.request.baseRevision === "string" &&
              /^[0-9a-f]{64}$/.test(value.request.baseRevision)
            : value.request.method === "mail.set"
              ? exact(value.request, ["method", "consent"]) &&
                typeof value.request.consent === "boolean"
              : value.request.method === "settings.update"
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
      if (result.method === "pilot.load" || result.method === "pilot.save")
        return exact(result, ["method", "value"]) && isPilot(result.value);
      if (result.method === "privacy.get" || result.method === "privacy.update")
        return exact(result, ["method", "value"]) && isPrivacy(result.value);
      if (result.method === "mail.get" || result.method === "mail.set")
        return (
          exact(result, ["method", "value"]) &&
          record(result.value) &&
          exact(result.value, ["consent"]) &&
          typeof result.value.consent === "boolean"
        );
      if (
        result.method === "diagnostics.get" ||
        result.method === "diagnostics.prepare"
      )
        return exact(result, ["method", "value"]) && isDiagnostic(result.value);
      if (result.method === "diagnostics.copy")
        return (
          exact(result, ["method", "text"]) && typeof result.text === "string"
        );
      if (result.method === "updates.get")
        return exact(result, ["method", "value"]) && isUpdates(result.value);
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
        result.method === "privacy.policy" ||
        result.method === "updates.restart" ||
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
        : error.kind === "privacyConflict"
          ? exact(error, ["kind", "current"]) && isPrivacy(error.current)
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
      if (value.event.topic === "updates")
        return (
          exact(value.event, ["topic", "value"]) && isUpdates(value.event.value)
        );
      return value.event.topic === "core"
        ? exact(value.event, ["topic", "value"]) && core(value.event.value)
        : value.event.topic === "simStatus" &&
            exact(value.event, ["topic", "live"]) &&
            typeof value.event.live === "boolean";
    }
    case "closeRequested":
      return (
        exact(value, ["kind", "reason"]) &&
        oneOf(value.reason, ["window", "live", "controlEof", "restart"])
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
