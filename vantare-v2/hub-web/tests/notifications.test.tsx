import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// @vitest-environment jsdom
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { AccessView, HostToUi } from "../src/contract/generated/contract";
import { notificationHistoryLimit } from "../src/contract/generated/contract";
import corpus from "../src/contract/generated/corpus.json";
import { isHostMessage } from "../src/contract/validation";
import { AccountProvider, useAccount } from "../src/renderer/app/AccountState";
import * as host from "../src/renderer/app/Host";
import {
  SectionChromeProvider,
  SectionTabsSlot,
} from "../src/renderer/app/SectionChrome";
import { UiProvider, useUi } from "../src/renderer/app/UiState";
import type { Client, RequestObservation } from "../src/renderer/bridge/client";
import {
  type Center,
  dateGroup,
  filtered,
  type NoticeInput,
  publish,
} from "../src/renderer/screens/notifications/center";
import { Notifications } from "../src/renderer/screens/notifications/Notifications";
import {
  NotificationsProvider as ActualNotificationsProvider,
  createNotifications,
  useNotifications,
} from "../src/renderer/screens/notifications/NotificationsState";
import { NotificationsLayout } from "../src/renderer/ui/NotificationsLayout";
import { NotificationsProvider } from "./notifications-provider";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const notice: NoticeInput = {
  source: "launcher",
  severity: "info",
  dedupeKey: "launcher.profile",
  title: "Perfil listo",
  text: "El perfil se inició correctamente.",
  action: "launcher",
};
it("deduplicates, preserves ids on changes and caps memory", () => {
  let center: Center = publish({ records: [], sequence: 0 }, notice, 1);
  expect(publish(center, notice, 2)).toBe(center);
  const id = center.records[0].id;
  center = publish(center, { ...notice, severity: "error" }, 2);
  expect(center.records[0].id).toBe(id);
  for (let i = 0; i < notificationHistoryLimit + 2; i++)
    center = publish(center, { ...notice, dedupeKey: `notice-${i}` }, i + 3);
  expect(center.records).toHaveLength(notificationHistoryLimit);
});
it("rejects unknown sources, forged actions, oversized text and invalid clocks", () => {
  const center: Center = { records: [], sequence: 0 };
  for (const input of [
    { ...notice, source: "remote" },
    { ...notice, action: "https://example.com" },
    { ...notice, title: "x".repeat(10000) },
  ])
    expect(publish(center, input as NoticeInput, 1)).toBe(center);
  expect(publish(center, notice, Number.NaN)).toBe(center);
  expect(publish(center, notice, Number.MAX_SAFE_INTEGER)).toBe(center);
});
it("hides Beta outside tester access and groups Updater with System", () => {
  let center: Center = { records: [], sequence: 0 };
  for (const source of [
    "launcher",
    "beta",
    "updater",
    "system",
    "report",
  ] as const)
    center = publish(center, { ...notice, source, dedupeKey: source }, 1);
  expect(filtered(center.records, "all", false)).toHaveLength(4);
  expect(filtered(center.records, "beta", false)).toEqual([]);
  expect(
    filtered(center.records, "system", true)
      .map((n) => n.source)
      .sort(),
  ).toEqual(["system", "updater"]);
});
it("groups by local civil dates", () => {
  const now = new Date(2026, 10, 10, 12);
  expect(dateGroup(new Date(2026, 10, 10, 0).getTime(), now)).toBe("today");
  expect(dateGroup(new Date(2026, 10, 9, 23).getTime(), now)).toBe("yesterday");
  expect(dateGroup(new Date(2026, 10, 4, 12).getTime(), now)).toBe("week");
  expect(dateGroup(new Date(2026, 10, 3, 12).getTime(), now)).toBe("earlier");
  expect(dateGroup(Number.NaN, now)).toBe("undated");
});
it("marks read, clears and never reuses ids within the session", () => {
  const store = createNotifications();
  store.getState().add(notice, 1);
  store.getState().read();
  expect(store.getState().records[0].unread).toBe(false);
  store.getState().setFilter("launcher");
  store.getState().clear();
  expect(store.getState().filter).toBe("launcher");
  expect(store.getState().records).toEqual([]);
  store.getState().add(notice, 2);
  expect(store.getState().records[0].id).toBe("n-2");
});
it("renders accessible panel actions and the empty state", async () => {
  const user = userEvent.setup();
  const read = vi.fn(),
    open = vi.fn(),
    full = vi.fn();
  const records = publish(
    { records: [], sequence: 0 },
    notice,
    Date.now(),
  ).records;
  const props = {
    records,
    tester: false,
    compact: true,
    filter: "all" as const,
    onFilter: vi.fn(),
    onRead: read,
    onClear: vi.fn(),
    onOpen: open,
    onFull: full,
  };
  const view = render(<NotificationsLayout {...props} />);
  expect(screen.queryByRole("button", { name: "Beta" })).toBeNull();
  await user.click(
    screen.getByRole("button", { name: "Marcar todo como leído" }),
  );
  expect(read).toHaveBeenCalledWith();
  await user.click(screen.getByRole("button", { name: "Ver Launcher" }));
  expect(open).toHaveBeenCalledWith(records[0].id, "launcher");
  await user.click(
    screen.getByRole("button", { name: "Ver todas las notificaciones" }),
  );
  expect(full).toHaveBeenCalledOnce();
  view.rerender(<NotificationsLayout {...props} records={[]} />);
  expect(screen.getByText("Todo al día")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Limpiar" }).hasAttribute("disabled"),
  ).toBe(true);
});

