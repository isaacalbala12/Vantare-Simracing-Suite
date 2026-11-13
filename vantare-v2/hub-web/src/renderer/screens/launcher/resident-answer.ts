import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ResidentAction,
  ResidentView,
} from "../../../contract/generated/launcher_resident";
import { coreKey, offline, useHost } from "../../app/Host";
import { HostFailure } from "../../bridge/client";
import {
  type AnswerAttempt,
  type AnswerScope,
  answerCursor,
  answerScope,
  observeAnswer,
  queuedAnswer,
  sameAnswerScope,
} from "./resident-answer-model";
export interface AnswerClock {
  now(): number;
  schedule(callback: () => void, delay: number): () => void;
}
const clock: AnswerClock = {
  now: () => performance.now(),
  schedule: (callback, delay) => {
    const id = setTimeout(callback, delay);
    return () => clearTimeout(id);
  },
};
export function useResidentAnswer(
  view?: ResidentView,
  time: AnswerClock = clock,
) {
  const { client, issue } = useHost();
  const { data: core = offline } = useQuery({
    queryKey: coreKey,
    queryFn: async () => offline,
    enabled: false,
  });
  const [attempt, setAttempt] = useState<AnswerAttempt>();
  const latest = useRef<AnswerAttempt | undefined>(undefined);
  const publish = useCallback((next: AnswerAttempt | undefined) => {
    latest.current = next;
    setAttempt(next);
  }, []);
  const current = useRef({ view, core, client, issue });
  current.current = { view, core, client, issue };
  const pending = useRef(false),
    epoch = useRef(0);
  // A new transport or account invalidates every pending response, even when rights match.
  // biome-ignore lint/correctness/useExhaustiveDependencies: these are session boundaries, not render inputs.
  useEffect(() => {
    epoch.current++;
    pending.current = false;
    const previous = latest.current;
    if (previous)
      publish(
        ["finished", "rejected"].includes(previous.phase.kind)
          ? undefined
          : { ...previous, phase: { kind: "unknown" } },
      );
    return () => {
      epoch.current++;
      pending.current = false;
    };
  }, [client, core.accountGeneration, core.services, issue, publish]);
  useEffect(() => {
    const previous = latest.current;
    if (!previous) return;
    const question = answerScope(view);
    if (
      view?.decision &&
      (!question || !sameAnswerScope(question, previous.target))
    ) {
      epoch.current++;
      pending.current = false;
      publish(undefined);
      return;
    }
    const next =
      issue ||
      core.services !== "connected" ||
      core.accountGeneration !== previous.target.accountGeneration
        ? { ...previous, phase: { kind: "unknown" as const } }
        : observeAnswer(previous, view, time.now());
    if (next !== previous) publish(next);
  }, [view, issue, core.services, core.accountGeneration, time, publish]);
  useEffect(() => {
    if (attempt?.phase.kind !== "queued") return;
    return time.schedule(
      () => {
        const previous = latest.current;
        if (previous)
          publish(observeAnswer(previous, current.current.view, time.now()));
      },
      Math.max(0, attempt.phase.until - time.now()),
    );
  }, [attempt, time, publish]);
  function available(action: ResidentAction) {
    const { view, core, client, issue } = current.current;
    const execution = view?.execution;
    const scope = execution?.question;
    if (
      !client ||
      issue ||
      pending.current ||
      action === "trust" ||
      !view?.online ||
      view.protected ||
      !execution?.checkedAnswer ||
      !scope ||
      scope.decision !== view.decision?.id ||
      scope.accountGeneration !== core.accountGeneration ||
      core.services !== "connected" ||
      !view.decision.actions.some((choice) => choice.id === action)
    )
      return false;
    if (
      ["reuse", "restart", "continue"].includes(action) &&
      (!core.access.verified || core.access.blocked)
    )
      return false;
    const attempt = latest.current;
    return !(
      attempt &&
      attempt.phase.kind !== "rejected" &&
      attempt.target.instance === execution.instance &&
      attempt.target.accountGeneration === scope.accountGeneration &&
      attempt.target.decision === scope.decision &&
      attempt.target.run === scope.run
    );
  }
  async function answer(action: ResidentAction, rendered: AnswerScope) {
    const live = answerScope(current.current.view);
    if (!live || !sameAnswerScope(rendered, live) || !available(action)) return;
    const { view, client } = current.current;
    const execution = view?.execution,
      scope = execution?.question;
    if (!view || !client || !execution || !scope) return;
    pending.current = true;
    const token = epoch.current;
    const next: AnswerAttempt = {
      target: { ...rendered, action },
      cursor: answerCursor(view),
      phase: { kind: "sending" },
    };
    publish(next);
    try {
      const reply = await client.request({
        method: "launcher.resident.answer",
        target: next.target,
      });
      if (token !== epoch.current) return;
      publish(
        reply.method === "launcher.resident.answer"
          ? observeAnswer(
              queuedAnswer(next, reply.value.request, time.now()),
              current.current.view,
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
          error.detail.kind === "residentAnswerRejected"
            ? { kind: "rejected", reason: error.detail.reason }
            : error instanceof HostFailure &&
                ["busy", "denied", "unsupported", "rejected"].includes(
                  error.detail.kind,
                )
              ? {
                  kind: "rejected",
                  reason: error.detail.kind as
                    | "busy"
                    | "denied"
                    | "unsupported"
                    | "rejected",
                }
              : { kind: "unknown" },
      });
    } finally {
      if (token === epoch.current) pending.current = false;
    }
  }
  return { attempt, available, answer };
}
export type ResidentAnswerController = ReturnType<typeof useResidentAnswer>;
