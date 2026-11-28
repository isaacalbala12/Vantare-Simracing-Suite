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
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ResidentView,
  ResidentReviewState as ReviewResult,
} from "../src/contract/generated/contract";
import * as host from "../src/renderer/app/Host";
import { type Client, HostFailure } from "../src/renderer/bridge/client";
import { residentReviewText as t } from "../src/renderer/i18n/launcher-review";
import type { ResidentAnswerController } from "../src/renderer/screens/launcher/resident-answer";
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

// Textos aprobados (issue 2881): escritos aquí a propósito, no leídos de i18n.
const blockedPhrases = [
  [
    "blocked-lookalike",
    "Vantare no abrirá este perfil: la ruta de uno de sus programas usa letras o signos que imitan a los normales para parecer otro programa.",
  ],
  [
    "blocked-unusual-path",
    "Vantare no abrirá este perfil: la ruta de uno de sus programas no tiene la forma de un programa normal de Windows.",
  ],
] as const;

it.each(blockedPhrases)(
  "explains the %s review without offering review or trust",
  (state, phrase) => {
    render(view(make(state)));
    const drawer = screen.getByRole("dialog", {
      name: "Decisión de lanzamiento",
    });
    const panel = within(drawer);
    // Todo lo que se lee en el panel, y nada más.
    expect(drawer.textContent).toBe(
      [
        "Decisión de lanzamiento",
        "×",
        "Importado · origen no verificado",
        "Creador de Contenido",
        "3 pasos · Le Mans Ultimate, OBS Studio, Spotify",
        "Bloqueado por seguridad",
        phrase,
        "Cancelar",
        "Todavía no se ha abierto ninguna aplicación. Cerrar este panel no responde ni cancela la secuencia.",
      ].join(""),
    );
    // El título y la frase son la descripción del panel.
    const described = (drawer.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent)
      .join(" ");
    expect(described).toBe(`Bloqueado por seguridad${phrase}`);
    expect(panel.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    const status = screen.getAllByRole("status");
    expect(status).toHaveLength(1);
    expect(status[0].textContent).toBe(
      "Perfil bloqueado por seguridad. No se ha abierto ninguna aplicación.",
    );
    expect(
      panel.getAllByRole("button").map((button) => button.textContent),
    ).toEqual(["×", "Cancelar"]);
    fireEvent.click(panel.getByRole("button", { name: "Cancelar" }));
    expect(cancel).toHaveBeenCalledExactlyOnceWith("cancel", scope);
    expect(open).not.toHaveBeenCalled();
  },
);

it("keeps the unavailable screen exactly as it was", () => {
  render(view({ ...make("unavailable"), open: undefined }));
  const drawer = screen.getByRole("dialog");
  expect(drawer.textContent).toBe(
    [
      "Decisión de lanzamiento",
      "×",
      "Este perfil viene de fuera de Vantare. Antes de abrir nada, revisa qué hará.",
      "Importado · origen no verificado",
      "Creador de Contenido",
      "3 pasos · Le Mans Ultimate, OBS Studio, Spotify",
      "Los nombres de los pasos los escribió quien creó el perfil y pueden no coincidir con lo que se abre. La revisión te enseña, en una ventana de Windows, el programa y los argumentos reales de cada paso.",
      "La revisión no está disponible",
      "Este Hub no puede abrir la revisión ahora mismo. No se ha confiado en nada.",
      "Revisar el perfil…",
      "No se puede revisar con el residente y el Hub actuales. Puedes cancelar el lanzamiento.",
      "Cancelar",
      "Todavía no se ha abierto ninguna aplicación. Cerrar este panel no responde ni cancela la secuencia.",
    ].join(""),
  );
  expect(
    within(drawer)
      .getByRole("button", { name: "Revisar el perfil…" })
      .getAttribute("aria-disabled"),
  ).toBe("true");
  expect(screen.getByRole("status").textContent).toBe(
    "La revisión no está disponible. No se ha confiado en nada.",
  );
});

it.each(blockedPhrases)(
  "does not move focus when a dismissed drawer turns %s",
  async (state) => {
    const mounted = render(view(make("question")));
    fireEvent.click(screen.getByRole("button", { name: /^Cerrar$/ }));
    const reveal = await screen.findByRole("button", { name: "Ver decisión" });
    reveal.blur();
    mounted.rerender(view(make(state)));
    expect(document.activeElement).not.toBe(reveal);
  },
);

it.each(blockedPhrases)(
  "never requests reviewOpen when the resident question is %s",
  async (review) => {
    const { hook, request, reviewTrust } = reviewHook({ ...question, review });
    expect(hook.result.current).toMatchObject({
      state: review,
      cancelOffered: true,
    });
    expect(hook.result.current?.open).toBeUndefined();
    await act(async () => {
      await hook.result.current?.open?.();
    });
    expect(request).not.toHaveBeenCalled();
    expect(reviewTrust).not.toHaveBeenCalled();
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

// Issue 2903: el bloqueo gana a cualquier resultado anterior de la pregunta.
describe.each(blockedPhrases)("a question that turns %s", (review, phrase) => {
  const turned = (
    value: ResidentView,
    outcome: ResidentView["reviewOutcome"] = null,
  ): ResidentView => ({
    ...structuredClone(value),
    decision: { ...question, review },
    reviewOutcome: outcome,
  });
  const host = (state: ReviewResult) => ({ question: scope.decision, state });
  const expectBlocked = (panel: ResidentReviewPanel | undefined) => {
    if (!panel) throw new Error("Missing review panel");
    expect(panel.state).toBe(review);
    expect(panel.open).toBeUndefined();
    const mounted = render(view(panel));
    const drawer = within(screen.getByRole("dialog"));
    expect(drawer.getByText("Bloqueado por seguridad")).toBeTruthy();
    expect(drawer.getByText(phrase)).toBeTruthy();
    expect(
      drawer.getAllByRole("button").map((button) => button.textContent),
    ).toEqual(["×", "Cancelar"]);
    expect(screen.getByRole("status").textContent).toBe(
      "Perfil bloqueado por seguridad. No se ha abierto ninguna aplicación.",
    );
    mounted.unmount();
  };

  it.each(["changed", "expired", "unavailable"] as const)(
    "wins over the host's earlier %s result, live and after it leaves",
    (state) => {
      const { hook, value } = reviewHook();
      hook.rerender({ current: { ...value, reviewOutcome: host(state) } });
      expect(hook.result.current?.state).toBe(state);
      const blocked = turned(value, host(state));
      hook.rerender({ current: blocked });
      expectBlocked(hook.result.current);
      const gone = structuredClone(blocked);
      gone.decision = null;
      if (gone.execution) gone.execution.question = null;
      hook.rerender({ current: gone });
      expectBlocked(hook.result.current);
    },
  );

  it.each(["changed", "expired", "unavailable"] as const)(
    "wins over Main's earlier %s reply",
    async (state) => {
      const { hook, value, reviewTrust } = reviewHook();
      reviewTrust.mockResolvedValueOnce(state);
      await act(async () => {
        await hook.result.current?.open?.();
      });
      expect(hook.result.current?.state).toBe(state);
      hook.rerender({ current: turned(value) });
      expectBlocked(hook.result.current);
    },
  );

  it("wins over a rejected reviewOpen", async () => {
    const { hook, value, request } = reviewHook();
    request.mockRejectedValueOnce(
      new HostFailure({
        kind: "residentAnswerRejected",
        reason: "stale-question",
      }),
    );
    await act(async () => {
      await hook.result.current?.open?.();
    });
    expect(hook.result.current?.state).toBe("changed");
    hook.rerender({ current: turned(value) });
    expectBlocked(hook.result.current);
  });

  it.each(["too-long", "unavailable"] as const)(
    "wins over the earlier %s question",
    (earlier) => {
      const { hook, value } = reviewHook({ ...question, review: earlier });
      expect(hook.result.current?.state).toBe(earlier);
      hook.rerender({ current: turned(value) });
      expectBlocked(hook.result.current);
    },
  );

  it("wins while the native dialog is open and after it answers", async () => {
    const { hook, value, reviewTrust } = reviewHook();
    let settle = (_result: string) => {};
    reviewTrust.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          settle = resolve;
        }),
    );
    let finished: Promise<void> | undefined;
    await act(async () => {
      finished = hook.result.current?.open?.();
    });
    hook.rerender({ current: turned(value, host("changed")) });
    expectBlocked(hook.result.current);
    await act(async () => {
      settle("changed");
      await finished;
    });
    expectBlocked(hook.result.current);
  });

  it("waits for the host before replacing a decision already sent", async () => {
    const { hook, value } = reviewHook();
    await act(async () => {
      await hook.result.current?.open?.();
    });
    hook.rerender({ current: turned(value) });
    expect(hook.result.current?.state).toBe("unconfirmed");
    hook.rerender({ current: turned(value, host("unavailable")) });
    expectBlocked(hook.result.current);
  });

  it.each(["trusted", "declined"] as const)(
    "never rewrites a %s result",
    (state) => {
      const { hook, value } = reviewHook();
      hook.rerender({ current: turned(value, host(state)) });
      expect(hook.result.current?.state).toBe(state);
    },
  );

  it("keeps an accepted cancellation", () => {
    const { hook, value } = reviewHook(question, {
      ...answer,
      attempt: {
        target: { ...scope, action: "cancel" },
        cursor: 1n,
        phase: { kind: "accepted", request: "d".repeat(32) },
      },
    });
    hook.rerender({ current: turned(value, host("changed")) });
    expect(hook.result.current?.state).toBe("declined");
  });
});

