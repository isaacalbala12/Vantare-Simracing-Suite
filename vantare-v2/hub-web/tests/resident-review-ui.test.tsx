// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ResidentView } from "../src/contract/generated/contract";
import { residentReviewText as t } from "../src/renderer/i18n/launcher-review";
import type { ResidentReviewPanel } from "../src/renderer/screens/launcher/resident-review";
import { TooltipProvider } from "../src/renderer/ui/Layers";
import { ResidentInbox } from "../src/renderer/ui/launcher/ResidentInbox";

const scope = {
  decision: "1",
  instance: "a".repeat(64),
  run: "2",
  revision: "b".repeat(64),
  accountGeneration: "c".repeat(64),
};
const question = {
  id: scope.decision,
  kind: "authorization",
  review: "available",
  actions: [
    { id: "trust", label: "Confiar y lanzar" },
    { id: "cancel", label: "Cancelar" },
  ],
} satisfies NonNullable<ResidentView["decision"]>;
const open = vi.fn();
const cancel = vi.fn();
const query = new QueryClient();
const answer = { attempt: undefined, available: () => true, answer: cancel };
function view(review: ResidentReviewPanel) {
  return (
    <QueryClientProvider client={query}>
      <TooltipProvider>
        <ResidentInbox answer={answer} review={review} />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
const make = (state: ResidentReviewPanel["state"]): ResidentReviewPanel => ({
  state,
  question,
  scope,
  profile: {
    name: "Creador de Contenido",
    apps: ["Le Mans Ultimate", "OBS Studio", "Spotify"],
  },
  open,
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it.each([
  "question",
  "reviewing",
  "trusted",
  "declined",
  "changed",
  "expired",
  "unavailable",
  "too-long",
] as const)(
  "shows the approved review state %s with a single announcement",
  (state) => {
    render(view(make(state)));
    const drawer = screen.getByRole("dialog", {
      name: "Decisión de lanzamiento",
    });
    expect(drawer.getAttribute("aria-modal")).not.toBe("true");
    const panel = within(drawer);
    expect(
      panel.getByText("3 pasos · Le Mans Ultimate, OBS Studio, Spotify"),
    ).toBeTruthy();
    expect(panel.getByText(t.description)).toBeTruthy();
    expect(panel.queryByRole("status")).toBeNull();
    const status = screen.getAllByRole("status");
    expect(status).toHaveLength(1);
    expect(status[0].textContent).toBe(t.live[state]);
    expect(
      panel.queryByRole("button", { name: "Confiar y lanzar" }),
    ).toBeNull();
    const notice = state !== "question" && t.states[state];
    if (notice) {
      expect(panel.getByText(notice.title)).toBeTruthy();
      expect(panel.getByText(notice.text)).toBeTruthy();
    }
    const ended = state === "trusted" || state === "declined";
    expect(!!panel.queryByText(t.help)).toBe(!ended);
    expect(!!panel.queryByRole("button", { name: "Cancelar" })).toBe(!ended);
    const button = panel.queryByRole("button", {
      name:
        state === "expired" || state === "changed" ? t.reviewAgain : t.review,
    });
    expect(!!button).toBe(!ended && state !== "too-long");
    if (state === "reviewing") {
      expect(button?.getAttribute("aria-busy")).toBe("true");
      expect(button?.getAttribute("aria-disabled")).toBe("true");
      expect(
        panel
          .getByRole("button", { name: "Cancelar" })
          .getAttribute("aria-disabled"),
      ).toBe("true");
    }
    if (state === "unavailable") {
      expect(button?.getAttribute("aria-disabled")).toBe("true");
      expect(
        document.getElementById(button?.getAttribute("aria-describedby") ?? "")
          ?.textContent,
      ).toBe(t.unavailableReason);
    }
    if (
      button &&
      (state === "question" || state === "changed" || state === "expired")
    ) {
      expect(button.getAttribute("aria-haspopup")).toBe("dialog");
      fireEvent.click(button);
      expect(open).toHaveBeenCalledOnce();
    }
  },
);

it("restores focus to the retry button or drawer following native review", () => {
  const mounted = render(view(make("question")));
  const drawer = screen.getByRole("dialog");
  screen.getByRole("button", { name: t.review }).focus();
  mounted.rerender(view(make("reviewing")));
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: t.review }),
  );
  mounted.rerender(view(make("expired")));
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: t.reviewAgain }),
  );
  mounted.rerender(view(make("reviewing")));
  mounted.rerender(view(make("trusted")));
  expect(document.activeElement).toBe(drawer);
});
