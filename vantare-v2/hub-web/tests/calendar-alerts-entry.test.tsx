// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render as renderTree,
  screen,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import fixture from "../fixtures/calendar-demo.json";
import freshSettings from "../fixtures/settings-base.json";
import {defaultWindowsNotifications} from "../src/contract/generated/settings";
import {
  type CalendarConfigView,
  calendarDefaultAlerts,
} from "../src/contract/generated/calendar";
import { SectionChromeProvider } from "../src/renderer/app/SectionChrome";
import { calendarAlertsText as text } from "../src/renderer/i18n/calendarAlerts";
import CalendarEntry from "../src/renderer/screens/calendar/entry";
import { ToastProvider, TooltipProvider } from "../src/renderer/ui/Layers";

const render = (ui: ReactNode) => renderTree(ui, { wrapper: ToastProvider });
const api = vi.hoisted(() => ({
  request: vi.fn(),
  launchView: undefined as
    | import("../src/contract/generated/calendar").CalendarLaunchView
    | undefined,
  launchCancel: vi.fn(),
  launchArm: vi.fn(),
  alertsUnavailable: vi.fn(),
  expired: false,
  hideLaunch: false,
  toasts: true,
  settingsState: "ready" as "ready" | "loading" | "error",
  noticeAllowed: vi.fn(),
}));
vi.mock("../src/renderer/app/SettingsState", () => ({
  useSettings: () => ({
    view:
      api.settingsState === "ready"
        ? { general: { toasts: api.toasts }, protected: false }
        : undefined,
    loading: api.settingsState === "loading",
  }),
}));
vi.mock(
  "../src/renderer/screens/calendar/CalendarNoticeTest",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../src/renderer/screens/calendar/CalendarNoticeTest")
      >();
    return {
      ...actual,
      useCalendarNoticeTest: (allowed: boolean) => {
        api.noticeAllowed(allowed);
        return actual.useCalendarNoticeTest(allowed);
      },
    };
  },
);
vi.mock("../src/renderer/app/Host", () => ({
  useHost: () => ({ client: api, hello: { demo: false } }),
}));
vi.mock("../src/renderer/screens/calendar/CalendarState", () => ({
  useCalendar: () => ({
    allowed: true,
    connected: true,
    loaded: true,
    busy: false,
    now:
      Date.parse(api.expired ? fixture.validUntil : fixture.validFrom) +
      12 * 3600000,
    view: {
      official: api.expired ? null : fixture,
      fallback: null,
      previous: api.expired ? fixture : null,
      following: [],
      utc: true,
      checked: 0,
      updated: 0,
      invalidCache: false,
    },
    refresh: vi.fn(),
  }),
}));
vi.mock("../src/renderer/screens/calendar/CalendarLauncher", () => ({
  useCalendarLauncher: () => ({ canLaunch: false, launch: vi.fn() }),
}));
vi.mock("../src/renderer/screens/calendar/CalendarQARuns", () => ({
  useCalendarQARuns: () => [],
}));
vi.mock("../src/renderer/screens/calendar/CalendarHistory", () => ({
  useCalendarHistory: () => ({ reload: vi.fn() }),
}));
vi.mock("../src/renderer/ui/CalendarFrame", () => ({
  CalendarFrame: ({
    children,
    onAlerts,
  }: {
    children: ReactNode;
    onAlerts: () => void;
  }) => (
    <>
      <button type="button" onClick={onAlerts}>
        Avisos
      </button>
      {children}
    </>
  ),
}));
vi.mock("../src/renderer/ui/CalendarLiveView", () => ({
  CalendarLiveView: ({
    onSerie,
    onDetail,
    launchButtonRef,
  }: {
    onSerie: (id: string) => void;
    onDetail: (id: string) => void;
    launchButtonRef: import("react").Ref<HTMLButtonElement>;
  }) => (
    <>
      {!api.hideLaunch && (
        <button type="button" ref={launchButtonRef}>
          Lanzar a las 20:00
        </button>
      )}
      <button type="button" onClick={() => onSerie(fixture.series[0].id)}>
        Open series
      </button>
      <button type="button" onClick={() => onDetail(fixture.series[0].id)}>
        Open detail
      </button>
    </>
  ),
}));
afterEach(() => {
  cleanup();
  api.request.mockReset();
  api.launchView = undefined;
  api.launchCancel.mockReset();
  api.launchArm.mockReset();
  api.alertsUnavailable.mockReset();
  api.expired = false;
  api.hideLaunch = false;
  api.toasts = true;
  api.settingsState = "ready";
  api.noticeAllowed.mockReset();
});
function content() {
  return (
    <TooltipProvider>
      <SectionChromeProvider>
        <CalendarEntry />
      </SectionChromeProvider>
    </TooltipProvider>
  );
}
it.each(["protected", "unavailable"] as const)(
  "shows %s without invented values or an alertsSave in all three entry paths",
  async (state) => {
    const config: CalendarConfigView = {
      utc: true,
      prefsRevision: "a".repeat(64),
      following: [],
      followingRevision: "b".repeat(64),
      alerts: {
        ...calendarDefaultAlerts,
        bands: [],
        slots: [],
        channels: { ...calendarDefaultAlerts.channels },
      },
      alertsRevision: null,
      documents: { prefs: "ready", following: "ready", alerts: state },
    };
    api.request.mockResolvedValue({
      method: "calendar.configLoad",
      value: config,
    });
    render(content());
    await act(async () => {});
    const trigger = screen.getByRole("button", { name: "Avisos" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(
      within(screen.getByRole("dialog")).getByRole("status").textContent,
    ).toBe(text[state]);
    expect(screen.queryByRole("checkbox", { name: text.windows })).toBeNull();
    expect(screen.queryByRole("button", { name: "10 min" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: text.close }));
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog");
    await vi.waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true),
    );
    fireEvent.keyDown(dialog, { key: "Escape" });
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
    fireEvent.click(screen.getByRole("button", { name: "Open series" }));
    expect(screen.getByText(text[state])).toBeTruthy();
    expect(
      screen.queryByRole("switch", { name: "Avisar por franja horaria" }),
    ).toBeNull();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Próximas" }).at(-1) as HTMLElement,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open detail" }));
    expect(screen.getByText(text[state])).toBeTruthy();
    expect(
      screen.queryByRole("switch", { name: "Avisar por franja horaria" }),
    ).toBeNull();
    expect(api.request.mock.calls.map(([request]) => request.method)).toEqual([
      "calendar.configLoad",
    ]);
  },
);

