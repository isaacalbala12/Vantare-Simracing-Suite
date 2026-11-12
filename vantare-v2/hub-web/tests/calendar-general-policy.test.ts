import { expect, it, vi } from "vitest";
import coreFixture from "../fixtures/core-offline.json";
import type {
  CoreStatus,
  SettingsView,
} from "../src/contract/generated/contract";
import type { MockContext } from "../src/mock/context";
import { create as calendar } from "../src/mock/modules/calendar";
import { create as settings } from "../src/mock/modules/settings";

it("shares the saved General preference with the Calendar test without real notices", () => {
  const core = structuredClone(coreFixture) as CoreStatus;
  core.access.verified = true;
  core.access.calendar = true;
  core.rights = "connected";
  const emit = vi.fn();
  const context: MockContext = {
    core,
    emit,
    sceneName: "calendar-data",
    visual: null,
    notes: [],
    note: vi.fn(),
  };
  const set = settings(context),
    cal = calendar(context);
  const initial = set({
    kind: "request",
    id: 1,
    request: { method: "settings.get" },
  });
  if (initial?.kind !== "response" || initial.result.method !== "settings.get")
    throw new Error("missing settings");
  let view: SettingsView = initial.result.value;
  for (const enabled of [false, true]) {
    const saved = set({
      kind: "request",
      id: 2,
      request: {
        method: "settings.update",
        baseRevision: view.revision,
        patch: { field: "toasts", value: enabled },
      },
    });
    if (saved?.kind !== "response" || saved.result.method !== "settings.update")
      throw new Error("missing saved settings");
    view = saved.result.value;
    const reply = cal({
      kind: "request",
      id: 3,
      request: { method: "calendar.noticeTest" },
    });
    expect(reply).toEqual({
      kind: "response",
      id: 3,
      result: { method: "calendar.noticeTest", accepted: enabled },
    });
    expect(emit).toHaveBeenCalledTimes(enabled ? 1 : 0);
  }
});
