import { expect, it, vi } from "vitest";
import type {
  HostToUi,
  SettingsView,
  UpdatesView,
} from "../src/contract/generated/contract";
import corpus from "../src/contract/generated/corpus.json";
import { operationNotices } from "../src/main/operation-notices";
import type { SystemNotice } from "../src/main/system-notifications";
import {
  finished,
  notificationCore,
  received,
  residentCompletionView,
} from "./helpers/launcher-completion";

function settings(launcher = true, toasts = true): SettingsView {
  const message = (corpus.host as HostToUi[]).find(
    (item) => item.kind === "response" && item.result.method === "settings.get",
  );
  if (message?.kind !== "response" || message.result.method !== "settings.get")
    throw Error("settings");
  const value = structuredClone(message.result.value);
  return {
    ...value,
    protected: false,
    general: { ...value.general, launcher, updates: launcher, toasts },
  };
}
const beta = {
  schema: 1,
  state: "ready",
  message: "private host details",
  version: "2.0.0",
  notes: "",
  rejectedVersion: null,
};
const update: UpdatesView = {
  installation: "installed",
  version: "1.0.0",
  channel: "nightly",
  previous: false,
  beta,
  registrationWarning: null,
  news: [],
  restartAvailable: true,
};
it.each([
  [false, false],
  [false, true],
  [true, false],
  [true, true],
])("respects source=%s and Windows=%s for both sources", (enabled, windows) => {
  const present = vi.fn((_: SystemNotice) => true),
    observer = operationNotices(present);
  observer.observe({
    kind: "event",
    event: { topic: "core", value: notificationCore },
  });
  observer.observe({
    kind: "response",
    id: 1,
    result: { method: "settings.get", value: settings(enabled, windows) },
  });
  const resident = (events: Parameters<typeof residentCompletionView>[0]) =>
    observer.observe({
      kind: "event",
      event: {
        topic: "launcherResident",
        value: residentCompletionView(events),
      },
    });
  resident([]);
  resident([received]);
  expect(present).not.toHaveBeenCalled();
  resident([received, finished]);
  observer.observe({
    kind: "event",
    event: { topic: "updates", value: update },
  });
  expect(present).toHaveBeenCalledTimes(enabled && windows ? 2 : 0);
  resident([received, finished]);
  observer.observe({
    kind: "response",
    id: 2,
    result: { method: "updates.get", value: update },
  });
  expect(present).toHaveBeenCalledTimes(enabled && windows ? 2 : 0);
  for (const [value] of present.mock.calls) {
    expect(value.body).not.toContain("private host details");
    expect(value).toEqual(expect.objectContaining({ silent: false }));
  }
});
it("does not replay muted completions when enabling Windows", () => {
  const present = vi.fn((_: SystemNotice) => true),
    observer = operationNotices(present);
  observer.observe({
    kind: "event",
    event: { topic: "core", value: notificationCore },
  });
  const receiveSettings = (value: SettingsView) =>
    observer.observe({
      kind: "response",
      id: 1,
      result: { method: "settings.update", value },
    });
  receiveSettings(settings(true, false));
  for (const events of [[], [received], [received, finished]])
    observer.observe({
      kind: "event",
      event: {
        topic: "launcherResident",
        value: residentCompletionView(events),
      },
    });
  observer.observe({
    kind: "event",
    event: { topic: "updates", value: update },
  });
  receiveSettings(settings(true, true));
  observer.observe({
    kind: "event",
    event: {
      topic: "launcherResident",
      value: residentCompletionView([received, finished]),
    },
  });
  observer.observe({
    kind: "event",
    event: { topic: "updates", value: update },
  });
  expect(present).not.toHaveBeenCalled();
});
it("is silent without preferences, with a protected document and after close", () => {
  const present = vi.fn((_: SystemNotice) => true),
    observer = operationNotices(present);
  observer.observe({
    kind: "event",
    event: { topic: "updates", value: update },
  });
  observer.observe({
    kind: "response",
    id: 1,
    result: {
      method: "settings.get",
      value: { ...settings(), protected: true },
    },
  });
  observer.observe({
    kind: "event",
    event: {
      topic: "updates",
      value: { ...update, beta: { ...beta, version: "3.0.0" } },
    },
  });
  observer.close();
  observer.observe({
    kind: "response",
    id: 2,
    result: { method: "settings.get", value: settings() },
  });
  observer.observe({
    kind: "event",
    event: {
      topic: "updates",
      value: { ...update, beta: { ...beta, version: "4.0.0" } },
    },
  });
  expect(present).not.toHaveBeenCalled();
});