it.each([true, false])(
  "reports the main presentation outcome (%s) without claiming delivery",
  async (accepted) => {
    const config: CalendarConfigView = {
      utc: true,
      prefsRevision: "a".repeat(64),
      following: [],
      followingRevision: "b".repeat(64),
      alerts: {
        ...calendarDefaultAlerts,
        bands: [],
        slots: [],
        channels: { ...calendarDefaultAlerts.channels },
      },
      alertsRevision: "c".repeat(64),
      documents: { prefs: "ready", following: "ready", alerts: "ready" },
    };
    api.request.mockImplementation(async (request) =>
      request.method === "calendar.noticeTest"
        ? { method: request.method, accepted }
        : { method: "calendar.configLoad", value: config },
    );
    render(content());
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Avisos" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: text.test }));
    });
    expect(api.request.mock.calls.map(([request]) => request)).toEqual([
      { method: "calendar.configLoad" },
      { method: "calendar.noticeTest" },
    ]);
    expect(
      screen.getByText(accepted ? text.testAccepted : text.testUnavailable),
    ).toBeTruthy();
    const button = screen.getByRole("button", { name: text.test });
    expect(button.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(button);
    expect(api.request).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  },
);

it("persists desktop channels with the observed revision and blocks duplicate writes without optimism", async () => {
  let config: CalendarConfigView = {
    utc: true,
    prefsRevision: "a".repeat(64),
    following: [],
    followingRevision: "b".repeat(64),
    alerts: {
      ...calendarDefaultAlerts,
      bands: [],
      slots: [],
      channels: { windows: true, inTrack: true, sound: false },
    },
    alertsRevision: "c".repeat(64),
    documents: { prefs: "ready", following: "ready", alerts: "ready" },
  };
  let finish!: (reply: unknown) => void;
  api.request.mockImplementation((request) =>
    request.method === "calendar.configLoad"
      ? Promise.resolve({ method: request.method, value: config })
      : new Promise((resolve) => {
          finish = resolve;
        }),
  );
  render(content());
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "Avisos" }));
  await vi.waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: text.close }),
    ),
  );
  const windows = screen.getByRole("checkbox", { name: text.windows });
  windows.focus();
  fireEvent.click(windows);
  await act(async () => {});
  const request = api.request.mock.calls.at(-1)?.[0];
  expect(request).toEqual({
    method: "calendar.alertsSave",
    expectedRevision: "c".repeat(64),
    alerts: {
      ...config.alerts,
      channels: { ...config.alerts.channels, windows: false },
    },
  });
  expect(windows.getAttribute("aria-checked")).toBe("true");
  expect(windows.getAttribute("aria-disabled")).toBe("true");
  expect(document.activeElement).toBe(windows);
  fireEvent.click(windows);
  fireEvent.click(screen.getByRole("checkbox", { name: text.sound }));
  expect(api.request).toHaveBeenCalledTimes(2);
  config = {
    ...config,
    alerts: request.alerts,
    alertsRevision: "d".repeat(64),
  };
  await act(async () => {
    finish({ method: "calendar.alertsSave", value: config });
  });
  expect(windows.getAttribute("aria-checked")).toBe("false");
  fireEvent.click(screen.getByRole("checkbox", { name: text.sound }));
  expect(api.request).toHaveBeenCalledTimes(2);
  fireEvent.click(windows);
  await act(async () => {});
  const second = {
    ...config.alerts,
    channels: { ...config.alerts.channels, windows: true },
  };
  expect(api.request.mock.calls.at(-1)?.[0]).toEqual({
    method: "calendar.alertsSave",
    expectedRevision: "d".repeat(64),
    alerts: second,
  });
  await act(async () => {
    finish({
      method: "calendar.alertsSave",
      value: { ...config, alerts: second },
    });
  });
});

