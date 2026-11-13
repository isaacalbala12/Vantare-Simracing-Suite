// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import type {
  AccountView,
  HostToUi,
  Reply,
  ResidentView,
  SettingsView,
  TestingView,
  UpdatesView,
} from "../src/contract/generated/contract";
import corpus from "../src/contract/generated/corpus.json";
import { createAccountSession } from "../src/renderer/app/AccountSession";
import type { Client, RequestObservation } from "../src/renderer/bridge/client";
import { connectEmitters } from "../src/renderer/screens/notifications/emitters";
import { createNotifications } from "../src/renderer/screens/notifications/NotificationsState";

function fixture(method: string) {
  const message = (corpus.host as HostToUi[]).find(
    (value) => value.kind === "response" && value.result.method === method,
  );
  if (message?.kind !== "response" || !("value" in message.result))
    throw Error(method);
  return structuredClone(message.result.value);
}
function harness() {
  let receive: (message: HostToUi) => void = () => {};
  let observe: (message: RequestObservation) => void = () => {};
  const stop = vi.fn();
  const client = {
    listen: (fn: typeof receive) => {
      receive = fn;
      return stop;
    },
    observeRequests: (fn: typeof observe) => {
      observe = fn;
      return stop;
    },
    subscribe: vi.fn(() => stop),
    request: vi.fn(async () => undefined),
  };
  const store = createNotifications();
  const session = createAccountSession();
  const connection = connectEmitters(
    client as unknown as Client,
    {
      resetReports: () => store.getState().resetReports(),
      add: (input) => store.getState().add(input, 100),
      changeReports: (update) =>
        store.setState((value) => ({ records: update(value.records) })),
    },
    session,
  );
  const response = (result: Reply) =>
    receive({ kind: "response", id: 0, result });
  const settings = fixture("settings.get") as SettingsView;
  const account = fixture("account.get") as AccountView;
  const preferences = (enabled: boolean) =>
    response({
      method: "settings.get",
      value: {
        ...settings,
        protected: false,
        general: { ...settings.general, launcher: enabled, updates: enabled },
      },
    });
  const login = () =>
    session.confirm({
      ...account,
      gate: "none",
      session: "signedIn",
      verified: true,
      blocked: false,
    });
  const resident = (patch: Partial<ResidentView>) =>
    receive({
      kind: "event",
      event: {
        topic: "launcherResident",
        value: {
          online: true,
          protected: false,
          running: false,
          error: false,
          decision: null,
          execution: null,
          ownership: {kind: "unsupported"},
          registrations: [],
          ...patch,
        },
      },
    });
  const report = (
    id: number,
    state = "accepted",
    notice = true,
    method: "testing.refresh" | "triage.send" = "testing.refresh",
  ) => {
    observe({ phase: "start", id, method });
    const value: TestingView = {
      reports: [
        {
          id: "report1",
          title: "local",
          state,
          notice,
          credit: false,
          fixedVersion: state === "fixed" ? "1.2" : null,
          updatedAt: null,
        },
      ],
      questionnaires: [],
    };
    observe({
      phase: "done",
      id,
      method,
      reply: { method, value },
    });
    return value;
  };
  return {
    client,
    session,
    store,
    connection,
    response,
    observe: (value: RequestObservation) => observe(value),
    preferences,
    login,
    resident,
    report,
    records: () => store.getState().records,
  };
}
it("uses saved preferences, deduplicates errors and never infers success from idle", () => {
  const h = harness();
  h.resident({ running: true });
  h.resident({});
  expect(h.records()).toEqual([]);
  h.preferences(false);
  h.resident({ error: true });
  expect(h.records()).toEqual([]);
  h.preferences(true);
  h.resident({ running: true });
  h.resident({});
  expect(h.records()).toEqual([]);
  h.resident({ error: true });
  expect(h.records()).toHaveLength(1);
  h.store.getState().read();
  h.resident({ error: true });
  expect(h.records()).toHaveLength(1);
  expect(h.records()[0].unread).toBe(false);
  h.connection.dispose();
  expect(h.client.subscribe.mock.results[0].value).toHaveBeenCalled();
});
it("does not call an offline/protected or questioned execution ready", () => {
  const h = harness();
  h.preferences(true);
  h.resident({ running: true });
  h.resident({ online: false });
  h.resident({ running: true });
  h.resident({ protected: true });
  h.resident({ running: true });
  h.resident({ decision: { id: "1", kind: "failure", actions: [] } });
  expect(h.records()).toEqual([]);
  h.connection.dispose();
});
it("uses typed update readiness, not a release note or restart availability alone", () => {
  const h = harness();
  const value = fixture("updates.get") as UpdatesView;
  h.preferences(false);
  const ready = {
    ...value,
    beta: {
      schema: 1,
      state: "ready",
      message: "private ignored",
      version: "1.2",
      notes: "ignored",
      rejectedVersion: null,
    },
  };
  h.response({ method: "updates.get", value: ready });
  expect(h.records()).toEqual([]);
  h.preferences(true);
  h.response({
    method: "updates.get",
    value: { ...value, beta: null, restartAvailable: true },
  });
  expect(h.records()).toEqual([]);
  h.response({ method: "updates.get", value: ready });
  h.response({ method: "updates.get", value: ready });
  expect(h.records()).toHaveLength(1);
  expect(h.records()[0].text).not.toContain("private");
  h.connection.dispose();
});
it("reports launch errors only for actionable failures and owns their generic error", () => {
  const h = harness();
  h.preferences(true);
  for (const kind of ["busy", "denied"] as const)
    h.observe({
      phase: "done",
      id: 1,
      method: "launcher.launch",
      error: { kind },
    });
  expect(h.records()).toEqual([]);
  h.observe({
    phase: "done",
    id: 2,
    method: "launcher.favorite",
    error: { kind: "io" },
  });
  expect(h.records()).toHaveLength(1);
  expect(h.connection.ownsFailure(2)).toBe(true);
  expect(h.connection.ownsFailure(2)).toBe(false);
  h.connection.dispose();
});
it("synchronizes accepted/fixed reports, acknowledgements and account generations", () => {
  const h = harness();
  h.login();
  h.report(1);
  h.store.getState().read();
  h.report(2);
  expect(h.records()).toHaveLength(1);
  expect(h.records()[0].unread).toBe(false);
  h.report(3, "fixed");
  expect(h.records()).toHaveLength(2);
  h.report(4, "fixed", false);
  expect(h.records().every((record) => !record.unread)).toBe(true);
  const old = h.report(5);
  h.observe({ phase: "start", id: 6, method: "testing.refresh" });
  h.session.invalidate();
  h.observe({ phase: "start", id: 7, method: "account.logout" });
  expect(h.records()).toEqual([]);
  h.login();
  h.observe({
    phase: "done",
    id: 6,
    method: "testing.refresh",
    reply: { method: "testing.refresh", value: old },
  });
  expect(h.records()).toEqual([]);
  h.report(8);
  expect(h.records()).toHaveLength(1);
  h.connection.dispose();
});

