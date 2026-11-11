import { describe, expect, it } from "vitest";
import type { ResidentView } from "../src/contract/generated/contract";
import { residentActionLabels } from "../src/contract/generated/launcher_resident";
import { isResident } from "../src/contract/modules/launcher_resident";
import { isHostMessage, isUiMessage } from "../src/contract/validation";
import { createMockHost } from "../src/mock/host";

const view: ResidentView = {
  protected: false,
  online: true,
  running: true,
  error: false,
  decision: {
    id: "18446744073709551615",
    kind: "authorization",
    actions: [
      { id: "trust", label: residentActionLabels.trust },
      { id: "cancel", label: residentActionLabels.cancel },
    ],
  },
  registrations: [],
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
    for (const id of ["01", "-1", "18446744073709551616", "1e3", 1])
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