it.each([false, true])(
  "wires the new-week switch from saved=%s with the alerts revision",
  async (saved) => {
    api.expired = true;
    const config: CalendarConfigView = {
      utc: true,
      prefsRevision: "a".repeat(64),
      following: [],
      followingRevision: "b".repeat(64),
      alerts: {
        ...calendarDefaultAlerts,
        bands: [],
        slots: [],
        channels: { ...calendarDefaultAlerts.channels },
        notifyWeek: saved,
      },
      alertsRevision: "c".repeat(64),
      documents: { prefs: "ready", following: "ready", alerts: "ready" },
    };
    api.request.mockImplementation(async (request) =>
      request.method === "calendar.notifyWeekSet"
        ? {
            method: request.method,
            value: {
              ...config,
              alerts: { ...config.alerts, notifyWeek: request.enabled },
            },
          }
        : { method: "calendar.configLoad", value: config },
    );
    render(content());
    await act(async () => {});
    const control = screen.getByRole("switch", { name: "Avisarme al llegar" });
    expect(control.getAttribute("aria-checked")).toBe(String(saved));
    await act(async () => {
      fireEvent.click(control);
    });
    expect(api.request.mock.calls.map(([request]) => request)).toEqual([
      { method: "calendar.configLoad" },
      {
        method: "calendar.notifyWeekSet",
        enabled: !saved,
        expectedRevision: config.alertsRevision,
      },
    ]);
    expect(control.getAttribute("aria-checked")).toBe(String(!saved));
  },
);

