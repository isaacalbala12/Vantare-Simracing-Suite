import { useQuery } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  ResidentResults,
  ResidentView,
} from "../../../contract/generated/contract";
import { coreKey, offline, useHost } from "../../app/Host";
import { useLauncherRequest } from "../../app/LauncherRequest";
import { HostFailure } from "../../bridge/client";
import type { AnswerClock } from "./resident-answer";
import { answerCursor } from "./resident-answer-model";
import {
  type ControlAttempt,
  type ControlIntent,
  isControlRejection,
  observeControl as observeReceipt,
  queuedControl,
  residentTerminalNoticeMs,
  sameControlIntent,
} from "./resident-control-model";
import { useLauncherSnapshot } from "./state";

const clock: AnswerClock = {
  now: () => performance.now(),
  schedule: (callback, delay) => {
    const id = setTimeout(callback, delay);
    return () => clearTimeout(id);
  },
};
function observeControl(
  attempt: ControlAttempt,
  resident: ResidentView | undefined,
  now: number,
): ControlAttempt {
  const next = observeReceipt(attempt, resident, now);
  // A stopped/replaced run releases the UI lock, but is not proof of its outcome.
  return next.phase.kind === "accepted" &&
    (!resident?.running || resident.execution?.active?.run !== next.phase.run)
    ? { ...next, phase: { kind: "unknown" } }
    : next;
}
export function useResidentControl(
  resident: ResidentView | undefined,
  time: AnswerClock = clock,
) {
  const { client, issue } = useHost();
  const launch = useLauncherRequest();
  const { view: document } = useLauncherSnapshot();
  const { data: core = offline } = useQuery({
    queryKey: coreKey,
    queryFn: async () => offline,
    enabled: false,
  });
  const [attempt, setAttempt] = useState<ControlAttempt>();
  const latest = useRef<ControlAttempt | undefined>(undefined),
    pending = useRef(false),
    epoch = useRef(0);
  const publish = useCallback((next: ControlAttempt | undefined) => {
    latest.current = next;
    setAttempt(next);
  }, []);
  const current = useRef({ resident, document, core, client, issue, launch });
  useLayoutEffect(() => {
    current.current = { resident, document, core, client, issue, launch };
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: session boundaries invalidate outstanding responses.
  useLayoutEffect(() => {
    epoch.current++;
    pending.current = false;
    const previous = latest.current;
    if (previous)
      publish(
        previous.target.accountGeneration !== core.accountGeneration
          ? undefined
          : ["sending", "queued", "accepted"].includes(previous.phase.kind)
            ? { ...previous, phase: { kind: "unknown" } }
            : previous,
      );
    return () => {
      epoch.current++;
      pending.current = false;
    };
  }, [
    client,
    core.accountGeneration,
    core.services,
    issue,
    resident?.execution?.instance,
    resident?.execution?.checkedControl,
    publish,
  ]);
  useEffect(() => {
    const previous = latest.current;
    if (
      !previous ||
      !["sending", "queued", "accepted"].includes(previous.phase.kind)
    )
      return;
    const next: ControlAttempt =
      issue ||
      core.services !== "connected" ||
      core.accountGeneration !== previous.target.accountGeneration
        ? { ...previous, phase: { kind: "unknown" } }
        : observeControl(previous, resident, time.now());
    publish(next);
  }, [resident, issue, core.services, core.accountGeneration, time, publish]);
  useEffect(() => {
    if (!attempt) return;
    if (attempt.phase.kind === "queued")
      return time.schedule(
        () => {
          const value = latest.current;
          if (value)
            publish(
              observeControl(value, current.current.resident, time.now()),
            );
        },
        Math.max(0, attempt.phase.until - time.now()),
      );
    if (attempt.phase.kind === "finished" || attempt.phase.kind === "rejected")
      return time.schedule(() => {
        if (latest.current === attempt) publish(undefined);
      }, residentTerminalNoticeMs);
  }, [attempt, time, publish]);
  const execution = resident?.execution;
  const scope =
    execution && core.accountGeneration
      ? {
          instance: execution.instance,
          accountGeneration: core.accountGeneration,
        }
      : undefined;
  const cancelTarget = execution?.active
    ? { instance: execution.instance, ...execution.active }
    : undefined;
  function disabledReason(
    intent: ControlIntent,
    live: typeof current.current,
    previous: ControlAttempt | undefined,
    posting: boolean,
  ):
    | "unavailable"
    | "unsupported"
    | "account"
    | "denied"
    | "busy"
    | "changed"
    | "active"
    | "scanning"
    | "noFailed"
    | "resultUnknown"
    | undefined {
    const execution = live.resident?.execution;
    if (
      !live.client ||
      live.issue ||
      live.core.services !== "connected" ||
      !live.resident?.online ||
      live.resident.protected ||
      !execution
    )
      return "unavailable";
    if (
      intent.kind === "retry"
        ? execution.results.kind === "unsupported"
        : !execution.checkedControl
    )
      return "unsupported";
    if (intent.target.accountGeneration !== live.core.accountGeneration)
      return "account";
    if (intent.target.instance !== execution.instance) return "changed";
    if (
      posting ||
      (previous && ["sending", "queued"].includes(previous.phase.kind))
    )
      return "busy";
    if (
      previous &&
      sameControlIntent(previous, intent) &&
      ["accepted", "unknown"].includes(previous.phase.kind)
    )
      return "busy";
    if (intent.kind === "cancel") {
      const active = execution.active;
      if (!active || !live.resident?.running) return "active";
      if (
        active.run !== intent.target.run ||
        active.revision !== intent.target.revision ||
        active.accountGeneration !== intent.target.accountGeneration
      )
        return "changed";
    } else {
      if (
        !live.core.access.verified ||
        live.core.access.blocked ||
        live.core.live
      )
        return "denied";
      if (live.document?.scanning) return "scanning";
      if (
        execution.active ||
        live.resident?.running ||
        live.document?.running ||
        live.launch.busy()
      )
        return "busy";
      if (
        !live.document ||
        live.document.protected ||
        live.document.revision !== intent.target.revision ||
        !live.document.profiles.some(
          (profile) => profile.id === intent.target.profile,
        )
      )
        return "changed";
      if (intent.kind === "retry") {
        const summary = execution.results;
        if (
          summary.kind !== "known" ||
          summary.value.run !== intent.target.run ||
          summary.value.profile !== intent.target.profile ||
          summary.value.revision !== intent.target.revision ||
          summary.value.accountGeneration !== intent.target.accountGeneration
        )
          return "changed";
        if (!summary.value.outcome) return "busy";
        if (
          !execution.events.some(
            (event) =>
              event.kind.kind === "finished" &&
              event.kind.run === summary.value.run,
          )
        )
          return "resultUnknown";
        if (
          intent.target.scope === "failed" &&
          !(
            "retryFailed" in summary.value && summary.value.retryFailed === true
          )
        )
          return "noFailed";
      }
    }
  }
  async function send(intent: ControlIntent) {
    if (
      disabledReason(intent, current.current, latest.current, pending.current)
    )
      return;
    const { client, resident } = current.current;
    if (!client || !resident) return;
    pending.current = true;
    const token = epoch.current;
    const next: ControlAttempt = {
      ...intent,
      cursor: answerCursor(resident),
      phase: { kind: "sending" },
    };
    publish(next);
    try {
      const reply =
        intent.kind === "cancel"
          ? await client.request({
              method: "launcher.resident.cancel",
              target: intent.target,
            })
          : intent.kind === "rehearse"
            ? await client.request({
                method: "launcher.resident.rehearse",
                target: intent.target,
              })
            : await client.request({
                method: "launcher.resident.retry",
                target: intent.target,
              });
      if (token !== epoch.current) return;
      const queued =
        intent.kind === "cancel" && reply.method === "launcher.resident.cancel"
          ? reply.value
          : intent.kind === "rehearse" &&
              reply.method === "launcher.resident.rehearse"
            ? reply.value
            : intent.kind === "retry" &&
                reply.method === "launcher.resident.retry"
              ? reply.value
              : undefined;
      publish(
        queued
          ? observeControl(
              queuedControl(next, queued.request, time.now()),
              current.current.resident,
              time.now(),
            )
          : { ...next, phase: { kind: "unknown" } },
      );
    } catch (error) {
      if (token !== epoch.current) return;
      publish({
        ...next,
        phase:
          error instanceof HostFailure &&
          error.detail.kind === "residentControlRejected" &&
          (intent.kind === "retry" || isControlRejection(error.detail.reason))
            ? { kind: "rejected", reason: error.detail.reason }
            : error instanceof HostFailure &&
                (error.detail.kind === "busy" ||
                  error.detail.kind === "unsupported" ||
                  error.detail.kind === "denied" ||
                  error.detail.kind === "rejected")
              ? { kind: "rejected", reason: error.detail.kind }
              : { kind: "unknown" },
      });
    } finally {
      if (token === epoch.current) pending.current = false;
    }
  }
  const busy =
    !!resident?.running ||
    (!!attempt &&
      ["sending", "queued", "accepted"].includes(attempt.phase.kind));
  const rawResults = execution?.results;
  const results: ResidentResults =
    !issue &&
    resident?.online &&
    !resident.protected &&
    core.services === "connected" &&
    rawResults &&
    (rawResults.kind !== "known" ||
      rawResults.value.accountGeneration === core.accountGeneration)
      ? rawResults
      : { kind: "unknown" };
  return {
    results,
    attempt,
    scope,
    capable: execution?.checkedControl === true,
    hasProfiles: !!document?.profiles.length,
    cancelTarget,
    busy,
    reason: (intent: ControlIntent) =>
      disabledReason(
        intent,
        { resident, document, core, client, issue, launch },
        attempt,
        false,
      ),
    cancel: (target: Extract<ControlIntent, { kind: "cancel" }>["target"]) =>
      send({ kind: "cancel", target }),
    rehearse: (
      target: Extract<ControlIntent, { kind: "rehearse" }>["target"],
    ) => send({ kind: "rehearse", target }),
    retry: (target: Extract<ControlIntent, { kind: "retry" }>["target"]) =>
      send({ kind: "retry", target }),
  };
}
export type ResidentControlController = ReturnType<typeof useResidentControl>;