it("keeps full-view filters inside the notification card and usable by keyboard", async () => {
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NotificationsProvider>
        <UiProvider>
          <SectionChromeProvider>
            <SectionTabsSlot />
            <Notifications />
          </SectionChromeProvider>
        </UiProvider>
      </NotificationsProvider>
    </QueryClientProvider>,
  );
  expect(
    screen.getByRole("button", { name: "Todas" }).getAttribute("aria-pressed"),
  ).toBe("true");
  expect(screen.queryByRole("button", { name: "Beta" })).toBeNull();
  const unread = screen.getByRole("button", { name: "Sin leer · 0" });
  expect(
    screen.getByRole("region", { name: "Notificaciones" }).contains(unread),
  ).toBe(true);
  expect(screen.queryByRole("tab")).toBeNull();
  await user.click(unread);
  await user.keyboard("{End}{Enter}");
  const system = screen.getByRole("button", { name: "Sistema" });
  expect(system.getAttribute("aria-pressed")).toBe("true");
});

it("observes only explicit unexpected failures and test replies, deduplicating both", () => {
  let receive: (message: HostToUi) => void = () => {
    throw new Error("listener missing");
  };
  const unsubscribe = vi.fn();
  const listen = vi.fn((listener: (message: HostToUi) => void) => {
    receive = listener;
    return unsubscribe;
  });
  vi.spyOn(host, "useHost").mockReturnValue({
    client: {
      listen,
      observeRequests: () => () => {},
      subscribe: () => () => {},
      request: async () => undefined,
    } as unknown as Client,
  });
  const { result, unmount } = renderHook(() => useNotifications(), {
    wrapper: NotificationsProvider,
  });
  const messages: unknown[] = corpus.host;
  const failures = messages
    .filter(isHostMessage)
    .filter(
      (m): m is Extract<HostToUi, { kind: "failure" }> => m.kind === "failure",
    );
  const allowed = ["io", "unsupported", "incompatible"];
  for (const message of failures.filter((m) => !allowed.includes(m.error.kind)))
    act(() => receive(message));
  expect(result.current.records).toEqual([]);
  const unexpected = failures.filter((m) => allowed.includes(m.error.kind));
  expect(new Set(unexpected.map((m) => m.error.kind)).size).toBe(3);
  for (const message of unexpected) {
    act(() => receive(message));
    act(() => receive(message));
  }
  expect(result.current.records).toHaveLength(3);
  for (const record of result.current.records)
    expect(record).toMatchObject({
      source: "system",
      severity: "error",
      title: "Error local del Hub",
      text: "No se pudo completar la acción.",
      unread: true,
    });
  const success: HostToUi = {
    kind: "response",
    id: 10,
    result: { method: "notifications.test", accepted: true },
  };
  act(() => receive(success));
  act(() => receive(success));
  expect(result.current.records).toHaveLength(4);
  expect(result.current.records[0]).toMatchObject({
    source: "system",
    severity: "info",
    title: "Notificación de prueba",
    text: "Se envió la notificación de prueba.",
  });
  const id = result.current.records[0].id;
  act(() =>
    receive({
      kind: "response",
      id: 11,
      result: { method: "notifications.test", accepted: false },
    }),
  );
  expect(result.current.records).toHaveLength(4);
  expect(result.current.records[0]).toMatchObject({
    id,
    severity: "warning",
    text: "La notificación de prueba falló.",
  });
  unmount();
  expect(unsubscribe).toHaveBeenCalledTimes(2);
});
function NoticeSeed({ input }: { input: NoticeInput }) {
  const add = useNotifications().add;
  useEffect(() => {
    add(input);
  }, [add, input]);
  return null;
}
function NavigationProbe() {
  const section = useUi((state) => state.section);
  const requested = useUi((state) => state.testingReportsRequested);
  return (
    <>
      <output aria-label="Sección actual">{section}</output>
      <output aria-label="Lista solicitada">{String(requested)}</output>
    </>
  );
}
function NotificationsHarness({
  access,
  input,
}: {
  access: AccessView;
  input?: NoticeInput;
}) {
  const [cache] = useState(() => {
    const cache = new QueryClient();
    cache.setQueryData(host.coreKey, { ...host.offline, access });
    return cache;
  });
  useEffect(() => {
    cache.setQueryData(host.coreKey, { ...host.offline, access });
  }, [cache, access]);
  return (
    <QueryClientProvider client={cache}>
      <UiProvider>
        <NotificationsProvider>
          <SectionChromeProvider>
            <SectionTabsSlot />
            {input && <NoticeSeed input={input} />}
            <Notifications />
            <NavigationProbe />
          </SectionChromeProvider>
        </NotificationsProvider>
      </UiProvider>
    </QueryClientProvider>
  );
}
for (const action of ["launcher", "testing:reports"] as const) {
  it.each([
    { verified: false, blocked: false },
    { verified: true, blocked: true },
  ])(
    `hides inaccessible ${action} action without navigating or marking it read (%j)`,
    async (rights) => {
      const access = { ...host.offline.access, ...rights };
      const input = {
        ...notice,
        source:
          action === "launcher" ? ("launcher" as const) : ("report" as const),
        action,
      };
      render(<NotificationsHarness access={access} input={input} />);
      await screen.findByText(notice.title);
      expect(
        screen.queryByRole("button", {
          name: action === "launcher" ? "Ver Launcher" : "Ver informes",
        }),
      ).toBeNull();
      expect(screen.getByText("1 sin leer")).toBeTruthy();
      expect(screen.getByLabelText("Sección actual").textContent).toBe(
        "settings",
      );
    },
  );
}
it("opens an allowed notification destination and then marks it read", async () => {
  const user = userEvent.setup();
  render(
    <NotificationsHarness
      access={{ ...host.offline.access, verified: true, blocked: false }}
      input={notice}
    />,
  );
  await user.click(await screen.findByRole("button", { name: "Ver Launcher" }));
  expect(screen.getByLabelText("Sección actual").textContent).toBe("launcher");
  expect(screen.getByText("0 sin leer")).toBeTruthy();
});
it("returns Beta to All when tester access is lost", async () => {
  const user = userEvent.setup();
  const access = {
    ...host.offline.access,
    verified: true,
    blocked: false,
    tester: true,
  };
  const input: NoticeInput = {
    ...notice,
    source: "beta",
    action: "testing:reports",
  };
  const view = render(<NotificationsHarness access={access} input={input} />);
  await user.click(await screen.findByRole("button", { name: "Beta" }));
  expect(
    screen.getByRole("button", { name: "Beta" }).getAttribute("aria-pressed"),
  ).toBe("true");
  view.rerender(
    <NotificationsHarness
      access={{ ...access, tester: false }}
      input={input}
    />,
  );
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Todas" })
        .getAttribute("aria-pressed"),
    ).toBe("true"),
  );
  expect(screen.queryByRole("button", { name: "Beta" })).toBeNull();
  expect(screen.queryByText(notice.title)).toBeNull();
  expect(screen.getByText("0 sin leer")).toBeTruthy();
});