it.each([false, true])(
  "keeps saved Windows=%s and the new-week preference while General forbids desktop notices",
  async (windows) => {
    api.toasts = false;
    api.expired = true;
    const config: CalendarConfigView = {
      utc: true,
      prefsRevision: "a".repeat(64),
      following: [],
      followingRevision: "b".repeat(64),
      alerts: {
        ...calendarDefaultAlerts,
        bands: [],
        slots: [],
        notifyWeek: true,
        channels: { windows, sound: true, inTrack: true },
      },
      alertsRevision: "c".repeat(64),
      documents: { prefs: "ready", following: "ready", alerts: "ready" },
    };
    api.request.mockResolvedValue({
      method: "calendar.configLoad",
      value: config,
    });
    const ui = render(content());
    await act(async () => {});
    const week = screen.getByRole("switch", { name: "Avisarme al llegar" });
    expect(week.getAttribute("aria-checked")).toBe("true");
    expect(week.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(week);
    fireEvent.click(screen.getByRole("button", { name: "Avisos" }));
    await act(async () => {});
    for (const label of [text.windows, text.sound]) {
      const channel = screen.getByRole("checkbox", { name: label });
      expect(channel.getAttribute("aria-checked")).toBe(
        String(label === text.windows ? windows : true),
      );
      expect(channel.getAttribute("aria-disabled")).toBe("true");
      expect(
        document.getElementById(channel.getAttribute("aria-describedby") ?? "")
          ?.textContent,
      ).toBe(text.windowsDisabled);
      fireEvent.click(channel);
    }
    const track = screen.getByRole("checkbox", { name: text.track });
    expect(track.getAttribute("aria-disabled")).not.toBe("true");
    const probe = screen.getByRole("button", { name: text.test });
    expect(probe.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(probe);
    expect(api.request.mock.calls.map(([request]) => request.method)).toEqual([
      "calendar.configLoad",
    ]);
    api.toasts = true;
    ui.rerender(content());
    expect(
      screen
        .getByRole("checkbox", { name: text.windows })
        .getAttribute("aria-disabled"),
    ).not.toBe("true");
    expect(
      screen
        .getByRole("checkbox", { name: text.sound })
        .getAttribute("aria-checked"),
    ).toBe("true");
  },
);

it.each(["loading", "error"] as const)(
  "shows the actual Settings %s state rather than promising desktop notices",
  async (state) => {
    api.settingsState = state;
    api.request.mockResolvedValue({
      method: "calendar.configLoad",
      value: {
        utc: true,
        prefsRevision: "a".repeat(64),
        following: [],
        followingRevision: "b".repeat(64),
        alerts: { ...calendarDefaultAlerts, bands: [], slots: [] },
        alertsRevision: "c".repeat(64),
        documents: { prefs: "ready", following: "ready", alerts: "ready" },
      },
    });
    render(content());
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Avisos" }));
    await act(async () => {});
    expect(
      screen.getAllByText(
        state === "loading" ? text.windowsLoading : text.windowsUnavailable,
      ).length,
    ).toBeGreaterThan(0);
    if (state === "error")
      expect(screen.queryByText(text.windowsLoading)).toBeNull();
    expect(screen.queryByText(text.deliveryScope)).toBeNull();
    expect(screen.queryByText(text.sample)).toBeNull();
    expect(api.noticeAllowed).toHaveBeenLastCalledWith(false);
  },
);
it("gates noticeTest at the entry while General is off and re-enables it live", async () => {
  api.toasts = false;
  api.request.mockResolvedValue({
    method: "calendar.configLoad",
    value: {
      utc: true,
      prefsRevision: "a".repeat(64),
      following: [],
      followingRevision: "b".repeat(64),
      alerts: { ...calendarDefaultAlerts, bands: [], slots: [] },
      alertsRevision: "c".repeat(64),
      documents: { prefs: "ready", following: "ready", alerts: "ready" },
    },
  });
  const ui = render(content());
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "Avisos" }));
  await act(async () => {});
  expect(api.noticeAllowed).toHaveBeenLastCalledWith(false);
  expect(screen.queryByText(text.sample)).toBeNull();
  expect(screen.queryByText(text.deliveryScope)).toBeNull();
  api.toasts = true;
  ui.rerender(content());
  expect(api.noticeAllowed).toHaveBeenLastCalledWith(true);
  expect(screen.getByText(text.sample)).toBeTruthy();
});

vi.mock("../src/renderer/screens/calendar/CalendarLaunch", () => ({
  useCalendarLaunch: () => ({
    view: api.launchView,
    busy: false,
    arm: api.launchArm,
    cancel: api.launchCancel,
    alertsUnavailable: api.alertsUnavailable,
  }),
}));

