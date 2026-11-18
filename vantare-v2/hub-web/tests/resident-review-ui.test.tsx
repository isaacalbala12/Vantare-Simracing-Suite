// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { ResidentView } from "../src/contract/generated/contract";
import * as host from "../src/renderer/app/Host";
import { type Client, HostFailure } from "../src/renderer/bridge/client";
import { residentReviewText as t } from "../src/renderer/i18n/launcher-review";
import {
  type ResidentReviewPanel,
  useResidentReview,
} from "../src/renderer/screens/launcher/resident-review";
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
  vi.restoreAllMocks();
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

it("drops a native completion arriving after another question replaces it", async () => {
  const { hook, value, reviewTrust } = reviewHook();
  let expire = () => {};
  const native = new Promise<"expired">((resolve) => {
    expire = () => resolve("expired");
  });
  reviewTrust.mockReturnValueOnce(native);
  let finished: Promise<void> | undefined;
  await act(async () => {
    finished = hook.result.current?.open?.();
  });
  expect(hook.result.current?.state).toBe("reviewing");
  expect(reviewTrust).toHaveBeenCalledOnce();
  const current = structuredClone(value);
  current.decision = { ...question, id: "3" };
  if (current.execution)
    current.execution.question = { ...scope, decision: "3" };
  hook.rerender({ current });
  expect(hook.result.current?.state).toBe("question");
  await act(async () => {
    expire();
    await finished;
  });
  expect(hook.result.current).toMatchObject({
    state: "question",
    scope: { decision: "3" },
  });
});

it("returns to Ver decisión when the drawer is dismissed during the review", async () => {
  const mounted = render(view(make("reviewing")));
  fireEvent.click(screen.getByRole("button", { name: /^Cerrar$/ }));
  const reveal = await screen.findByRole("button", {
    name: "Ver decisión",
  });
  mounted.rerender(view(make("declined")));
  expect(document.activeElement).toBe(reveal);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(cancel).not.toHaveBeenCalled();
});

it.each(["unavailable", "changed", "expired"] as const)(
  "leaves initial focus to the drawer when the first question is %s",
  (state) => {
    const focused = vi.spyOn(HTMLElement.prototype, "focus");
    render(view(make(state)));
    const reviewButton = screen.getByRole("button", {
      name: state === "unavailable" ? t.review : t.reviewAgain,
    });
    expect(focused.mock.contexts).not.toContain(reviewButton);
  },
);

it("does not force retry focus when another question replaces the open drawer", () => {
  const tested = render(view(make("question")));
  const focused = vi.spyOn(HTMLElement.prototype, "focus");
  tested.rerender(
    view({
      ...make("changed"),
      question: { ...question, id: "3" },
      scope: { ...scope, decision: "3" },
    }),
  );
  expect(focused.mock.contexts).not.toContain(
    screen.getByRole("button", { name: t.reviewAgain }),
  );
});

function reviewHook(
  initialQuestion: NonNullable<ResidentView["decision"]> = question,
) {
  const request = vi.fn(async () => ({
    method: "launcher.resident.reviewOpen",
    value: { ticket: "e".repeat(32) },
  }));
  const reviewTrust = vi
    .fn<() => Promise<string>>()
    .mockResolvedValue("submitted");
  vi.spyOn(host, "useHost").mockReturnValue({
    client: { request, reviewTrust } as unknown as Client,
  });
  const cache = new QueryClient();
  const core = {
    ...host.offline,
    services: "connected" as const,
    accountGeneration: scope.accountGeneration,
    access: { ...host.offline.access, verified: true, blocked: false },
  };
  cache.setQueryData(host.coreKey, core);
  const value: ResidentView = {
    decision: initialQuestion,
    execution: {
      instance: scope.instance,
      question: { ...scope, decision: initialQuestion.id },
      results: { kind: "unknown" },
      active: {
        run: scope.run,
        revision: scope.revision,
        accountGeneration: scope.accountGeneration,
      },
      checkedAnswer: true,
      checkedControl: false,
      revisionCheckedLaunch: true,
      firstRetainedSeq: "1",
      events: [],
    },
    ownership: { kind: "unsupported" },
    protected: false,
    online: true,
    running: true,
    error: false,
    reviewOutcome: null,
    registrations: [],
  };
  const hook = renderHook(({ current }) => useResidentReview(current, answer), {
    initialProps: { current: value },
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={cache}>{children}</QueryClientProvider>
    ),
  });
  return { hook, value, request, reviewTrust };
}

it.each(["changed", "expired", "unavailable"] as const)(
  "honors %s from the host after submitting and losing the question",
  async (state) => {
    const { hook, value, reviewTrust } = reviewHook();
    await act(async () => {
      await hook.result.current?.open?.();
    });
    expect(reviewTrust).toHaveBeenCalledOnce();
    const current = structuredClone(value);
    current.decision = null;
    if (current.execution) current.execution.question = null;
    current.reviewOutcome = { question: scope.decision, state };
    hook.rerender({ current });
    expect(hook.result.current?.state).toBe(state);
    expect(hook.result.current?.open).toBeUndefined();
  },
);

it.each([
  [
    new HostFailure({
      kind: "residentAnswerRejected",
      reason: "stale-question",
    }),
    "changed",
  ],
  [new HostFailure({ kind: "denied" }), "unavailable"],
] as const)("classifies reviewOpen failure %s as %s", async (error, state) => {
  const { hook, request, reviewTrust } = reviewHook();
  request.mockRejectedValueOnce(error);
  await act(async () => {
    await hook.result.current?.open?.();
  });
  expect(hook.result.current?.state).toBe(state);
  expect(reviewTrust).not.toHaveBeenCalled();
});

it("never requests reviewOpen when the resident says review is unavailable", async () => {
  const { hook, request, reviewTrust } = reviewHook({
    ...question,
    review: "unavailable",
  });
  expect(hook.result.current?.state).toBe("unavailable");
  await act(async () => {
    await hook.result.current?.open?.();
  });
  expect(request).not.toHaveBeenCalled();
  expect(reviewTrust).not.toHaveBeenCalled();
});

it("keeps the result unconfirmed when the connection drops after submission", async () => {
  const { hook, value } = reviewHook();
  await act(async () => {
    await hook.result.current?.open?.();
  });
  hook.rerender({ current: { ...value, online: false } });
  expect(hook.result.current?.state).toBe("unconfirmed");
});

it("shows uncertainty after an interrupted submission without implying nothing opened", async () => {
  const { hook, reviewTrust } = reviewHook();
  reviewTrust.mockResolvedValueOnce("unconfirmed");
  await act(async () => {
    await hook.result.current?.open?.();
  });
  expect(hook.result.current?.state).toBe("unconfirmed");
  if (!hook.result.current) throw new Error("Missing review panel");
  render(view(hook.result.current));
  const drawer = within(screen.getByRole("dialog"));
  expect(drawer.getByText("Confirmación pendiente")).toBeTruthy();
  expect(drawer.queryByText(t.help)).toBeNull();
  expect(drawer.queryByRole("button", { name: t.review })).toBeNull();
  expect(drawer.queryByRole("button", { name: t.cancel })).toBeNull();
});
