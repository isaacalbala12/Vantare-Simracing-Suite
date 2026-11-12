// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import fixture from "../fixtures/calendar-demo.json";
import {
  type CalendarConfigView,
  calendarDefaultAlerts,
} from "../src/contract/generated/calendar";
import { SectionChromeProvider } from "../src/renderer/app/SectionChrome";
import { calendarAlertsText as text } from "../src/renderer/i18n/calendarAlerts";
import CalendarEntry from "../src/renderer/screens/calendar/entry";
import { TooltipProvider } from "../src/renderer/ui/Layers";

const api = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../src/renderer/app/Host", () => ({
  useHost: () => ({ client: api, hello: { demo: false } }),
}));
vi.mock("../src/renderer/screens/calendar/CalendarState", () => ({
  useCalendar: () => ({
    allowed: true,
    connected: true,
    loaded: true,
    busy: false,
    now: Date.parse(fixture.validFrom) + 12 * 3600000,
    view: {
      official: fixture,
      fallback: null,
      previous: null,
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
  }: {
    onSerie: (id: string) => void;
    onDetail: (id: string) => void;
  }) => (
    <>
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