function launchConfig(): CalendarConfigView {
  return {
    utc: true,
    prefsRevision: "a".repeat(64),
    following: [],
    followingRevision: "b".repeat(64),
    alerts: {
      ...calendarDefaultAlerts,
      autoLaunch: true,
      bands: [],
      slots: [],
      channels: { ...calendarDefaultAlerts.channels },
    },
    alertsRevision: "c".repeat(64),
    documents: { prefs: "ready", following: "ready", alerts: "ready" },
  };
}
function activeLaunch(automatic: boolean): NonNullable<typeof api.launchView> {
  const plan = {
    armId: "a".repeat(64),
    profile: "qa",
    profileName: "QA",
    decisionRequired: false,
    mode: automatic
      ? { kind: "alerts" as const, expectedRevision: "c".repeat(64) }
      : {
          kind: "once" as const,
          seriesId: fixture.series[0].id,
          startAt: 1800000180000,
        },
  };
  return {
    armed: automatic ? null : plan,
    automatic: automatic ? plan : null,
    latest: null,
    change: null,
  };
}
it("deactivation waits for a fresh config and saves false with that revision", async () => {
  const initial = launchConfig();
  api.launchView = activeLaunch(true);
  api.launchCancel.mockResolvedValue(true);
  let finish: (v: unknown) => void = () => {};
  let loads = 0;
  api.request.mockImplementation(async (request) => {
    if (request.method === "calendar.configLoad") {
      if (++loads === 1) return { method: request.method, value: initial };
      return await new Promise((resolve) => {
        finish = resolve;
      });
    }
    return { method: request.method, value: initial };
  });
  render(content());
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "Avisos" }));
  await act(async () =>
    fireEvent.click(
      screen.getByRole("switch", { name: /Lanzar .* autom\u00e1ticamente/u }),
    ),
  );
  expect(api.launchCancel).toHaveBeenCalledWith("a".repeat(64));
  expect(
    api.request.mock.calls.filter(([r]) => r.method === "calendar.alertsSave"),
  ).toHaveLength(0);
  await act(async () =>
    finish({
      method: "calendar.configLoad",
      value: { ...initial, alertsRevision: "d".repeat(64) },
    }),
  );
  expect(api.request).toHaveBeenLastCalledWith({
    method: "calendar.alertsSave",
    expectedRevision: "d".repeat(64),
    alerts: { ...initial.alerts, autoLaunch: false },
  });
});
it("canceling a scheduled launch restores focus to the timing button", async () => {
  api.launchView = activeLaunch(false);
  api.launchCancel.mockResolvedValue(true);
  api.request.mockResolvedValue({
    method: "calendar.configLoad",
    value: launchConfig(),
  });
  render(content());
  await act(async () => {});
  const cancel = screen.getByRole("button", {
    name: "Cancelar lanzamiento puntual",
  });
  cancel.focus();
  await act(async () => fireEvent.click(cancel));
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Lanzar a las 20:00" }),
  );
});

it("warns instead of silently ignoring deactivation when the fresh alerts revision is missing", async () => {
  const initial = launchConfig();
  api.launchView = activeLaunch(true);
  api.launchCancel.mockResolvedValue(true);
  let loads = 0;
  api.request.mockImplementation(async (request) => ({
    method: request.method,
    value: ++loads === 1 ? initial : { ...initial, alertsRevision: null },
  }));
  render(content());
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "Avisos" }));
  await act(async () =>
    fireEvent.click(
      screen.getByRole("switch", { name: /Lanzar .* autom\u00e1ticamente/u }),
    ),
  );
  expect(api.alertsUnavailable).toHaveBeenCalledOnce();
  expect(
    api.request.mock.calls.filter(([r]) => r.method === "calendar.alertsSave"),
  ).toHaveLength(0);
});

it("does not defer focus indefinitely when the real timing button has unmounted", async () => {
  api.launchView = activeLaunch(false);
  let finish: (value: boolean) => void = () => {};
  api.launchCancel.mockImplementation(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  api.request.mockResolvedValue({
    method: "calendar.configLoad",
    value: launchConfig(),
  });
  const ui = render(content());
  await act(async () => {});
  const timing = screen.getByRole("button", { name: "Lanzar a las 20:00" });
  fireEvent.click(
    screen.getByRole("button", { name: "Cancelar lanzamiento puntual" }),
  );
  api.hideLaunch = true;
  ui.rerender(content());
  expect(timing.isConnected).toBe(false);
  await act(async () => finish(true));
  // No tab exists in this isolated chrome fixture either. The request must be
  // consumed, rather than stealing focus when a new timing button mounts later.
  const sentinel = document.createElement("button");
  document.body.append(sentinel);
  sentinel.focus();
  api.hideLaunch = false;
  ui.rerender(content());
  expect(document.activeElement).toBe(sentinel);
  sentinel.remove();
});

it("a new installation can use Windows alerts without an off-in-General warning", async () => {
  expect(freshSettings.general.toasts).toBe(defaultWindowsNotifications);
  expect(defaultWindowsNotifications).toBe(true);
  api.toasts = freshSettings.general.toasts;
  api.request.mockResolvedValue({method:"calendar.configLoad",value:{utc:true,prefsRevision:"a".repeat(64),following:[],followingRevision:"b".repeat(64),alerts:{...calendarDefaultAlerts,bands:[],slots:[]},alertsRevision:"c".repeat(64),documents:{prefs:"ready",following:"ready",alerts:"ready"}}});
  render(content());
  await act(async () => {});
  fireEvent.click(screen.getByRole("button",{name:"Avisos"}));
  await act(async () => {});
  expect(screen.queryByText(text.windowsDisabled)).toBeNull();
  expect(screen.getByRole("checkbox",{name:text.windows}).getAttribute("aria-disabled")).not.toBe("true");
  expect(api.noticeAllowed).toHaveBeenLastCalledWith(true);
});
