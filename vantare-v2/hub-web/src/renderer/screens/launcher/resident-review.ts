import { useQuery } from "@tanstack/react-query";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  LauncherProfile,
  LauncherView,
  ResidentQuestion,
  ResidentReviewState,
  ResidentView,
} from "../../../contract/generated/contract";
import { coreKey, offline, useHost } from "../../app/Host";
import { HostFailure } from "../../bridge/client";
import { resultsText } from "../../i18n/launcher-results";
import type { ResidentAnswerController } from "./resident-answer";
import {
  type AnswerScope,
  answerScope,
  sameAnswerScope,
} from "./resident-answer-model";
import { useLauncherSnapshot } from "./state";

type ReviewState = ResidentReviewState | "question" | "reviewing" | "too-long";
type ReviewQuestion = {
  question: ResidentQuestion;
  scope?: AnswerScope;
  profile?: Pick<LauncherProfile, "name" | "apps">;
};
export type ResidentReviewPanel = ReviewQuestion & {
  state: ReviewState;
  open: () => Promise<void>;
};
type ReviewAttempt = {
  scope: AnswerScope;
  state: ResidentReviewState | "reviewing";
  ignored?: ResidentReviewState;
};

function profileForReview(
  view: ResidentView | undefined,
  launcher: LauncherView | undefined,
  scope: AnswerScope | undefined,
) {
  const results = view?.execution?.results;
  if (
    !scope ||
    results?.kind !== "known" ||
    results.value.run !== scope.run ||
    results.value.accountGeneration !== scope.accountGeneration ||
    results.value.revision !== scope.revision ||
    launcher?.protected ||
    launcher?.revision !== scope.revision
  )
    return undefined;
  const profile = launcher.profiles.find(
    ({ id }) => id === results.value.profile,
  );
  return (
    profile && {
      name: profile.name,
      apps: profile.apps.map(
        (id) =>
          launcher.apps.find((app) => app.id === id)?.name ??
          resultsText.missingApp,
      ),
    }
  );
}

function openFailure(error: unknown): ResidentReviewState {
  if (
    error instanceof HostFailure &&
    error.detail.kind === "residentAnswerRejected"
  ) {
    switch (error.detail.reason) {
      case "account-changed":
      case "wrong-instance":
      case "wrong-run":
      case "revision-mismatch":
      case "stale-question":
        return "changed";
    }
  }
  return "unavailable";
}

export function useResidentReview(
  view: ResidentView | undefined,
  answer: ResidentAnswerController,
): ResidentReviewPanel | undefined {
  const { client, issue } = useHost();
  const { view: launcher } = useLauncherSnapshot();
  const { data: core = offline } = useQuery({
    queryKey: coreKey,
    queryFn: async () => offline,
    enabled: false,
  });
  const scope = useMemo(() => answerScope(view), [view]);
  const question = view?.decision?.actions.some(({ id }) => id === "trust")
    ? view.decision
    : undefined;
  const profile = useMemo(
    () => profileForReview(view, launcher, scope),
    [view, launcher, scope],
  );
  const [retained, setRetained] = useState<ReviewQuestion>();
  const [attempt, setAttempt] = useState<ReviewAttempt>();
  const inflight = useRef<ReviewAttempt | undefined>(undefined);
  const healthy =
    !issue &&
    !!client &&
    core.services === "connected" &&
    view?.online &&
    !view.protected;
  const outcome = view?.reviewOutcome;
  const retainedScope = retained?.scope;
  const sameRun =
    !!retainedScope &&
    view?.execution?.instance === retainedScope.instance &&
    core.accountGeneration === retainedScope.accountGeneration &&
    (view.execution.active?.run === retainedScope.run ||
      (view.execution.results.kind === "known" &&
        view.execution.results.value.run === retainedScope.run &&
        view.execution.results.value.revision === retainedScope.revision));
  const panel = question
    ? { question, scope, profile }
    : !view?.decision &&
        sameRun &&
        (outcome?.question === retainedScope?.decision ||
          (view?.running &&
            attempt &&
            sameAnswerScope(attempt.scope, retainedScope)) ||
          (answer.attempt?.target.action === "cancel" &&
            sameAnswerScope(answer.attempt.target, retainedScope)))
      ? retained
      : undefined;
  const currentScope = panel?.scope;
  const current =
    currentScope && attempt && sameAnswerScope(currentScope, attempt.scope)
      ? attempt
      : undefined;
  const relevant =
    healthy &&
    currentScope &&
    currentScope.accountGeneration === core.accountGeneration &&
    outcome?.question === currentScope.decision;
  const hostState =
    relevant && outcome?.state !== current?.ignored
      ? outcome?.state
      : undefined;
  const cancellation =
    currentScope &&
    answer.attempt &&
    answer.attempt.target.action === "cancel" &&
    sameAnswerScope(currentScope, answer.attempt.target)
      ? answer.attempt.phase
      : undefined;
  const canReview =
    !!healthy &&
    !!scope &&
    scope.accountGeneration === core.accountGeneration &&
    core.access.verified &&
    !core.access.blocked;

  useLayoutEffect(() => {
    if (!question || !scope) return;
    if (
      retained?.scope &&
      sameAnswerScope(retained.scope, scope) &&
      retained.question === question &&
      retained.profile === profile
    )
      return;
    setRetained({ question, scope, profile });
  }, [question, scope, profile, retained]);
  // Invalidate the promise even if the same question arrives on a new transport.
  // biome-ignore lint/correctness/useExhaustiveDependencies: changing the transport or account discards the outstanding intent.
  useLayoutEffect(() => {
    inflight.current = undefined;
    setAttempt(undefined);
    return () => {
      inflight.current = undefined;
    };
  }, [client, core.accountGeneration, healthy]);
  useLayoutEffect(() => {
    if (attempt && !current) {
      inflight.current = undefined;
      setAttempt(undefined);
    } else if (current?.ignored && !relevant) {
      setAttempt({ ...current, ignored: undefined });
    }
  }, [attempt, current, relevant]);

  if (!panel) return undefined;
  const declined =
    cancellation?.kind === "accepted" ||
    (cancellation?.kind === "finished" &&
      cancellation.outcome.kind === "cancelled");
  const state: ReviewState = declined
    ? "declined"
    : hostState === "trusted" || hostState === "declined"
      ? hostState
      : panel.question.review === "too-long"
        ? "too-long"
        : !question && current?.state === "reviewing"
          ? "reviewing"
          : !canReview || panel.question.review !== "available"
            ? "unavailable"
            : (hostState ?? current?.state ?? "question");
  return {
    ...panel,
    state,
    async open() {
      if (
        !scope ||
        !client ||
        !canReview ||
        inflight.current ||
        !["question", "changed", "expired"].includes(state)
      )
        return;
      const next = {
        scope,
        state: "reviewing",
        ignored: relevant ? outcome?.state : undefined,
      } as const;
      inflight.current = next;
      setAttempt(next);
      try {
        const reply = await client.request({
          method: "launcher.resident.reviewOpen",
          target: scope,
        });
        if (inflight.current !== next) return;
        const result =
          reply.method === "launcher.resident.reviewOpen"
            ? await client.reviewTrust(reply.value.ticket)
            : "unavailable";
        if (inflight.current === next && result !== "submitted")
          setAttempt({ ...next, state: result });
      } catch (error) {
        if (inflight.current === next)
          setAttempt({ ...next, state: openFailure(error) });
      } finally {
        if (inflight.current === next) inflight.current = undefined;
      }
    },
  };
}
