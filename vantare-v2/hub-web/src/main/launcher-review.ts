import type { MessageBoxOptions } from "electron";
import type { HostToUi, UiToHost } from "../contract/generated/contract";
import type {
  ResidentReviewTarget,
  ResidentView,
  ReviewFailure,
} from "../contract/generated/launcher_resident";
import {
  type LauncherReviewResult,
  reviewTicket,
} from "../contract/launcher-review-bridge";
import { isHostMessage } from "../contract/validation";
import { HOST_BACKGROUND_ID } from "./transport-ids";

const reviewLifetimeMs = 180_000;
const emptyTitle = "Este perfil importado no tiene pasos";
const labels = {
  back: "Atrás",
  next: "Siguiente",
  trust: "Confiar y lanzar",
  cancel: "Cancelar",
};
type Choice = keyof typeof labels;
type ReviewOptions = MessageBoxOptions & {
  cancelId: number;
  signal: AbortSignal;
};
type Dialog = (options: ReviewOptions) => Promise<number>;
type ActiveReview = {
  ticket: string;
  target: ResidentReviewTarget;
  signal: AbortController;
  phase: "content" | "dialog" | "receipt";
  timer: ReturnType<typeof setTimeout>;
  deadline: number;
  resolve: (result: LauncherReviewResult) => void;
  failure?: ReviewFailure;
};

function matches(view: ResidentView, target: ResidentReviewTarget): boolean {
  const execution = view.execution;
  const question = execution?.question;
  return (
    view.online &&
    view.running &&
    !view.protected &&
    execution?.instance === target.instance &&
    question?.decision === target.decision &&
    question.run === target.run &&
    question.revision === target.revision &&
    question.accountGeneration === target.accountGeneration &&
    view.decision?.id === target.decision
  );
}

// R1 frames each page as the fixed heading, one newline, and the full detail.
// Use that boundary only. Keep the heading and detail exactly as received.
function dialogPages(pages: string[]) {
  return pages.map((page, index) => {
    const boundary = page.indexOf("\n");
    if (boundary < 1 || boundary === page.length - 1)
      throw new Error("Invalid review page");
    const message = page.slice(0, boundary);
    const detail = page.slice(boundary + 1);
    const empty = message === emptyTitle && pages.length === 1;
    const suffix =
      pages.length === 1 ? "" : ` (parte ${index + 1} de ${pages.length})`;
    if (
      !empty &&
      (!message.endsWith(suffix) ||
        !/^Revisa (?:el paso|los [0-9]+ pasos) de este perfil importado$/.test(
          message.slice(0, message.length - suffix.length),
        ))
    )
      throw new Error("Invalid review heading");
    const choices: Choice[] = [];
    if (index > 0) choices.push("back");
    if (!empty) choices.push(index + 1 < pages.length ? "next" : "trust");
    choices.push("cancel");
    return { message, detail, choices };
  });
}

