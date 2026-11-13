// Deterministic UI double only: no mailbox writer, processes, timers or system notifications.
import launcher from "../../fixtures/launcher-base.json";
import {
  type CalendarConfigView,
  type CalendarLaunchPlan,
  type CalendarLaunchView,
  calendarLaunchLeadMs,
  calendarLaunchMaxFutureMs,
} from "../contract/generated/calendar";
import type { HostToUi, UiToHost } from "../contract/generated/contract";
import type { MockContext } from "./context";
export function calendarLaunchMock(
  context: MockContext,
  config: () => CalendarConfigView,
  clock: () => number,
) {
  const view: CalendarLaunchView = {
    armed: null,
    automatic: null,
    latest: null,
    change: null,
  };
  const generations = new Map<string, string>();
  let sequence = 0;
  const snapshot = (): HostToUi => ({
    kind: "event",
    event: { topic: "calendarLaunch", value: structuredClone(view) },
  });
  const cancel = (
    plan: CalendarLaunchPlan,
    reason: NonNullable<CalendarLaunchView["change"]>["reason"],
  ) => {
    view.change = { plan: structuredClone(plan), reason };
    generations.delete(plan.armId);
    if (view.armed?.armId === plan.armId) view.armed = null;
    if (view.automatic?.armId === plan.armId) view.automatic = null;
  };
  return (message: UiToHost): HostToUi | undefined => {
    const core = context.core;
    for (const plan of [view.armed, view.automatic])
      if (plan) {
        const reason =
          core.rights !== "connected"
            ? "coreDisconnected"
            : generations.get(plan.armId) !== core.accountGeneration
              ? "accountChanged"
              : core.live
                ? "live"
                : !core.access.verified ||
                    core.access.blocked ||
                    !core.access.calendar
                  ? "rightsLost"
                  : undefined;
        if (reason) cancel(plan, reason);
      }
    if (view.automatic && !config().alerts.autoLaunch)
      cancel(view.automatic, "disabled");
    if (message.kind === "subscribe" && message.topic === "calendarLaunch")
      return snapshot();
    if (
      message.kind !== "request" ||
      (message.request.method !== "calendar.launchArm" &&
        message.request.method !== "calendar.launchCancel")
    )
      return undefined;
    const { id, request } = message;
    if (
      !core.access.verified ||
      core.access.blocked ||
      !core.access.calendar ||
      core.rights !== "connected" ||
      core.live ||
      !core.accountGeneration
    )
      return { kind: "failure", id, error: { kind: "denied" } };
    if (request.method === "calendar.launchCancel") {
      for (const plan of [view.armed, view.automatic])
        if (plan?.armId === request.armId) cancel(plan, "user");
      context.emit?.(snapshot());
      return {
        kind: "response",
        id,
        result: { method: request.method, value: structuredClone(view) },
      };
    }
    if (context.sceneName !== "calendar-launch-reference")
      return { kind: "failure", id, error: { kind: "unsupported" } };
    if (request.armedGeneration !== core.accountGeneration)
      return { kind: "failure", id, error: { kind: "denied" } };
    if (request.baseRevision !== launcher.revision)
      return { kind: "failure", id, error: { kind: "rejected" } };
    const profile = launcher.profiles.find(
      (profile) => profile.id === request.profile,
    );
    if (!profile) return { kind: "failure", id, error: { kind: "denied" } };
    const current = config();
    if (
      request.mode.kind === "once" &&
      (request.mode.startAt < clock() + calendarLaunchLeadMs ||
        request.mode.startAt >
          clock() + calendarLaunchLeadMs + calendarLaunchMaxFutureMs)
    )
      return { kind: "failure", id, error: { kind: "rejected" } };
    if (
      request.mode.kind === "alerts" &&
      (current.documents.alerts !== "ready" ||
        request.mode.expectedRevision !== current.alertsRevision)
    )
      return {
        kind: "failure",
        id,
        error: { kind: "calendarConflict", current: structuredClone(current) },
      };
    const key = request.mode.kind === "once" ? "armed" : "automatic";
    const old = view[key];
    if (old) cancel(old, "replaced");
    const plan: CalendarLaunchPlan = {
      armId: (++sequence).toString(16).padStart(64, "0"),
      profile: request.profile,
      profileName:
        context.sceneName === "calendar-launch-reference"
          ? "Carrera LMU"
          : profile.name,
      decisionRequired:
        profile.options.alreadyRunning === "ask" ||
        profile.options.failure === "ask",
      mode: structuredClone(request.mode),
    };
    generations.set(plan.armId, request.armedGeneration);
    view[key] = plan;
    if (key === "automatic") {
      current.alerts.autoLaunch = true;
      current.alertsRevision = sequence.toString(16).padStart(64, "0");
    }
    context.emit?.(snapshot());
    return {
      kind: "response",
      id,
      result: {
        method: request.method,
        value: structuredClone(view),
        config: key === "automatic" ? structuredClone(current) : null,
      },
    };
  };
}