it("activates a full notification with Enter/Space and keeps inner actions independent", async () => {
  const user = userEvent.setup();
  const record = publish({ records: [], sequence: 0 }, notice, Date.now())
    .records[0];
  const open = vi.fn(),
    read = vi.fn();
  render(
    <NotificationsLayout
      records={[record]}
      tester
      compact={false}
      filter="all"
      onFilter={vi.fn()}
      onRead={read}
      onClear={vi.fn()}
      onOpen={open}
      onFull={vi.fn()}
    />,
  );
  const row = screen.getByRole("button", { name: notice.title });
  row.focus();
  await user.keyboard("{Enter}");
  expect(open).toHaveBeenCalledExactlyOnceWith(record.id, "launcher");
  open.mockClear();
  await user.keyboard(" ");
  expect(open).toHaveBeenCalledExactlyOnceWith(record.id, "launcher");
  open.mockClear();
  await user.click(screen.getByRole("button", { name: "Ver Launcher" }));
  expect(open).toHaveBeenCalledExactlyOnceWith(record.id, "launcher");
  open.mockClear();
  await user.click(screen.getByRole("button", { name: "Marcar leído" }));
  expect(read).toHaveBeenCalledExactlyOnceWith(record.id);
  expect(open).not.toHaveBeenCalled();
});

