import scene from "../../fixtures/ajustes-base.json";
import coreScene from "../../fixtures/core-offline.json";
import diagnosticFixture from "../../fixtures/diagnostics-base.json";
import launcherFixture from "../../fixtures/launcher-base.json";
import editorFixture from "../../fixtures/launcher-editor.json";
import pilotFixture from "../../fixtures/pilot-base.json";
import privacyFixture from "../../fixtures/privacy-base.json";
import publication from "../../fixtures/roadmap-publication.json";
import settingsScene from "../../fixtures/settings-base.json";
import protectedScene from "../../fixtures/settings-protected.json";
import shortcuts from "../../fixtures/shortcuts-base.json";
import updatesBase from "../../fixtures/updates-base.json";
import updatesReady from "../../fixtures/updates-ready.json";
import type { ProfileDraft } from "../contract/generated/contract";
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
export function createMockHost(sceneName = "ajustes-base") {
  const visual =
    /^visual-(dark|light):(ajustes-con-diseno|proximamente-base|roadmap-base|notificaciones-base|launcher-base|launcher-ready)$/.exec(
      sceneName,
    );
  sceneName = visual?.[2] ?? sceneName;
  const core = structuredClone(coreScene) as CoreStatus;
  if (sceneName.startsWith("roadmap-")) core.access.verified = true;
  if (sceneName === "notificaciones-base") {
    core.access.verified = true;
    core.access.tester = true;
  }
  if (sceneName.startsWith("launcher-")) {
    core.rights = "connected";
    core.access.verified = true;
  }
  const launcher = structuredClone(
    launcherFixture,
  ) as import("../contract/generated/contract").LauncherView;
  if (
    sceneName === "launcher-ready" ||
    sceneName === "launcher-editor-ready" ||
    sceneName === "launcher-editor-custom" ||
    sceneName === "launcher-conflicto"
  ) {
    launcher.apps.forEach((app) => {
      app.available = true;
    });
    launcher.profiles.forEach((profile) => {
      profile.launchable = true;
    });
  }
  if (sceneName === "launcher-protected") {
    launcher.protected = true;
    launcher.profiles = [];
    launcher.apps = [];
  }
  if (sceneName === "launcher-offline") {
    launcher.resident = false;
  }

  const drafts = new Map<string, ProfileDraft>(
    launcher.profiles.map((profile) => [
      profile.id,
      {
        ...structuredClone(editorFixture.draft),
        id: profile.id,
        name: profile.name,
        description: profile.description,
        favorite: profile.favorite,
        steps: profile.apps.map((appId, index) => ({
          key: null,
          appId,
          delaySeconds: index ? 2 : 0,
          hasCustomArguments:
            sceneName === "launcher-editor-custom" && index === 0,
        })),
      } as ProfileDraft,
    ]),
  );
  let profileSerial = 0;
  let keySerial = 0;
  const stepKeys = new Map<
    string,
    { profile: string; revision: string; appId: string; customized: boolean }
  >();
  let reservedProfile: string | undefined;
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
    if (value.kind === "subscribe" && value.topic === "launcher")
      return {
        kind: "event",
        event: { topic: "launcher", value: structuredClone(launcher) },
      };
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
      case "roadmap.cached":
      case "roadmap.refresh": {
        if (sceneName === "roadmap-base") return null;
        if (
          sceneName === "roadmap-error" &&
          request.method === "roadmap.refresh"
        )
          return { kind: "failure", id, error: { kind: "coreUnavailable" } };
        return {
          kind: "response",
          id,
          result: {
            method: request.method,
            value: {
              stale: sceneName === "roadmap-error",
              publication:
                sceneName === "roadmap-base"
                  ? null
                  : {
                      id: publication.id,
                      publishedAt: publication.published_at,
                      items: publication.document.items.map((item) => ({
                        id: item.id,
                        section: item.section,
                        title: item.title.es,
                        body: item.body.es,
                        area: item.area ?? null,
                        version: item.version ?? null,
                        dueDate: item.dueDate ?? null,
                      })),
                    },
            },
          },
        };
      }
      case "launcher.profile.get": {
        const draft =
          request.id === null
            ? (structuredClone(editorFixture.draft) as ProfileDraft)
            : structuredClone(drafts.get(request.id));
        if (!draft) return { kind: "failure", id, error: { kind: "denied" } };
        if (request.id === null) {
          draft.id = `profile-qa-${++profileSerial}`;
          reservedProfile = draft.id;
        }
        stepKeys.clear();
        for (const step of draft.steps) {
          step.key = (++keySerial).toString(16).padStart(64, "0");
          stepKeys.set(step.key, {
            profile: draft.id ?? "",
            revision: launcher.revision,
            appId: step.appId,
            customized: step.hasCustomArguments,
          });
        }
        return {
          kind: "response",
          id,
          result: {
            method: request.method,
            value: {
              revision: launcher.revision,
              draft: structuredClone(draft),
            },
          },
        };
      }
      case "launcher.profile.save": {
        if (
          sceneName === "launcher-conflicto" &&
          launcher.revision === "0".repeat(64)
        )
          launcher.revision = "1".repeat(64);
        if (request.baseRevision !== launcher.revision)
          return {
            kind: "failure",
            id,
            error: {
              kind: "launcherConflict",
              current: structuredClone(launcher),
            },
          };
        if (
          request.draft.steps.length === 0 ||
          request.draft.steps.some(
            (step) =>
              !launcher.apps.some(
                (app) => app.id === step.appId && app.available,
              ),
          )
        )
          return { kind: "failure", id, error: { kind: "denied" } };
        if (request.draft.id === null)
          return { kind: "failure", id, error: { kind: "denied" } };
        const profileId = request.draft.id;
        if (
          request.draft.id !== null &&
          !drafts.has(profileId) &&
          reservedProfile !== profileId
        )
          return { kind: "failure", id, error: { kind: "denied" } };
        const seen = new Set<string>();
        const saved = structuredClone(request.draft);
        for (const step of saved.steps) {
          const source = step.key === null ? undefined : stepKeys.get(step.key);
          if (
            step.key !== null &&
            (!source ||
              source.revision !== request.baseRevision ||
              source.profile !== profileId ||
              seen.has(step.key))
          )
            return { kind: "failure", id, error: { kind: "denied" } };
          if (step.key !== null) seen.add(step.key);
          step.hasCustomArguments =
            source?.appId === step.appId && source.customized;
        }
        drafts.set(profileId, {
          ...saved,
          id: profileId,
        });
        const entry = {
          id: profileId,
          name: request.draft.name,
          description: request.draft.description,
          favorite: request.draft.favorite,
          apps: request.draft.steps.map((step) => step.appId),
          launchable: true,
          options: {
            alreadyRunning: request.draft.policy.alreadyRunning,
            firstStepDelay: request.draft.policy.firstStepDelay,
            retries: request.draft.policy.retries,
            failure: request.draft.policy.failure,
            startup: request.draft.startup,
          },
        };
        const existing = launcher.profiles.findIndex(
          (profile) => profile.id === profileId,
        );
        if (existing < 0) launcher.profiles.push(entry);
        else launcher.profiles[existing] = entry;
        launcher.revision = (BigInt(`0x${launcher.revision}`) + 1n)
          .toString(16)
          .padStart(64, "0");
        return {
          kind: "response",
          id,
          result: { method: request.method, value: structuredClone(launcher) },
        };
      }
      case "launcher.get":
        return {
          kind: "response",
          id,
          result: { method: request.method, value: structuredClone(launcher) },
        };
      case "launcher.launch": {
        if (request.baseRevision !== launcher.revision)
          return {
            kind: "failure",
            id,
            error: {
              kind: "launcherConflict",
              current: structuredClone(launcher),
            },
          };
        if (!launcher.resident)
          return { kind: "failure", id, error: { kind: "coreUnavailable" } };
        if (launcher.running)
          return { kind: "failure", id, error: { kind: "busy" } };
        if (
          !launcher.profiles.some((profile) => profile.id === request.profile)
        )
          return { kind: "failure", id, error: { kind: "denied" } };
        launcher.running = true;
        launcher.profiles.forEach((profile) => {
          profile.launchable = false;
        });
        return {
          kind: "response",
          id,
          result: { method: request.method, accepted: true },
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
        // The notification QA scene reaches the full view through a real local error,
        // then clears it; it never bypasses the Windows-only notification control.
        if (
          sceneName === "ajustes-error" ||
          sceneName === "notificaciones-base"
        )
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
