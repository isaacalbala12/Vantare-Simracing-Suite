import { afterEach, describe, expect, it, vi } from "vitest";
import coreFixture from "../fixtures/core-offline.json";
import type {
  CoreStatus,
  HostToUi,
  ResidentView,
  UiToHost,
} from "../src/contract/generated/contract";
import { postHostMessageToRenderer } from "../src/contract/validation";
import { launcherReview } from "../src/main/launcher-review";
import { isRendererMessage } from "../src/main/security";

const ticket = "a".repeat(32);
const target = {
  instance: "b".repeat(64),
  accountGeneration: "c".repeat(64),
  run: "1",
  revision: "d".repeat(64),
  decision: "2",
};
const title = "Revisa el paso de este perfil importado";
const detail =
  "Perfil: «Un perfil»\n  Programa: C:\\QA\\prueba.exe\n  Argumentos: ejemplo";
const empty = "Este perfil importado no tiene pasos";

function fixture() {
  let now = 100;
  let signalFence = () => {};
  const fenced = new Promise<void>((resolve) => {
    signalFence = resolve;
  });
  const send = vi.fn((message: UiToHost) => {
    if (message.kind === "request") signalFence();
  });
  type Dialog = Parameters<typeof launcherReview>[0];
  const show = vi.fn<Dialog>();
  const review = launcherReview(show, send, () => now);
  const view = {
    online: true,
    running: true,
    execution: {
      instance: target.instance,
      question: {
        decision: target.decision,
        run: target.run,
        revision: target.revision,
        accountGeneration: target.accountGeneration,
      },
    },
    decision: { id: target.decision },
    reviewOutcome: null,
  };
  review.expect(4, target);
  review.receive({
    kind: "response",
    id: 4,
    result: { method: "launcher.resident.reviewOpen", value: { ticket } },
  });
  return {
    review,
    show,
    send,
    fenced,
    changed: () =>
      review.receive({
        kind: "event",
        event: {
          topic: "launcherResident",
          value: {
            ...view,
            execution: {
              ...view.execution,
              question: { ...view.execution.question, decision: "3" },
            },
            decision: { id: "3" },
          } as ResidentView,
        },
      }),
    clickAt: (time: number) => {
      now = time;
    },
    pages: (...pages: string[]) =>
      review.receive({ kind: "reviewContent", pages }),
    flushed: () => {
      const last = send.mock.lastCall?.[0];
      if (last?.kind !== "request") throw new Error("Missing receipt fence");
      expect(last.request).toEqual({ method: "launcher.resident.get" });
      review.receive({
        kind: "response",
        id: last.id,
        result: {
          method: "launcher.resident.get",
          value: view,
        },
      } as HostToUi);
    },
    outcome: () =>
      send.mock.calls
        .map(([value]) => value)
        .filter((value) => value.kind === "reviewDecision"),
  };
}

afterEach(() => vi.useRealTimers());