function reviewHook(
  initialQuestion: NonNullable<ResidentView["decision"]> = question,
  controller: ResidentAnswerController = answer,
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
  const hook = renderHook(
    ({ current }) => useResidentReview(current, controller),
    {
      initialProps: { current: value },
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={cache}>{children}</QueryClientProvider>
      ),
    },
  );
  return { hook, value, request, reviewTrust };
}

describe.each([true, false])("native dialog with live question %s", (live) => {
  it.each(["changed", "expired", "unavailable"] as const)(
    "honors %s from the host while reviewTrust is still pending",
    async (state) => {
      const { hook, value, reviewTrust } = reviewHook();
      let settle = (_result: string) => {};
      reviewTrust.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            settle = resolve;
          }),
      );
      let finished: Promise<void> | undefined;
      await act(async () => {
        finished = hook.result.current?.open?.();
      });
      expect(reviewTrust).toHaveBeenCalledOnce();
      expect(hook.result.current?.state).toBe("reviewing");
      const current = structuredClone(value);
      if (!live) {
        current.decision = null;
        if (current.execution) current.execution.question = null;
      }
      current.reviewOutcome = { question: scope.decision, state };
      hook.rerender({ current });
      expect(hook.result.current?.state).toBe(state);
      expect(!!hook.result.current?.open).toBe(live && state !== "unavailable");
      await act(async () => {
        settle("unconfirmed");
        await finished;
      });
      expect(hook.result.current?.state).toBe(state);
    },
  );
});

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