it("routes a report notice to the report list rather than the default tester summary", async () => {
  const access = {
    ...host.offline.access,
    verified: true,
    blocked: false,
    tester: true,
  };
  render(
    <NotificationsHarness
      access={access}
      input={{ ...notice, source: "report", action: "testing:reports" }}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Ver informes" }));
  expect(screen.getByLabelText("Sección actual").textContent).toBe("testing");
  expect(screen.getByLabelText("Lista solicitada").textContent).toBe("true");
});

it("the provider consumes an observed launcher failure without duplicating a generic Hub error", () => {
  const listeners = new Set<(message: HostToUi) => void>();
  let observe: ((event: RequestObservation) => void) | undefined;
  const client = {
    listen: (fn: (message: HostToUi) => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    observeRequests: (fn: typeof observe) => {
      observe = fn;
      return () => {};
    },
    subscribe: () => () => {},
    request: async () => undefined,
  };
  vi.spyOn(host, "useHost").mockReturnValue({
    client: client as unknown as Client,
  });
  const hook = renderHook(useNotifications, { wrapper: NotificationsProvider });
  const settings = (corpus.host as HostToUi[]).find(
    (m) => m.kind === "response" && m.result.method === "settings.get",
  );
  if (
    settings?.kind !== "response" ||
    settings.result.method !== "settings.get" ||
    !observe
  )
    throw new Error("missing emitter fixture");
  const settingsValue = settings.result.value;
  act(() => {
    for (const receive of listeners)
      receive({
        ...settings,
        result: {
          method: "settings.get",
          value: {
            ...settingsValue,
            protected: false,
            general: { ...settingsValue.general, launcher: true },
          },
        },
      });
  });
  act(() => {
    observe?.({ phase: "start", id: 71, method: "launcher.launch" });
    observe?.({
      phase: "done",
      id: 71,
      method: "launcher.launch",
      error: { kind: "io" },
    });
    for (const receive of listeners)
      receive({ kind: "failure", id: 71, error: { kind: "io" } });
  });
  expect(hook.result.current.records).toHaveLength(1);
  expect(hook.result.current.records[0].source).toBe("launcher");
});

it("conservatively clears report notices on every account publication, including an incidental same-account one", async () => {
  const listeners = new Set<(message: HostToUi) => void>();
  let observe: ((event: RequestObservation) => void) | undefined;
  const accountMessage = (corpus.host as HostToUi[]).find(
    (m) => m.kind === "response" && m.result.method === "account.get",
  );
  if (
    accountMessage?.kind !== "response" ||
    accountMessage.result.method !== "account.get"
  )
    throw new Error("missing account fixture");
  const value = {
    ...accountMessage.result.value,
    session: "signedIn" as const,
    gate: "none" as const,
    verified: true,
    blocked: false,
  };
  const client = {
    listen: (fn: (message: HostToUi) => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    observeRequests: (fn: typeof observe) => {
      observe = fn;
      return () => {};
    },
    subscribe: () => () => {},
    request: async (request: { method: string }) =>
      request.method === "account.get"
        ? { method: "account.get", value }
        : undefined,
  };
  vi.spyOn(host, "useHost").mockReturnValue({
    client: client as unknown as Client,
  });
  const hook = renderHook(
    () => ({ center: useNotifications(), account: useAccount() }),
    {
      wrapper: ({ children }) => (
        <AccountProvider>
          <ActualNotificationsProvider>{children}</ActualNotificationsProvider>
        </AccountProvider>
      ),
    },
  );
  await waitFor(() =>
    expect(hook.result.current.account.value?.session).toBe("signedIn"),
  );
  const participation = {
    reports: [
      {
        id: "report_A",
        title: "local",
        state: "accepted",
        notice: true,
        credit: false,
        fixedVersion: null,
        updatedAt: null,
      },
    ],
    questionnaires: [],
  };
  act(() => {
    observe?.({ phase: "start", id: 81, method: "testing.refresh" });
    observe?.({
      phase: "done",
      id: 81,
      method: "testing.refresh",
      reply: { method: "testing.refresh", value: participation },
    });
  });
  expect(hook.result.current.center.records).toHaveLength(1);
  act(() => {
    observe?.({ phase: "start", id: 82, method: "testing.refresh" });
    for (const receive of listeners)
      receive({ kind: "event", event: { topic: "account", value } });
  });
  expect(hook.result.current.center.records).toEqual([]);
  act(() => {
    observe?.({
      phase: "done",
      id: 82,
      method: "testing.refresh",
      reply: { method: "testing.refresh", value: participation },
    });
  });
  expect(hook.result.current.center.records).toEqual([]);
});
