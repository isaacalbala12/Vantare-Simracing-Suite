import privacyFixture from "../../../fixtures/privacy-base.json";
import type { HostToUi, UiToHost } from "../../contract/generated/contract";
import type { MockContext, MockHandler } from "../context";
export function create(context: MockContext): MockHandler {
  const { sceneName, core, note } = context;
  if (sceneName === "privacidad-mail" || sceneName === "privacidad-mail-error")
    core.services = "connected";
  let privacy = structuredClone(
    privacyFixture,
  ) as import("../../contract/generated/contract").PrivacyView;
  // Ordinary QA scenes represent an existing user who declined both options.
  // The explicit first-run scenes below alone leave decisions pending.
  privacy.crashesDecided = true;
  privacy.usageDecided = true;
  let consent = false;
  let privacyRevision = 0;
  let privacyConflict = false;
  if (
    [
      "privacidad-pendiente",
      "onboarding-error-privacidad",
      "privacidad-uso",
      "privacidad-error",
      "privacidad-puerta-conflicto",
      "privacidad-puerta-protegida",
    ].includes(sceneName)
  ) {
    privacy.crashes = false;
    privacy.usage = false;
    privacy.crashesDecided = sceneName === "privacidad-uso";
    privacy.usageDecided = false;
  }
  if (
    ["onboarding-6", "onboarding-7", "onboarding-sin-diseno"].includes(
      sceneName,
    )
  ) {
    privacy.crashesDecided = false;
    privacy.usageDecided = false;
    if (context.visual) privacy.reportingConfigured = true;
  }
  if (sceneName === "privacidad-protegida") privacy.protected = true;
  if (sceneName === "privacidad-puerta-protegida") privacy.protected = true;
  if (sceneName === "privacidad-limpieza-ocupada") {
    privacy.cleanupPending = true;
    privacy.cleanupBusy = true;
  }
  return (value: UiToHost): HostToUi | null | undefined => {
    if (value.kind !== "request") return undefined;
    const { id, request } = value;
    if (context.onboarding)
      context.onboarding.privacyEnabled = privacy.crashes || privacy.usage;
    if (context.onboarding?.privateConsent)
      privacy = {
        ...privacy,
        crashes: false,
        usage: false,
        crashesDecided: true,
        usageDecided: true,
      };
    if (
      request.method === "privacy.update" &&
      sceneName === "onboarding-error-privacidad"
    )
      return { kind: "failure", id, error: { kind: "io" } };
    switch (request.method) {
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
        if (sceneName === "privacidad-error")
          return { kind: "failure", id, error: { kind: "io" } };
        if (privacy.protected)
          return { kind: "failure", id, error: { kind: "protected" } };
        if (sceneName === "privacidad-ocupada") {
          note("privacy", "busy");
          return { kind: "failure", id, error: { kind: "busy" } };
        }
        if (
          request.baseRevision !== privacy.revision ||
          (["privacidad-conflicto", "privacidad-puerta-conflicto"].includes(
            sceneName,
          ) &&
            !privacyConflict)
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
        if (context.onboarding)
          context.onboarding.privacyEnabled = privacy.crashes || privacy.usage;
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
        if (context.visual)
          return { kind: "failure", id, error: { kind: "denied" } };
        return core.services === "connected"
          ? {
              kind: "response",
              id,
              result: { method: request.method, value: { consent } },
            }
          : { kind: "failure", id, error: { kind: "coreUnavailable" } };
      case "mail.set":
        if (sceneName === "privacidad-mail-error")
          return { kind: "failure", id, error: { kind: "io" } };
        {
          if (core.services !== "connected")
            return { kind: "failure", id, error: { kind: "coreUnavailable" } };
          consent = request.consent;
          return {
            kind: "response",
            id,
            result: { method: request.method, value: { consent } },
          };
        }

      default:
        return undefined;
    }
  };
}