describe("trusted native review", () => {
  it.each([1, 2, 3])(
    "visits %i page(s) and stamps only final confirmation",
    async (count) => {
      const { review, show, send, clickAt, pages, fenced, flushed, outcome } =
        fixture();
      const visits =
        count === 1 ? [0] : count === 2 ? [0, 1, 0, 1] : [0, 1, 2, 1, 2];
      visits.forEach((part, index) => {
        show.mockImplementationOnce(async (options) => {
          expect(options.message).toBe(
            count === 1
              ? title
              : `Revisa los 3 pasos de este perfil importado (parte ${part + 1} de ${count})`,
          );
          expect(options.detail).toBe(`${detail} ${part + 1}`);
          const buttons = [
            ...(part > 0 ? ["Atrás"] : []),
            part === count - 1 ? "Confiar y lanzar" : "Siguiente",
            "Cancelar",
          ];
          expect(options).toMatchObject({
            type: "warning",
            title: "Vantare · Revisar perfil importado",
            buttons,
            defaultId: buttons.length - 1,
            cancelId: buttons.length - 1,
            noLink: true,
            normalizeAccessKeys: false,
          });
          expect(outcome()).toEqual([]);
          if (index === visits.length - 1) {
            clickAt(9876);
            return buttons.indexOf("Confiar y lanzar");
          }
          return buttons.indexOf(
            visits[index + 1] < part ? "Atrás" : "Siguiente",
          );
        });
      });
      const result = review.open(ticket);
      expect(send).toHaveBeenCalledWith({
        kind: "reviewContentRequest",
        ticket,
      });
      expect(await review.open(ticket)).toBe("unavailable");
      pages(
        ...Array.from(
          { length: count },
          (_, index) =>
            `${count === 1 ? title : `Revisa los 3 pasos de este perfil importado (parte ${index + 1} de ${count})`}\n${detail} ${index + 1}`,
        ),
      );
      await fenced;
      expect(outcome()).toEqual([
        { kind: "reviewDecision", ticket, decision: "trust", issuedMs: 9876 },
      ]);
      flushed();
      expect(await result).toBe("submitted");
      expect(await review.open(ticket)).toBe("unavailable");
      expect(show).toHaveBeenCalledTimes(visits.length);
    },
  );

  it.each(["Cancelar", "Escape", "✕", "Intro"])(
    "maps %s to Cancelar without a timestamp",
    async () => {
      const { review, show, pages, fenced, flushed, outcome } = fixture();
      show.mockImplementationOnce(async (options) => options.cancelId);
      const result = review.open(ticket);
      pages(`${title}\n${detail}`);
      await fenced;
      expect(outcome()).toEqual([
        { kind: "reviewDecision", ticket, decision: "cancel" },
      ]);
      flushed();
      expect(await result).toBe("submitted");
    },
  );

  it("never offers trust on a profile with no steps", async () => {
    const { review, show, pages, fenced, flushed, outcome } = fixture();
    show.mockImplementationOnce(async (options) => {
      expect(options.buttons).toEqual(["Cancelar"]);
      return options.cancelId;
    });
    const result = review.open(ticket);
    pages(`${empty}\n${detail}`);
    await fenced;
    expect(outcome()).toEqual([
      { kind: "reviewDecision", ticket, decision: "cancel" },
    ]);
    flushed();
    expect(await result).toBe("submitted");
  });

  it.each(["changed", "expired"] as const)(
    "sends nothing on signal close (%s)",
    async (reason) => {
      vi.useFakeTimers();
      const { review, show, pages, send, changed } = fixture();
      show.mockImplementationOnce(
        (options) =>
          new Promise((resolve) => {
            options.signal.addEventListener("abort", () =>
              resolve(options.cancelId),
            );
          }),
      );
      const result = review.open(ticket);
      pages(`${title}\n${detail}`);
      expect(show).toHaveBeenCalledOnce();
      if (reason === "changed") changed();
      else await vi.advanceTimersByTimeAsync(180_000);
      expect(show.mock.calls[0][0].signal.aborted).toBe(true);
      expect(await result).toBe(reason);
      expect(send.mock.calls).toEqual([
        [{ kind: "reviewContentRequest", ticket }],
      ]);
    },
  );

  it("fails closed for unissued tickets, unavailable and malformed content", async () => {
    const { review, show, pages, send } = fixture();
    expect(await review.open("f".repeat(32))).toBe("unavailable");
    const result = review.open(ticket);
    pages("unstructured");
    expect(await result).toBe("unavailable");
    expect(show).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does not deliver a late private reply to a new question", async () => {
    const { review, show, pages, changed } = fixture();
    const result = review.open(ticket);
    changed();
    expect(await result).toBe("changed");
    expect(review.expect(5, { ...target, decision: "3" })).toBe(false);
    pages(`${title}\n${detail}`);
    expect(show).not.toHaveBeenCalled();
    expect(review.expect(5, { ...target, decision: "3" })).toBe(true);
  });

  it("aborts on account replacement or shutdown without answering", async () => {
    const signals: HostToUi[] = [
      { kind: "closeRequested", reason: "window" },
      {
        kind: "event",
        event: {
          topic: "core",
          value: {
            ...(coreFixture as CoreStatus),
            services: "connected",
            accountGeneration: "f".repeat(64),
          },
        },
      },
    ];
    for (const signal of signals) {
      const { review, show, pages, outcome } = fixture();
      show.mockImplementationOnce(
        (options) =>
          new Promise((done) =>
            options.signal.addEventListener("abort", () =>
              done(options.cancelId),
            ),
          ),
      );
      const result = review.open(ticket);
      pages(`${title}\n${detail}`);
      review.receive(signal);
      expect(await result).toBe("changed");
      expect(outcome()).toEqual([]);
    }
  });

  it("returns the host failure after confirmation even if the decision was sent", async () => {
    const { review, show, pages, fenced, flushed, outcome } = fixture();
    show.mockResolvedValueOnce(0);
    const result = review.open(ticket);
    pages(`${title}\n${detail}`);
    await fenced;
    expect(outcome()).toHaveLength(1);
    review.receive({ kind: "reviewFailure", reason: "changed" });
    flushed();
    expect(await result).toBe("changed");
  });

  it("returns a closed unavailable status if the host has no review", async () => {
    const { review, show, outcome } = fixture();
    const result = review.open(ticket);
    review.receive({ kind: "reviewFailure", reason: "unavailable" });
    expect(await result).toBe("unavailable");
    expect(show).not.toHaveBeenCalled();
    expect(outcome()).toEqual([]);
  });

  it("does not expose an error from the native dialog", async () => {
    const { review, show, pages, outcome } = fixture();
    show.mockRejectedValueOnce(new Error(detail));
    const result = review.open(ticket);
    pages(`${title}\n${detail}`);
    expect(await result).toBe("unavailable");
    expect(outcome()).toEqual([]);
  });

  it("keeps text and private requests off the renderer port", () => {
    const { review } = fixture();
    const post = vi.fn();
    const privateMessages = [
      { kind: "reviewContent", pages: [`${title}\n${detail}`] },
      { kind: "reviewFailure", reason: "unavailable" },
    ] as const;
    for (const message of privateMessages) {
      const parsed = JSON.parse(JSON.stringify(message));
      expect(review.receive(parsed)).toBe(true);
      postHostMessageToRenderer(parsed, post);
    }
    expect(post).not.toHaveBeenCalled();
    for (const message of [
      { kind: "reviewContentRequest", ticket },
      { kind: "reviewDecision", ticket, decision: "trust", issuedMs: 1 },
    ]) {
      expect(isRendererMessage(message)).toBe(false);
      expect(
        isRendererMessage({
          kind: "request",
          id: 1,
          request: { method: message.kind, ticket },
        }),
      ).toBe(false);
    }
  });
});
