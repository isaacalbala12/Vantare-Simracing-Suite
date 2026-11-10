import scene from "../../fixtures/ajustes-base.json";
import coreScene from "../../fixtures/core-offline.json";
import diagnosticFixture from "../../fixtures/diagnostics-base.json";
import pilotFixture from "../../fixtures/pilot-base.json";
import privacyFixture from "../../fixtures/privacy-base.json";
import settingsScene from "../../fixtures/settings-base.json";
import protectedScene from "../../fixtures/settings-protected.json";
import shortcuts from "../../fixtures/shortcuts-base.json";
import updatesBase from "../../fixtures/updates-base.json";
import updatesReady from "../../fixtures/updates-ready.json";
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
export function createMockHost(
  sceneName = "ajustes-base",
  emit: (message: HostToUi) => void = () => {},
) {
  let maximized = false;
  const visual =
    /^visual-(dark|light):(ajustes-con-diseno|proximamente-base)$/.exec(
      sceneName,
    );
  sceneName = visual?.[2] ?? sceneName;
  const core = structuredClone(coreScene) as CoreStatus;
  let pilot = structuredClone(
    pilotFixture,
  ) as import("../contract/generated/contract").PilotView;
  let draft: import("../contract/generated/contract").ReportDraftView = {
    fields: {
      module: "unknown",
      actionText: "",
      expectedText: "",
      observedText: "",
      contextText: "",
    },
    exists: false,
    screenshots: [],
  };
  const testing: import("../contract/generated/contract").TestingView = {
    reports: [],
    questionnaires: [],
  };
  if (sceneName.startsWith("testing-")) {
    core.access = {
      ...core.access,
      verified: true,
      blocked: false,
      tester: sceneName.startsWith("testing-tester"),
    };
    core.services = "connected";
  }
  let pilotConflicted = false;
  if (sceneName.startsWith("cuenta-") && sceneName !== "cuenta-desconectada")
    core.services = "connected";
  if (sceneName === "privacidad-mail") core.services = "connected";
  let privacy = structuredClone(
    privacyFixture,
  ) as import("../contract/generated/contract").PrivacyView;
  let diagnostic = structuredClone(
    diagnosticFixture,
  ) as import("../contract/generated/contract").DiagnosticView;
  let consent = false;
  let privacyRevision = 0;
  let privacyConflict = false;
  if (sceneName === "privacidad-protegida") privacy.protected = true;
  if (sceneName === "privacidad-limpieza-ocupada") {
    privacy.cleanupPending = true;
    privacy.cleanupBusy = true;
  }
  if (sceneName === "diagnostico-observado")
    diagnostic.events = [
      { section: "services", code: "unavailable", sequence: 1 },
      { section: "privacy", code: "conflict", sequence: 2 },
    ];
  function note(
    section: import("../contract/generated/contract").DiagnosticSection,
    code: import("../contract/generated/contract").DiagnosticCode,
  ) {
    diagnostic = {
      ...diagnostic,
      events: [
        ...diagnostic.events,
        { section, code, sequence: diagnostic.events.length + 1 },
      ],
    };
  }

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
  return (value: unknown): HostToUi | null => {
    if (!isUiMessage(value)) return null;
    if (value.kind === "closeAnswer" && sceneName === "cierre-live-pendiente")
      return {
        kind: "event",
        event: { topic: "simStatus", live: value.allow },
      };
    if (value.kind === "hello")
      return value.version === HOST_PROTOCOL_VERSION
        ? helloForScene(sceneName)
        : null;
    if (value.kind === "subscribe" && value.topic === "windowState")
      return { kind: "event", event: { topic: "windowState", maximized } };
    if (value.kind === "subscribe" && value.topic === "updates")
      return {
        kind: "event",
        event: {
          topic: "updates",
          value: (sceneName === "actualizacion-lista"
            ? updatesReady
            : updatesBase) as import("../contract/generated/contract").UpdatesView,
        },
      };
    if (value.kind === "subscribe")
      return value.topic === "core"
        ? { kind: "event", event: { topic: "core", value: core } }
        : { kind: "event", event: { topic: "simStatus", live: false } };
    if (value.kind !== "request") return null;
    const { id, request } = value;
    switch (request.method) {
      case "testing.answer":
      case "testing.contribute":
      case "testing.credit":
      case "testing.noticeRead":
        return { kind: "failure", id, error: { kind: "unsupported" } };
      case "report.capture":
      case "report.removeScreenshot":
        return { kind: "failure", id, error: { kind: "unsupported" } };
      case "report.prepare":
      case "report.retryPrepare":
        return {
          kind: "response",
          id,
          result: {
            method: request.method,
            value: {
              id: "a".repeat(64),
              digest: "b".repeat(64),
              fields: structuredClone(draft.fields),
              appVersion: "QA",
              osVersion: "Windows",
              channel: "nightly",
              retry: request.method === "report.retryPrepare",
              screenshots: [],
            },
          },
        };
      case "report.send":
        return { kind: "failure", id, error: { kind: "unsupported" } };
      case "testing.refresh":
      case "draft.load":
      case "draft.save":
      case "draft.discard": {
        if (!core.access.verified || core.access.blocked)
          return { kind: "failure", id, error: { kind: "denied" } };
        if (core.services !== "connected" || sceneName === "testing-offline")
          return { kind: "failure", id, error: { kind: "coreUnavailable" } };
        if (request.method === "testing.refresh")
          return {
            kind: "response",
            id,
            result: { method: request.method, value: structuredClone(testing) },
          };
        if (request.method === "draft.save")
          draft = {
            fields: structuredClone(request.fields),
            exists: true,
            screenshots: [],
          };
        if (request.method === "draft.discard")
          draft = {
            fields: {
              module: "unknown",
              actionText: "",
              expectedText: "",
              observedText: "",
              contextText: "",
            },
            exists: false,
            screenshots: [],
          };
        return {
          kind: "response",
          id,
          result: { method: request.method, value: structuredClone(draft) },
        };
      }
      case "pilot.load":
        if (sceneName === "cuenta-desconectada")
          return { kind: "failure", id, error: { kind: "coreUnavailable" } };
        return {
          kind: "response",
          id,
          result: { method: request.method, value: structuredClone(pilot) },
        };
      case "pilot.save":
        if (sceneName === "cuenta-error")
          return { kind: "failure", id, error: { kind: "io" } };
        if (sceneName === "cuenta-ocupada")
          return { kind: "failure", id, error: { kind: "busy" } };
        if (sceneName === "cuenta-conflicto" && !pilotConflicted) {
          pilotConflicted = true;
          pilot = {
            ...pilot,
            revision: "2",
            fields: { ...pilot.fields, favoriteTeam: "Cambio concurrente QA" },
          };
          return { kind: "failure", id, error: { kind: "denied" } };
        }
        if (request.baseRevision !== pilot.revision)
          return { kind: "failure", id, error: { kind: "denied" } };
        pilot = {
          fields: structuredClone(request.fields),
          revision: String(BigInt(pilot.revision) + 1n),
          pending: false,
        };
        return {
          kind: "response",
          id,
          result: { method: request.method, value: structuredClone(pilot) },
        };

      case "privacy.policy":
        return {
          kind: "response",
          id,
          result: { method: request.method, accepted: false },
        };
      case "privacy.get":
        return {
          kind: "response",
          id,
          result: { method: request.method, value: privacy },
        };
      case "privacy.update": {
        if (privacy.protected)
          return { kind: "failure", id, error: { kind: "protected" } };
        if (sceneName === "privacidad-ocupada") {
          note("privacy", "busy");
          return { kind: "failure", id, error: { kind: "busy" } };
        }
        if (
          request.baseRevision !== privacy.revision ||
          (sceneName === "privacidad-conflicto" && !privacyConflict)
        ) {
          privacyConflict = true;
          privacy = {
            ...privacy,
            usage: true,
            usageDecided: true,
            revision: (++privacyRevision).toString(16).padStart(64, "0"),
          };
          note("privacy", "conflict");
          return {
            kind: "failure",
            id,
            error: { kind: "privacyConflict", current: privacy },
          };
        }
        privacy = {
          ...privacy,
          [request.patch.field]: request.patch.value,
          crashesDecided:
            privacy.crashesDecided || request.patch.field === "crashes",
          usageDecided: privacy.usageDecided || request.patch.field === "usage",
          revision: (++privacyRevision).toString(16).padStart(64, "0"),
        };
        privacy.cleanupBusy = false;
        privacy.cleanupPending = sceneName === "privacidad-limpieza-error";
        if (privacy.cleanupPending)
          return {
            kind: "failure",
            id,
            error: { kind: "privacyCleanup", current: privacy },
          };
        return {
          kind: "response",
          id,
          result: { method: request.method, value: privacy },
        };
      }
      case "mail.get":
        return core.services === "connected"
          ? {
              kind: "response",
              id,
              result: { method: request.method, value: { consent } },
            }
          : { kind: "failure", id, error: { kind: "coreUnavailable" } };
      case "mail.set": {
        if (core.services !== "connected")
          return { kind: "failure", id, error: { kind: "coreUnavailable" } };
        consent = request.consent;
        return {
          kind: "response",
          id,
          result: { method: request.method, value: { consent } },
        };
      }
      case "diagnostics.get":
        return {
          kind: "response",
          id,
          result: { method: request.method, value: diagnostic },
        };
      case "diagnostics.prepare": {
        if (sceneName === "cierre-live-pendiente")
          return { kind: "closeRequested", reason: "live" };
        diagnostic = {
          ...diagnostic,
          report: JSON.stringify({
            schemaVersion: 1,
            observed: { ...diagnostic, report: null },
          }),
        };
        return {
          kind: "response",
          id,
          result: { method: request.method, value: diagnostic },
        };
      }
      case "diagnostics.copy":
        return diagnostic.report
          ? {
              kind: "response",
              id,
              result: { method: request.method, text: diagnostic.report },
            }
          : { kind: "failure", id, error: { kind: "unsupported" } };

      case "updates.get":
        if (sceneName === "actualizacion-error")
          return { kind: "failure", id, error: { kind: "io" } };
        return {
          kind: "response",
          id,
          result: {
            method: "updates.get",
            value: (sceneName === "actualizacion-lista"
              ? updatesReady
              : updatesBase) as import("../contract/generated/contract").UpdatesView,
          },
        };
      case "updates.restart":
        return {
          kind: "response",
          id,
          result: {
            method: "updates.restart",
            accepted: sceneName === "actualizacion-lista",
          },
        };
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
      case "window.minimize":
        return {
          kind: "response",
          id,
          result: { method: "window.minimize", accepted: true },
        };
      case "window.toggleMaximize": {
        maximized = !maximized;
        const windowMaximized = maximized;
        queueMicrotask(() =>
          emit({
            kind: "event",
            event: { topic: "windowState", maximized: windowMaximized },
          }),
        );
        return {
          kind: "response",
          id,
          result: { method: "window.toggleMaximize", accepted: true },
        };
      }
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