export function launcherReview(
  show: Dialog,
  sendHost: (message: UiToHost) => void,
  now: () => number = Date.now,
) {
  let expected:
    | { id: number; target: ResidentReviewTarget; invalidated: boolean }
    | undefined;
  let issued: { ticket: string; target: ResidentReviewTarget } | undefined;
  let active: ActiveReview | undefined;

  function finish(review: ActiveReview, result: LauncherReviewResult) {
    clearTimeout(review.timer);
    if (active === review) active = undefined;
    review.resolve(result);
  }

  function invalidate(reason: ReviewFailure = "changed") {
    if (expected) expected.invalidated = true;
    issued = undefined;
    const review = active;
    if (!review || review.signal.signal.aborted) return;
    clearTimeout(review.timer);
    review.signal.abort();
    // The resident may have received the decision before the transport failed.
    review.resolve(review.phase === "receipt" ? "unconfirmed" : reason);
    // Keep the slot until its outstanding response or native dialog returns.
    // R1 private frames have no correlation ID and must never reach a new review.
  }

  async function display(review: ActiveReview, pages: string[]) {
    const signal = review.signal.signal;
    try {
      const parts = dialogPages(pages);
      let index = 0;
      while (!signal.aborted) {
        const { message, detail, choices } = parts[index];
        const cancelId = choices.length - 1;
        const selected = await show({
          type: "warning",
          title: "Vantare · Revisar perfil importado",
          message,
          detail,
          buttons: choices.map((choice) => labels[choice]),
          defaultId: cancelId,
          cancelId,
          noLink: true,
          normalizeAccessKeys: false,
          signal,
        });
        if (signal.aborted) break;
        if (performance.now() >= review.deadline) {
          invalidate("expired");
          break;
        }
        const choice = choices[selected];
        if (choice === "back" || choice === "next") {
          index += choice === "back" ? -1 : 1;
          continue;
        }
        if (choice !== "trust" && choice !== "cancel") break;
        clearTimeout(review.timer);
        review.phase = "receipt";
        sendHost({
          kind: "reviewDecision",
          ticket: review.ticket,
          decision: choice,
          ...(choice === "trust" ? { issuedMs: now() } : {}),
        });
        // The host sends only private failures. An ordered read fences those
        // frames; actual acceptance still comes from the resident's order receipt.
        sendHost({
          kind: "request",
          id: HOST_BACKGROUND_ID,
          request: { method: "launcher.resident.get" },
        });
        return;
      }
    } catch {
      // Native errors may mention the contents. Return a closed result only.
      if (review.phase === "receipt") {
        invalidate("unavailable");
        return;
      }
    }
    finish(review, "unavailable");
  }

  return {
    invalidate,
    expect(id: number, target: ResidentReviewTarget) {
      if (expected || active) return false;
      issued = undefined;
      expected = { id, target, invalidated: false };
      return true;
    },
    open(ticket: string): Promise<LauncherReviewResult> {
      if (active || !reviewTicket([ticket]) || issued?.ticket !== ticket)
        return Promise.resolve("unavailable");
      const { target } = issued;
      issued = undefined;
      return new Promise((resolve) => {
        const review: ActiveReview = {
          ticket,
          target,
          signal: new AbortController(),
          phase: "content",
          timer: setTimeout(() => invalidate("expired"), reviewLifetimeMs),
          deadline: performance.now() + reviewLifetimeMs,
          resolve,
        };
        active = review;
        try {
          sendHost({ kind: "reviewContentRequest", ticket });
        } catch {
          finish(review, "unavailable");
        }
      });
    },
    receive(message: HostToUi): boolean {
      if (expected && "id" in message && message.id === expected.id) {
        const { target, invalidated } = expected;
        expected = undefined;
        if (
          !invalidated &&
          message.kind === "response" &&
          message.result.method === "launcher.resident.reviewOpen"
        ) {
          issued = { ticket: message.result.value.ticket, target };
        }
      }
      const scope = active?.target ?? issued?.target ?? expected?.target;
      if (scope && message.kind === "event") {
        const event = message.event;
        if (
          event.topic === "core" &&
          (event.value.accountGeneration !== scope.accountGeneration ||
            event.value.services !== "connected")
        )
          invalidate();
        if (event.topic === "launcherResident" && active?.phase !== "receipt") {
          const outcome = event.value.reviewOutcome;
          if (
            active &&
            outcome?.question === scope.decision &&
            outcome.state === "expired"
          )
            invalidate("expired");
          else if (
            !matches(event.value, scope) ||
            (active &&
              outcome?.question === scope.decision &&
              outcome.state === "changed")
          )
            invalidate();
        }
      }
      if (message.kind === "closeRequested") invalidate();
      if ("id" in message && message.id === HOST_BACKGROUND_ID) {
        if (active?.phase === "receipt") {
          finish(
            active,
            active.failure ??
              (message.kind === "response" &&
              message.result.method === "launcher.resident.get"
                ? "submitted"
                : "unconfirmed"),
          );
        }
        return true;
      }
      if (message.kind === "reviewFailure") {
        if (active?.phase === "content") finish(active, message.reason);
        else if (active?.phase === "receipt") active.failure = message.reason;
        return true;
      }
      if (message.kind === "reviewContent") {
        if (active?.phase === "content") {
          if (performance.now() >= active.deadline) invalidate("expired");
          if (active.signal.signal.aborted || !isHostMessage(message))
            finish(active, "unavailable");
          else {
            active.phase = "dialog";
            active.deadline = performance.now() + reviewLifetimeMs;
            clearTimeout(active.timer);
            active.timer = setTimeout(
              () => invalidate("expired"),
              reviewLifetimeMs,
            );
            void display(active, message.pages);
          }
        }
        return true;
      }
      return false;
    },
  };
}
