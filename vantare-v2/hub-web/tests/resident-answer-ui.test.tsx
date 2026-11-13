// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ResidentView } from "../src/contract/generated/launcher_resident";
import { residentText as text } from "../src/renderer/i18n/launcher-resident";
import type { ResidentAnswerController } from "../src/renderer/screens/launcher/resident-answer";
import { TooltipProvider } from "../src/renderer/ui/Layers";
import { ResidentInbox } from "../src/renderer/ui/launcher/ResidentInbox";

const view: ResidentView = {
  execution: {
    instance: "b".repeat(64),
    checkedAnswer: true,
    checkedControl: false,
    stepResultsRetry: false,
    results: null,
    active: null,
    revisionCheckedLaunch: true,
    firstRetainedSeq: "1",
    events: [{ seq: "1", kind: { kind: "started", run: "1" } }],
    question: {
      decision: "2",
      run: "1",
      revision: "c".repeat(64),
      accountGeneration: "a".repeat(64),
    },
  },
  protected: false,
  online: true,
  running: true,
  error: false,
  registrations: [],
  decision: {
    id: "2",
    kind: "authorization",
    actions: [
      { id: "trust", label: "Confiar y lanzar" },
      { id: "cancel", label: "Cancelar" },
    ],
  },
};
afterEach(cleanup);
function mount(answer: ResidentAnswerController) {
  return render(
    <CSPProvider disableStyleElements>
      <TooltipProvider>
        <ResidentInbox view={view} answer={answer} />
      </TooltipProvider>
    </CSPProvider>,
  );
}
it("Trust explains the editor requirement and cannot answer, while offered Cancel answers explicitly", () => {
  const answer = vi.fn();
  mount({
    answer,
    available: (action) => action === "cancel",
    attempt: undefined,
  });
  const trust = screen.getByRole("button", { name: "Confiar y lanzar" });
  expect(trust.getAttribute("aria-disabled")).toBe("true");
  expect(
    document.getElementById(trust.getAttribute("aria-describedby") as string)
      ?.textContent,
  ).toBe(text.trustUnavailable);
  fireEvent.click(trust);
  expect(answer).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(answer).toHaveBeenCalledExactlyOnceWith("cancel", {
    ...view.execution?.question,
    instance: view.execution?.instance,
  });
});
it.each(["accepted", "rejected", "unknown", "finished"] as const)(
  "announces %s without calling it success early",
  (kind) => {
    mount({
      answer: vi.fn(),
      available: () => false,
      attempt: {
        cursor: 1n,
        target: {
          instance: "b".repeat(64),
          accountGeneration: "a".repeat(64),
          revision: "c".repeat(64),
          run: "1",
          decision: "2",
          action: "cancel",
        },
        phase:
          kind === "accepted"
            ? { kind, request: "d".repeat(32) }
            : kind === "rejected"
              ? { kind, reason: "stale-question" }
              : kind === "finished"
                ? { kind, outcome: { kind: "completed" } }
                : { kind },
      },
    });
    expect(screen.getByRole("status").textContent).toBe(
      kind === "rejected"
        ? `${text.answerState.rejected} ${text.rejection["stale-question"]}`
        : text.answerState[kind],
    );
    if (kind !== "finished")
      expect(screen.queryByText(text.answerState.finished)).toBeNull();
  },
);

it("keeps the live region mounted empty, then announces while the panel is closed", () => {
  const controller: ResidentAnswerController = {
    answer: vi.fn(),
    available: () => true,
    attempt: undefined,
  };
  const content = (value: ResidentView, answer: ResidentAnswerController) => (
    <CSPProvider disableStyleElements>
      <TooltipProvider>
        <ResidentInbox view={value} answer={answer} />
      </TooltipProvider>
    </CSPProvider>
  );
  const mounted = render(content(view, controller));
  const live = screen.getByRole("status");
  expect(live.querySelector("strong")?.textContent).toBe("");
  fireEvent.click(screen.getByRole("button", { name: text.close }));
  const accepted: ResidentAnswerController = {
    ...controller,
    attempt: {
      cursor: 1n,
      target: {
        decision: "2",
        run: "1",
        revision: "c".repeat(64),
        accountGeneration: "a".repeat(64),
        instance: "b".repeat(64),
        action: "cancel",
      },
      phase: { kind: "accepted", request: "d".repeat(32) },
    },
  };
  const acknowledged = structuredClone(view);
  acknowledged.decision = null;
  if (acknowledged.execution) acknowledged.execution.question = null;
  mounted.rerender(content(acknowledged, accepted));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button", { name: text.open })).toBeTruthy();
  expect(screen.getByRole("status")).toBe(live);
  expect(live.querySelector("strong")?.textContent).toBe(
    text.answerState.accepted,
  );
  const next = structuredClone(view);
  if (!next.execution?.question || !next.decision) throw new Error("fixture");
  next.execution.question.decision = "3";
  next.decision.id = "3";
  mounted.rerender(content(next, accepted));
  expect(screen.getByRole("status")).toBe(live);
  expect(live.querySelector("strong")?.textContent).toBe("");
  expect(screen.queryByText(text.answerState.accepted)).toBeNull();
});
it.each([
  [
    "busy",
    "Respuesta rechazada. No se ha aplicado. Hay otra orden pendiente. Espera antes de volver a responder.",
  ],
  [
    "unsupported",
    "Respuesta rechazada. No se ha aplicado. El residente actual no admite esta operación.",
  ],
] as const)("renders the literal %s explanation", (reason, expected) => {
  mount({
    answer: vi.fn(),
    available: () => false,
    attempt: {
      cursor: 1n,
      target: {
        instance: "b".repeat(64),
        accountGeneration: "a".repeat(64),
        revision: "c".repeat(64),
        run: "1",
        decision: "2",
        action: "cancel",
      },
      phase: { kind: "rejected", reason },
    },
  });
  expect(screen.getByRole("status").textContent).toBe(expected);
});
