import { describe, expect, it } from "vitest";
import type { ResidentView } from "../src/contract/generated/contract";
import corpus from "../src/contract/generated/corpus.json";
import { residentActionLabels } from "../src/contract/generated/launcher_resident";
import {
  isResident,
  isResidentReview,
} from "../src/contract/modules/launcher_resident";
import { isHostMessage, isUiMessage } from "../src/contract/validation";
import { createMockHost } from "../src/mock/host";

const view: ResidentView = {
  execution: null,
  protected: false,
  online: true,
  running: true,
  error: false,
  decision: {
    id: "18446744073709551615",
    kind: "authorization",
    review: "unavailable",
    actions: [
      { id: "trust", label: residentActionLabels.trust },
      { id: "cancel", label: residentActionLabels.cancel },
    ],
  },
  ownership: { kind: "unsupported" },
  registrations: [],
  reviewOutcome: null,
};
describe("read-only resident mailbox", () => {
  it("admits only get and subscription, with no arguments, paths or answers", () => {
    const wire = (request: unknown) => ({ kind: "request", id: 1, request });
    expect(isUiMessage(wire({ method: "launcher.resident.get" }))).toBe(true);
    expect(isUiMessage({ kind: "subscribe", topic: "launcherResident" })).toBe(
      true,
    );
    for (const request of [
      { method: "launcher.resident.get", path: "C:\\Users\\x" },
      { method: "launcher.resident.get", action: "trust" },
      { method: "launcher.answer", decision: "1", action: "trust" },
      { method: "launcher.resident.answer", decision: "1", action: "trust" },
    ])
      expect(isUiMessage(wire(request))).toBe(false);
  });
  it("preserves all u64 ids and rejects malformed decisions and private extra fields", () => {
    expect(isResident(view)).toBe(true);
    for (const id of [
      "01",
      "-1",
      "18446744073709551616",
      "1e3",
      "1\n",
      "1\r\n",
      "1 ",
      1,
    ])
      expect(isResident({ ...view, decision: { ...view.decision, id } })).toBe(
        false,
      );
    for (const decision of [
      { ...view.decision, message: "private" },
      { ...view.decision, actions: [] },
      {
        ...view.decision,
        actions: [
          { id: "trust", label: residentActionLabels.trust },
          { id: "trust", label: residentActionLabels.trust },
        ],
      },
      { ...view.decision, actions: [{ id: "trust", label: "arbitrary" }] },
    ])
      expect(isResident({ ...view, decision })).toBe(false);
    expect(isResident({ ...view, progress: "C:\\Users\\private" })).toBe(false);
    expect(isResident({ ...view, online: false })).toBe(false);
    expect(
      isHostMessage({
        kind: "event",
        event: { topic: "launcherResident", value: view },
      }),
    ).toBe(true);
  });
  it("admits only the closed review values, with both blocked reasons", () => {
    const decision = view.decision as NonNullable<ResidentView["decision"]>;
    const wire = (review: unknown) => ({
      kind: "event",
      event: {
        topic: "launcherResident",
        value: { ...view, decision: { ...decision, review } },
      },
    });
    for (const review of [
      "available",
      "unavailable",
      "too-long",
      "blocked-lookalike",
      "blocked-unusual-path",
    ]) {
      expect(isResidentReview(review), review).toBe(true);
      expect(isHostMessage(wire(review)), review).toBe(true);
    }
    for (const review of [
      "blocked",
      "blocked-",
      "blocked-other",
      "lookalike",
      "unusual-path",
      "Blocked-lookalike",
      "blocked_lookalike",
      "blocked-lookalike ",
      "toString",
      "__proto__",
      "",
      { blocked: "lookalike" },
      { kind: "blocked", reason: "blocked-lookalike" },
      ["blocked-lookalike"],
      null,
      undefined,
      1,
    ]) {
      expect(isResidentReview(review), JSON.stringify(review)).toBe(false);
      expect(isHostMessage(wire(review)), JSON.stringify(review)).toBe(false);
    }
    // El motivo no admite campos añadidos, tampoco la ruta.
    for (const extra of [{ reason: "lookalike" }, { path: "C:\\x.exe" }])
      expect(
        isResident({
          ...view,
          decision: { ...decision, review: "blocked-lookalike", ...extra },
        }),
      ).toBe(false);
  });
  it("receives both blocked reasons from the Rust corpus and the QA scenes", () => {
    const sent = corpus.host.flatMap((message) => {
      const decision = (
        message as { event?: { value?: { decision?: { review?: string } } } }
      ).event?.value?.decision;
      return decision?.review ? [decision.review] : [];
    });
    for (const review of ["blocked-lookalike", "blocked-unusual-path"]) {
      expect(sent).toContain(review);
      const host = createMockHost(`visual-dark:launcher-review-${review}`);
      expect(
        host({
          kind: "request",
          id: 1,
          request: { method: "launcher.resident.get" },
        }),
      ).toMatchObject({ result: { value: { decision: { review } } } });
    }
  });
  it("requires the existing closed shortcut registration states", () => {
    const registration = {
      id: "qa",
      name: "QA",
      hotkey: "ctrl+shift+1",
      state: "registered",
    };
    expect(isResident({ ...view, registrations: [registration] })).toBe(true);
    for (const item of [
      { ...registration, state: "assumed" },
      { ...registration, error: "private" },
      { ...registration, registered: true },
    ])
      expect(isResident({ ...view, registrations: [item] })).toBe(false);
  });
});

it("resolves themed QA decisions without exposing a reply command", () => {
  for (const theme of ["dark", "light"]) {
    const host = createMockHost(`visual-${theme}:launcher-decision`);
    const reply = host({
      kind: "request",
      id: 1,
      request: { method: "launcher.resident.get" },
    });
    expect(reply).toMatchObject({
      kind: "response",
      result: {
        method: "launcher.resident.get",
        value: { online: true, decision: { kind: "authorization" } },
      },
    });
    expect(
      host({
        kind: "request",
        id: 2,
        request: { method: "launcher.resident.answer", action: "trust" },
      }),
    ).toBeNull();
  }
});
