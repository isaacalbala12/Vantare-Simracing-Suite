import settingsScene from "../../../fixtures/settings-base.json";
import protectedScene from "../../../fixtures/settings-protected.json";
import type {
  HostToUi,
  SettingsPatch,
  SettingsView,
  UiToHost,
} from "../../contract/generated/contract";
import type { MockContext, MockHandler } from "../context";

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
export function create(context: MockContext): MockHandler {
  const { sceneName, core, visual } = context;
  let settings = structuredClone(
    sceneName === "ajustes-protegidos" ? protectedScene : settingsScene,
  ) as SettingsView;
  if (visual) {
    settings.appearance.scheme = visual[1] as "dark" | "light";
    settings.startup.supported = true;
    core.rights = "connected";
    core.services = "connected";
    core.access.verified = true;
    core.access.tester = true;
  }
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
  return (value: UiToHost): HostToUi | null | undefined => {
    if (value.kind !== "request") return undefined;
    const { id, request } = value;
    switch (request.method) {
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

      default:
        return undefined;
    }
  };
}
