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

type ReviewState =
  | ResidentReviewState
  | "question"
  | "reviewing"
  | "unconfirmed"
  | "too-long";
type ReviewQuestion = {
  question: ResidentQuestion;
  scope?: AnswerScope;
  profile?: Pick<LauncherProfile, "name" | "apps">;
};
export type ResidentReviewPanel = ReviewQuestion & {
  state: ReviewState;
  open?: () => Promise<void>;
  cancelOffered?: boolean;
};
type ReviewAttempt = {
  scope: AnswerScope;
  state: ResidentReviewState | "reviewing" | "unconfirmed";
  ignored?: ResidentReviewState;
};

type PendingReview = {
  scope: AnswerScope;
  awaitingMain?: true;
  interrupted?: true;
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
  const inflight = useRef<PendingReview | undefined>(undefined);
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
  // Only Main can confirm that it sent the decision. Its reply can arrive after
  // the renderer disconnects. Keep listening until the user starts another review.
  // biome-ignore lint/correctness/useExhaustiveDependencies: changing the transport or account discards the outstanding intent.
  useLayoutEffect(() => {
    const pending = inflight.current;
    if (
      pending?.awaitingMain &&
      pending.scope.accountGeneration === core.accountGeneration
    ) {
      pending.interrupted = true;
    } else {
      inflight.current = undefined;
    }
    setAttempt((previous) =>
      previous?.state === "unconfirmed" &&
      previous.scope.accountGeneration === core.accountGeneration
        ? previous
        : undefined,
    );
  }, [client, core.accountGeneration, healthy]);
  useLayoutEffect(
    () => () => {
      inflight.current = undefined;
    },
    [],
  );
  useLayoutEffect(() => {
    const pending = inflight.current;
    if (
      pending &&
      healthy &&
      !(scope
        ? sameAnswerScope(pending.scope, scope)
        : sameRun && !view?.decision)
    ) {
      inflight.current = undefined;
    }
    if (attempt && !current && healthy) {
      setAttempt(undefined);
    } else if (current?.ignored && !relevant) {
      setAttempt({ ...current, ignored: undefined });
    }
  }, [attempt, current, healthy, relevant, sameRun, scope, view?.decision]);

  if (
    !panel ||
    (currentScope && currentScope.accountGeneration !== core.accountGeneration)
  )
    return undefined;
  const declined =
    cancellation?.kind === "accepted" ||
    (cancellation?.kind === "finished" &&
      cancellation.outcome.kind === "cancelled");
  const availability = panel.question.review;
  let state: ReviewState = "unavailable";
  if (declined) state = "declined";
  else if (hostState) state = hostState;
  else if (current?.state === "unconfirmed") state = "unconfirmed";
  else if (availability === "too-long") state = "too-long";
  else if (current?.state === "reviewing") state = "reviewing";
  else if (canReview && availability === "available")
    state = current?.state ?? "question";

  if (
    !scope ||
    !client ||
    !canReview ||
    availability !== "available" ||
    !["question", "changed", "expired"].includes(state)
  )
    return {
      ...panel,
      state,
      cancelOffered:
        !!healthy &&
        !!scope &&
        question?.actions.some(({ id }) => id === "cancel"),
    };
  return {
    ...panel,
    state,
    async open() {
      if (inflight.current && !inflight.current.interrupted) return;
      const next = {
        scope,
        state: "reviewing",
        ignored: relevant ? outcome?.state : undefined,
      } as const;
      const pending: PendingReview = { scope };
      inflight.current = pending;
      setAttempt(next);
      try {
        const reply = await client.request({
          method: "launcher.resident.reviewOpen",
          target: scope,
        });
        if (inflight.current !== pending) return;
        pending.awaitingMain =
          reply.method === "launcher.resident.reviewOpen" ? true : undefined;
        const result =
          reply.method === "launcher.resident.reviewOpen"
            ? await client.reviewTrust(reply.value.ticket)
            : "unavailable";
        if (inflight.current !== pending) return;
        if (result === "submitted" || result === "unconfirmed") {
          setAttempt({ ...next, state: "unconfirmed" });
        } else if (!pending.interrupted) {
          setAttempt(
            result === "interrupted" ? undefined : { ...next, state: result },
          );
        }
      } catch (error) {
        if (inflight.current === pending && !pending.interrupted)
          setAttempt({ ...next, state: openFailure(error) });
      } finally {
        if (inflight.current === pending) inflight.current = undefined;
      }
    },
  };
}
