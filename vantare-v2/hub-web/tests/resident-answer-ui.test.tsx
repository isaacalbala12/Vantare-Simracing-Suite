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
  execution: null,
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
  fireEvent.click(
    screen.getByRole("button", { name: "Cancelar", exact: true }),
  );
  expect(answer).toHaveBeenCalledExactlyOnceWith("cancel");
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
    expect(screen.getByRole("status").textContent).toBe(text.answerState[kind]);
    if (kind !== "finished")
      expect(screen.queryByText(text.answerState.finished)).toBeNull();
  },
);
