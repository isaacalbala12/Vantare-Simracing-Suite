import settings from "../../../fixtures/settings-base.json";
import type {
  OnboardingView,
  UiToHost,
} from "../../contract/generated/contract";
import type { MockContext, MockHandler } from "../context";
export function create(context: MockContext): MockHandler {
  const active = context.sceneName.startsWith("onboarding-");
  const state: NonNullable<MockContext["onboarding"]> = {
    completed: !active,
    settingsRevision: settings.revision,
    privacyFailed: false,
    privateSession: false,
    privateConsent: false,
    privacyReady: false,
    privacyEnabled: false,
  };
  context.onboarding = state;
  const view: OnboardingView = {
    pending: active,
    simulators: [true, false],
    scanning: false,
    equipment: { cpu: "Intel Core i5", cores: 6, ramGb: 16 },
    recommendedLevel: "balanced",
    layoutReady: context.sceneName !== "onboarding-sin-diseno",
    layoutRevision:
      context.sceneName === "onboarding-sin-diseno" ? null : "a".repeat(64),
    settingsRevision: state.settingsRevision,
    privateSession: false,
  };
  const current = (): OnboardingView => ({
    ...view,
    pending: !state.completed && !state.privateSession,
    settingsRevision: state.settingsRevision,
    privateSession: state.privateSession,
  });
  return (message: UiToHost) => {
    if (message.kind !== "request") return undefined;
    const { id, request } = message;
    switch (request.method) {
      case "onboarding.get":
        return {
          kind: "response",
          id,
          result: { method: request.method, value: current() },
        };
      case "onboarding.finish":
        if (
          state.completed ||
          state.privateSession ||
          state.privacyFailed ||
          !state.privacyReady
        )
          return { kind: "failure", id, error: { kind: "denied" } };
        if (
          request.baseRevision !== state.settingsRevision ||
          request.layoutRevision !== view.layoutRevision
        )
          return {
            kind: "failure",
            id,
            error: { kind: "onboardingConflict", current: current() },
          };
        state.completed = true;
        state.settingsRevision = `${"f".repeat(63)}1`;
        return {
          kind: "response",
          id,
          result: { method: request.method, value: current() },
        };
      case "onboarding.skipPrivate":
        if (state.completed || !state.privacyFailed || state.privacyEnabled)
          return { kind: "failure", id, error: { kind: "denied" } };
        state.privacyFailed = false;
        state.privateSession = true;
        state.privateConsent = true;
        return {
          kind: "response",
          id,
          result: { method: request.method, accepted: true },
        };
      case "onboarding.prices":
        return {
          kind: "response",
          id,
          result: { method: request.method, accepted: false },
        };
      default:
        return undefined;
    }
  };
}