it("favorite accepted:false is profile selection, never a persistent failure", () => {
  const h = harness();
  h.preferences(true);
  h.observe({
    phase: "done",
    id: 3,
    method: "launcher.favorite",
    reply: { method: "launcher.favorite", accepted: false },
  });
  expect(h.records()).toEqual([]);
  h.connection.dispose();
});
it.each([true, false])(
  "resident errors are independent of settings ordering: preferences first=%s",
  (first) => {
    const h = harness();
    if (first) h.preferences(true);
    h.resident({ error: true });
    if (!first) h.preferences(true);
    expect(h.records()).toHaveLength(1);
    h.connection.dispose();
  },
);
it("a repeated error stays read, but recovery then a new error creates a new unread incident", () => {
  const h = harness();
  h.preferences(true);
  h.resident({ error: true });
  h.store.getState().read();
  h.resident({ error: true });
  expect(h.records()).toHaveLength(1);
  expect(h.records()[0].unread).toBe(false);
  h.resident({ error: false });
  h.resident({ error: true });
  expect(h.records()).toHaveLength(2);
  expect(h.records()[0].unread).toBe(true);
  expect(h.records()[1].unread).toBe(false);
  h.connection.dispose();
});
it("clear remembers update versions and report states for this session", () => {
  const h = harness();
  h.preferences(true);
  h.login();
  const value = fixture("updates.get") as UpdatesView;
  const ready = {
    ...value,
    beta: {
      schema: 1,
      state: "ready",
      message: "",
      version: "1.2",
      notes: "",
      rejectedVersion: null,
    },
  };
  h.response({ method: "updates.get", value: ready });
  h.report(1);
  expect(h.records()).toHaveLength(2);
  h.store.getState().clear();
  h.response({ method: "updates.get", value: ready });
  h.report(2);
  expect(h.records()).toEqual([]);
  h.report(3, "fixed");
  h.response({
    method: "updates.get",
    value: { ...ready, beta: { ...ready.beta, version: "1.3" } },
  });
  expect(h.records()).toHaveLength(2);
  h.session.invalidate();
  h.login();
  h.report(4);
  expect(
    h.records().some((r) => r.dedupeKey === "report:report1:accepted"),
  ).toBe(true);
  h.connection.dispose();
});
it("only an access generation clears report notices, not an unconfirmed status blink", () => {
  const h = harness();
  h.login();
  h.report(1);
  h.store.getState().read();
  const value = fixture("account.get") as AccountView;
  h.session.confirm({ ...value, session: "pending", gate: "checking" });
  expect(h.records()).toHaveLength(1);
  h.login();
  h.report(2);
  expect(h.records()).toHaveLength(1);
  expect(h.records()[0].unread).toBe(false);
  h.session.invalidate();
  expect(h.records()).toEqual([]);
  h.login();
  h.report(3);
  expect(h.records()).toHaveLength(1);
  expect(h.records()[0].unread).toBe(true);
  h.connection.dispose();
});

