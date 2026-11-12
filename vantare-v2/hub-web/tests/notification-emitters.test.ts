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
  const connection = connectEmitters(client as unknown as Client, {
    add: (input) => store.getState().add(input, 100),
    changeReports: (update) =>
      store.setState((value) => ({ records: update(value.records) })),
  });
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
    receive({
      kind: "event",
      event: {
        topic: "account",
        value: {
          ...account,
          gate: "none",
          session: "signedIn",
          verified: true,
          blocked: false,
        },
      },
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
          registrations: [],
          ...patch,
        },
      },
    });
  const report = (id: number, state = "accepted", notice = true) => {
    observe({ phase: "start", id, method: "testing.refresh" });
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
      method: "testing.refresh",
      reply: { method: "testing.refresh", value },
    });
    return value;
  };
  return {
    client,
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
it("uses saved preferences, deduplicates ready/error transitions and cleans subscriptions", () => {
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
  expect(h.records()).toHaveLength(1);
  h.store.getState().read();
  h.resident({});
  expect(h.records()[0].unread).toBe(false);
  h.resident({ error: true });
  h.resident({ error: true });
  expect(h.records()).toHaveLength(2);
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
