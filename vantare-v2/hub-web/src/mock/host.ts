import scene from "../../fixtures/ajustes-base.json";
import coreScene from "../../fixtures/core-offline.json";
import settingsScene from "../../fixtures/settings-base.json";
import protectedScene from "../../fixtures/settings-protected.json";
import shortcuts from "../../fixtures/shortcuts-base.json";
import {
  type CoreStatus,
  HOST_PROTOCOL_VERSION,
  type HostToUi,
  type SettingsPatch,
  type SettingsView,
} from "../contract/generated/contract";
import { isUiMessage } from "../contract/validation";
export const hello = scene as Extract<HostToUi, { kind: "hello" }>;
export function helloForScene(name?: string): typeof hello {
  return name === "componentes-incompatibles"
    ? { ...hello, version: HOST_PROTOCOL_VERSION + 1 }
    : hello;
}
const core = coreScene as CoreStatus;
function apply(view: SettingsView, patch: SettingsPatch): SettingsView {
  switch (patch.field) {
    case "performance":
      return { ...view, track: { ...view.track, level: patch.value } };
    case "hideOffTrack":
      return { ...view, track: { ...view.track, hideOffTrack: patch.value } };
    case "startup":
      return { ...view, startup: { ...view.startup, enabled: patch.value } };
    case "zoom":
      return { ...view, zoom: patch.value };
    case "density":
    case "minimized":
    case "updates":
    case "launcher":
    case "toasts":
      return {
        ...view,
        general: { ...view.general, [patch.field]: patch.value },
      };
    default:
      return {
        ...view,
        appearance: { ...view.appearance, [patch.field]: patch.value },
      };
  }
}
export function createMockHost(sceneName = "ajustes-base") {
  let settings = structuredClone(
    sceneName === "ajustes-protegidos" ? protectedScene : settingsScene,
  ) as SettingsView;
  if (
    sceneName === "ajustes-con-diseno" ||
    sceneName === "ajustes-layout-protegido"
  )
    settings.track.exists = true;
  if (sceneName === "ajustes-layout-protegido") settings.track.protected = true;
  let revision = 0;
  let pending: SettingsPatch | undefined;
  let conflicted = false;
  function commit(patch: SettingsPatch) {
    settings = {
      ...apply(settings, patch),
      revision: (++revision).toString(16).padStart(64, "0"),
      canRetry: false,
    };
    pending = undefined;
    return settings;
  }
  return (value: unknown): HostToUi | null => {
    if (!isUiMessage(value)) return null;
    if (value.kind === "hello")
      return value.version === HOST_PROTOCOL_VERSION
        ? helloForScene(sceneName)
        : null;
    if (value.kind === "subscribe")
      return value.topic === "core"
        ? { kind: "event", event: { topic: "core", value: core } }
        : { kind: "event", event: { topic: "simStatus", live: false } };
    if (value.kind !== "request") return null;
    const { id, request } = value;
    switch (request.method) {
      case "shortcuts.get":
        if (sceneName === "atajos-error")
          return { kind: "failure", id, error: { kind: "io" } };
        return {
          kind: "response",
          id,
          result: {
            method: "shortcuts.get",
            value:
              shortcuts as import("../contract/generated/contract").ShortcutsView,
          },
        };
      case "core.get":
        return {
          kind: "response",
          id,
          result: { method: "core.get", value: core },
        };
      case "window.close":
        return { kind: "closeRequested", reason: "window" };
      case "launcher.favorite":
        return {
          kind: "response",
          id,
          result: { method: "launcher.favorite", accepted: false },
        };
      case "notifications.test":
        return {
          kind: "response",
          id,
          result: { method: "notifications.test", accepted: false },
        };
      case "settings.get":
        return {
          kind: "response",
          id,
          result: { method: "settings.get", value: settings },
        };
      case "settings.update": {
        if (sceneName === "ajustes-error")
          return { kind: "failure", id, error: { kind: "io" } };
        if (
          settings.protected ||
          ((request.patch.field === "performance" ||
            request.patch.field === "hideOffTrack") &&
            (settings.track.protected || !settings.track.exists))
        )
          return { kind: "failure", id, error: { kind: "protected" } };
        if (
          (sceneName === "ajustes-conflicto" && !conflicted) ||
          request.baseRevision !== settings.revision
        ) {
          conflicted = true;
          pending = request.patch;
          settings = {
            ...settings,
            general: { ...settings.general, updates: false },
            revision: (++revision).toString(16).padStart(64, "0"),
            canRetry: true,
          };
          return {
            kind: "failure",
            id,
            error: { kind: "conflict", current: settings },
          };
        }
        return {
          kind: "response",
          id,
          result: { method: "settings.update", value: commit(request.patch) },
        };
      }
      case "settings.discard":
        pending = undefined;
        settings = { ...settings, canRetry: false };
        return {
          kind: "response",
          id,
          result: { method: "settings.discard", value: settings },
        };
      case "settings.retry":
        return {
          kind: "response",
          id,
          result: {
            method: "settings.retry",
            value: pending ? commit(pending) : settings,
          },
        };
    }
  };
}
// Pure single-message helper retained for boundary tests; live sessions own their state.
export const mockReply = (value: unknown) => createMockHost()(value);