it("does not deliver a report response while the same generation is unconfirmed", () => {
  const h = harness();
  h.login();
  const value = h.report(1);
  h.store.getState().clear();
  h.observe({ phase: "start", id: 2, method: "testing.refresh" });
  const before = h.session.getSnapshot().generation;
  h.session.confirm({
    ...(fixture("account.get") as AccountView),
    session: "pending",
    gate: "checking",
  });
  expect(h.session.getSnapshot().generation).toBe(before);
  h.observe({
    phase: "done",
    id: 2,
    method: "testing.refresh",
    reply: {
      method: "testing.refresh",
      value: {
        ...value,
        reports: value.reports.map((r) => ({ ...r, id: "report2" })),
      },
    },
  });
  expect(h.records()).toEqual([]);
  h.connection.dispose();
});

it("does not adopt a request started unconfirmed after confirmation in the same generation", () => {
  const h = harness();
  const value = fixture("testing.refresh") as TestingView;
  const report = {
    ...value,
    reports: [
      {
        id: "unconfirmed",
        title: "local",
        state: "accepted",
        notice: true,
        credit: false,
        fixedVersion: null,
        updatedAt: null,
      },
    ],
  };
  h.observe({ phase: "start", id: 1, method: "testing.refresh" });
  const before = h.session.getSnapshot().generation;
  h.login();
  expect(h.session.getSnapshot().generation).toBe(before);
  h.observe({
    phase: "done",
    id: 1,
    method: "testing.refresh",
    reply: { method: "testing.refresh", value: report },
  });
  expect(h.records()).toEqual([]);
  h.report(2);
  expect(h.records()).toHaveLength(1);
  h.connection.dispose();
});

it("forgets a recovered resident error before preferences arrive", () => {
  const h = harness();
  h.resident({ error: true });
  h.resident({ error: false });
  h.preferences(true);
  expect(h.records()).toEqual([]);
  h.resident({ error: true });
  expect(h.records()).toHaveLength(1);
  h.connection.dispose();
});

it.each([{ online: false }, { protected: true }])(
  "does not notify an error from an unavailable resident: %o",
  (patch) => {
    const h = harness();
    h.preferences(true);
    h.resident({ ...patch, error: true });
    expect(h.records()).toEqual([]);
    h.connection.dispose();
  },
);

it("does not trust enabled preferences in a protected settings document", () => {
  const h = harness();
  const value = fixture("settings.get") as SettingsView;
  h.response({
    method: "settings.get",
    value: {
      ...value,
      protected: true,
      general: { ...value.general, launcher: true, updates: true },
    },
  });
  h.resident({ error: true });
  expect(h.records()).toEqual([]);
  h.preferences(true);
  expect(h.records()).toHaveLength(1);
  h.connection.dispose();
});

it.each(["pending", "rejected", "submitted"])(
  "does not turn report state %s into acceptance",
  (state) => {
    const h = harness();
    h.login();
    h.report(1, state);
    expect(h.records()).toEqual([]);
    h.connection.dispose();
  },
);

