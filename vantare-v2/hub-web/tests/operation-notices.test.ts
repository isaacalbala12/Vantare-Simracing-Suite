import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import type {
  HostToUi,
  SettingsView,
  UpdatesView,
} from "../src/contract/generated/contract";
import corpus from "../src/contract/generated/corpus.json";
import {
  observeOperationNoticeSafely,
  operationNotices,
} from "../src/main/operation-notices";
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
it("forgets the previous account preferences before a new settings snapshot arrives", () => {
  const present = vi.fn((_: SystemNotice) => true);
  const observer = operationNotices(present);
  const core = (accountGeneration: string) =>
    observer.observe({
      kind: "event",
      event: {
        topic: "core",
        value: { ...notificationCore, accountGeneration },
      },
    });
  if (!notificationCore.accountGeneration)
    throw Error("account generation fixture");
  core(notificationCore.accountGeneration);
  observer.observe({
    kind: "response",
    id: 1,
    result: { method: "settings.get", value: settings() },
  });
  observer.observe({
    kind: "event",
    event: { topic: "launcherResident", value: residentCompletionView([]) },
  });
  const nextGeneration = "e".repeat(64);
  core(nextGeneration);
  for (const events of [[], [received], [received, finished]]) {
    const value = residentCompletionView(events);
    if (value.execution?.results.kind !== "known") throw Error("results");
    value.execution.results.value.accountGeneration = nextGeneration;
    observer.observe({
      kind: "event",
      event: { topic: "launcherResident", value },
    });
  }
  observer.observe({
    kind: "event",
    event: { topic: "updates", value: update },
  });
  expect(present).not.toHaveBeenCalled();
  observer.observe({
    kind: "response",
    id: 2,
    result: { method: "settings.get", value: settings(false, false) },
  });
  observer.observe({
    kind: "event",
    event: { topic: "updates", value: update },
  });
  expect(present).not.toHaveBeenCalled();
});
it("resets the update deduplication key at an account transition", () => {
  const present = vi.fn((_: SystemNotice) => true),
    observer = operationNotices(present);
  for (const accountGeneration of [
    notificationCore.accountGeneration,
    "e".repeat(64),
  ]) {
    observer.observe({
      kind: "event",
      event: {
        topic: "core",
        value: { ...notificationCore, accountGeneration },
      },
    });
    observer.observe({
      kind: "response",
      id: 1,
      result: { method: "settings.get", value: settings() },
    });
    observer.observe({
      kind: "event",
      event: { topic: "updates", value: update },
    });
  }
  expect(present).toHaveBeenCalledTimes(2);
});
it("isolates a malformed sequence and resets the feed before other host work continues", () => {
  const present = vi.fn((_: SystemNotice) => true),
    observer = operationNotices(present);
  observer.observe({
    kind: "event",
    event: { topic: "core", value: notificationCore },
  });
  observer.observe({
    kind: "response",
    id: 1,
    result: { method: "settings.get", value: settings() },
  });
  observer.observe({
    kind: "event",
    event: { topic: "launcherResident", value: residentCompletionView([]) },
  });
  const malformed = residentCompletionView([
    { ...received, seq: "not-a-number" },
  ]);
  const reset = vi.spyOn(observer, "reset"),
    continuation = vi.fn();
  expect(() => {
    observeOperationNoticeSafely(observer, {
      kind: "event",
      event: { topic: "launcherResident", value: malformed },
    });
    continuation();
  }).not.toThrow();
  expect(reset).toHaveBeenCalledTimes(1);
  expect(continuation).toHaveBeenCalledTimes(1);
  for (const events of [[], [received], [received, finished]])
    observer.observe({
      kind: "event",
      event: {
        topic: "launcherResident",
        value: residentCompletionView(events),
      },
    });
  expect(present).not.toHaveBeenCalled();
});
it("wires the guarded observer before calendar delivery in the shared host callback", () => {
  const main = readFileSync(
    new URL("../src/main/index.ts", import.meta.url),
    "utf8",
  );
  expect(main).toContain(
    "observeOperationNoticeSafely(notices.operations, message)",
  );
  expect(main).not.toContain("notices.operations.observe(message)");
  expect(
    main.indexOf("observeOperationNoticeSafely(notices.operations, message)"),
  ).toBeLessThan(main.indexOf("calendarNotices.receive(message.event.value)"));
});
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

it.each([true, false])(
  "keeps Launcher and updater preferences independent (%s)",
  (launcher) => {
    const present = vi.fn((_: SystemNotice) => true);
    const observer = operationNotices(present);
    const value = settings(launcher, true);
    value.general.updates = !launcher;
    observer.observe({
      kind: "response",
      id: 1,
      result: { method: "settings.get", value },
    });
    observer.observe({
      kind: "event",
      event: { topic: "core", value: notificationCore },
    });
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
    expect(present).toHaveBeenCalledTimes(1);
    expect(present.mock.calls[0][0].title).toBe(
      launcher ? "Aplicaciones listas" : "Actualización lista",
    );
  },
);
