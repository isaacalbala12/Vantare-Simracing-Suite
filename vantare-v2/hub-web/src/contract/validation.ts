import { isPickedExecutable } from "./apps-validation";
import type { HostToUi, UiToHost } from "./generated/contract";
import { palettes, schemes, topics } from "./generated/contract";
import { validators } from "./generated/validators";
import { isZoom } from "./settings-validation";
import { exact, integer, oneOf, record } from "./validation-common";
export const FRAME_LIMIT = 1024 * 1024;
export function isUiMessage(value: unknown): value is UiToHost {
  if (!record(value)) return false;
  switch (value.kind) {
    case "pickedExecutable":
      return isPickedExecutable(value);
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
      return exact(value, ["kind", "topic"]) && oneOf(value.topic, topics);
    case "request": {
      if (
        !exact(value, ["kind", "id", "request"]) ||
        !integer(value.id) ||
        !record(value.request)
      )
        return false;
      const request = value.request;
      return validators.some(
        (module) =>
          oneOf(request.method, module.methods) && module.isRequest(request),
      );
    }
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
      return validators.some(
        (module) =>
          oneOf(result.method, module.methods) && module.isReply(result),
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
      return validators.some((module) => module.isError(error));
    }
    case "event": {
      if (!exact(value, ["kind", "event"]) || !record(value.event))
        return false;
      const event = value.event;
      return validators.some((module) => module.isEvent(event));
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