it("emits an accepted report from triage.send", () => {
  const h = harness();
  h.login();
  h.report(1, "accepted", true, "triage.send");
  expect(h.records()).toHaveLength(1);
  expect(h.records()[0].dedupeKey).toBe("report:report1:accepted");
  h.connection.dispose();
});

it("keeps an unacknowledged report unread on repeated refreshes", () => {
  const h = harness();
  h.login();
  h.report(1);
  h.report(2);
  expect(h.records()).toHaveLength(1);
  expect(h.records()[0].unread).toBe(true);
  h.report(3, "accepted", false);
  expect(h.records()[0].unread).toBe(false);
  h.connection.dispose();
});

it.each([true, false])(
  "refreshes emitter preferences directly from settings.update conflict: enabled=%s",
  (enabled) => {
    const h = harness();
    h.preferences(!enabled);
    const settings = fixture("settings.get") as SettingsView;
    h.observe({
      phase: "done",
      id: 1,
      method: "settings.update",
      error: {
        kind: "conflict",
        current: {
          ...settings,
          protected: false,
          general: { ...settings.general, launcher: enabled, updates: enabled },
        },
      },
    });
    h.resident({ error: true });
    expect(h.records()).toHaveLength(enabled ? 1 : 0);
    h.connection.dispose();
  },
);

it("notifies failed launch attempts once per outage and still owns each generic failure", () => {
  const h = harness();
  h.preferences(true);
  const fail = (id: number) =>
    h.observe({
      phase: "done",
      id,
      method: "launcher.launch",
      error: { kind: "io" },
    });
  fail(1);
  h.store.getState().read();
  fail(2);
  expect(h.records()).toHaveLength(1);
  expect(h.records()[0].unread).toBe(false);
  expect(h.connection.ownsFailure(1)).toBe(true);
  expect(h.connection.ownsFailure(2)).toBe(true);
  h.resident({ online: false });
  fail(3);
  h.resident({ protected: true });
  fail(4);
  expect(h.records()).toHaveLength(1);
  h.resident({});
  fail(5);
  expect(h.records()).toHaveLength(2);
  expect(h.records()[0].unread).toBe(true);
  expect(h.records()[1].unread).toBe(false);
  h.connection.dispose();
});

it("an accepted launch confirms recovery but choosing a missing favorite does not", () => {
  const h = harness();
  h.preferences(true);
  const fail = (id: number) =>
    h.observe({
      phase: "done",
      id,
      method: "launcher.favorite",
      error: { kind: "io" },
    });
  fail(1);
  h.observe({
    phase: "done",
    id: 2,
    method: "launcher.favorite",
    reply: { method: "launcher.favorite", accepted: false },
  });
  fail(3);
  expect(h.records()).toHaveLength(1);
  h.observe({
    phase: "done",
    id: 4,
    method: "launcher.favorite",
    reply: { method: "launcher.favorite", accepted: true },
  });
  fail(5);
  expect(h.records()).toHaveLength(2);
  h.connection.dispose();
});
it("repeated healthy resident photos do not declare a failed launch recovered", () => {
  const h = harness();
  h.preferences(true);
  h.resident({});
  h.observe({
    phase: "done",
    id: 1,
    method: "launcher.launch",
    error: { kind: "io" },
  });
  h.store.getState().read();
  h.resident({});
  h.resident({});
  h.observe({
    phase: "done",
    id: 2,
    method: "launcher.launch",
    error: { kind: "io" },
  });
  expect(h.records()).toHaveLength(1);
  expect(h.records()[0].unread).toBe(false);
  h.resident({ online: false });
  h.resident({});
  h.observe({
    phase: "done",
    id: 3,
    method: "launcher.launch",
    error: { kind: "io" },
  });
  expect(h.records()).toHaveLength(2);
  expect(h.records()[0].unread).toBe(true);
  h.connection.dispose();
});
it.each(["disabled", "loading"])(
  "does not consume a launch failure episode while preferences are %s",
  (state) => {
    const h = harness();
    if (state === "disabled") h.preferences(false);
    const fail = (id: number) =>
      h.observe({
        phase: "done",
        id,
        method: "launcher.launch",
        error: { kind: "io" },
      });
    fail(1);
    expect(h.records()).toHaveLength(0);
    h.preferences(true);
    fail(2);
    expect(h.records()).toHaveLength(1);
    fail(3);
    expect(h.records()).toHaveLength(1);
    h.connection.dispose();
  },
);