it.each(["interrupted", "unconfirmed"] as const)(
  "uses Main's %s reply after a disconnect while the native call is pending",
  async (result) => {
    const { hook, value, reviewTrust } = reviewHook();
    let settle = (_result: string) => {};
    reviewTrust.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          settle = resolve;
        }),
    );
    let finished: Promise<void> | undefined;
    await act(async () => {
      finished = hook.result.current?.open?.();
    });
    hook.rerender({ current: { ...value, online: false } });
    expect(hook.result.current?.state).not.toBe("unconfirmed");
    await act(async () => {
      settle(result);
      await finished;
    });
    hook.rerender({ current: value });
    expect(hook.result.current?.state).toBe(
      result === "interrupted" ? "question" : result,
    );
    if (result === "interrupted") {
      if (!hook.result.current) throw new Error("Missing review panel");
      render(view(hook.result.current));
      const drawer = within(screen.getByRole("dialog"));
      expect(
        drawer
          .getByRole("button", { name: t.review })
          .getAttribute("aria-disabled"),
      ).toBe("false");
      expect(
        drawer
          .getByRole("button", { name: t.cancel })
          .getAttribute("aria-disabled"),
      ).toBe("false");
    }
  },
);

it("announces the sent decision and removes Cancel when the host withdraws it", async () => {
  const { hook, value, reviewTrust } = reviewHook();
  reviewTrust.mockResolvedValueOnce("unconfirmed");
  await act(async () => {
    await hook.result.current?.open?.();
  });
  expect(hook.result.current?.state).toBe("unconfirmed");
  if (!hook.result.current) throw new Error("Missing review panel");
  const panel = render(view(hook.result.current));
  const drawer = within(screen.getByRole("dialog"));
  expect(drawer.getByText("Esperando confirmación")).toBeTruthy();
  expect(
    drawer.getByText(
      "Tu decisión se ha enviado. Vantare está esperando la respuesta; el resultado aparecerá en el lanzamiento.",
    ),
  ).toBeTruthy();
  expect(screen.getAllByRole("status").map((node) => node.textContent)).toEqual(
    ["Decisión enviada. Esperando confirmación."],
  );
  expect(drawer.queryByText(t.help)).toBeNull();
  expect(drawer.queryByRole("button", { name: t.review })).toBeNull();
  fireEvent.click(drawer.getByRole("button", { name: t.cancel }));
  expect(cancel).toHaveBeenCalledExactlyOnceWith("cancel", scope);

  const current = structuredClone(value);
  if (current.decision)
    current.decision.actions = current.decision.actions.filter(
      ({ id }) => id !== "cancel",
    );
  hook.rerender({ current });
  if (!hook.result.current) throw new Error("Missing review panel");
  panel.rerender(view(hook.result.current));
  expect(hook.result.current.state).toBe("unconfirmed");
  expect(drawer.queryByRole("button", { name: t.cancel })).toBeNull();

  hook.rerender({ current: value });
  hook.rerender({ current: { ...value, decision: null } });
  if (!hook.result.current) throw new Error("Missing retained review panel");
  panel.rerender(view(hook.result.current));
  expect(hook.result.current.state).toBe("unconfirmed");
  expect(drawer.queryByRole("button", { name: t.cancel })).toBeNull();
});

it("deduplicates a double click on Revisar el perfil", async () => {
  const { hook, request } = reviewHook();
  if (!hook.result.current) throw new Error("Missing review panel");
  render(view(hook.result.current));
  const review = screen.getByRole("button", { name: t.review });
  await act(async () => {
    fireEvent.click(review);
    fireEvent.click(review);
  });
  expect(request).toHaveBeenCalledTimes(1);
});
