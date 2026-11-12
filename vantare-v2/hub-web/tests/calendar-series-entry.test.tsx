// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fixture from "../fixtures/calendar-demo.json";
import type { CalendarView } from "../src/contract/generated/calendar";
import { calendarDefaultAlerts } from "../src/contract/generated/calendar";
import CalendarEntry from "../src/renderer/screens/calendar/entry";
import { clock } from "../src/renderer/ui/calendarDate";
import { TooltipProvider } from "../src/renderer/ui/Layers";

const model = vi.hoisted(() => ({
  view: undefined as CalendarView | undefined,
  now: 0,
  failure: undefined as string | undefined,
  preferenceFailure: undefined as
    | "coreUnavailable"
    | "calendarConflict"
    | "calendarScheduleUnavailable"
    | undefined,
  preferenceIntent: undefined as "utc" | "alerts" | undefined,
  discard: vi.fn(),
  reload: vi.fn(),
  alertsState: "ready" as "ready" | "protected" | "unavailable",
  canAlerts: true,
  alert: vi.fn(),
  band: vi.fn(),
}));
vi.mock("../src/renderer/app/Host", () => ({
  useHost: () => ({ hello: { demo: false } }),
}));
vi.mock("../src/renderer/screens/calendar/CalendarState", () => ({
  useCalendar: () => ({
    view: model.view,
    now: model.now,
    allowed: true,
    connected: true,
    loaded: true,
    busy: false,
    refresh: vi.fn(),
  }),
}));
vi.mock("../src/renderer/screens/calendar/CalendarPreferences", () => ({
  useCalendarPreferences: () => ({
    canFollow: true,
    canUtc: true,
    canAlerts: model.canAlerts,
    failure: model.preferenceFailure,
    failureIntent: model.preferenceIntent,
    canRetry: false,
    retry: vi.fn(),
    discard: model.discard,
    config: {
      documents: { alerts: model.alertsState },
      alerts: calendarDefaultAlerts,
      following: [],
      utc: true,
    },
    alert: model.alert,
    band: model.band,
    follow: vi.fn(),
    utc: vi.fn(),
  }),
}));
vi.mock("../src/renderer/screens/calendar/CalendarLauncher", () => ({
  useCalendarLauncher: () => ({
    canLaunch: true,
    profile: { name: "QA" },
    launch: vi.fn(),
  }),
}));
vi.mock("../src/renderer/screens/calendar/CalendarQARuns", () => ({
  useCalendarQARuns: () => [],
}));
vi.mock("../src/renderer/screens/calendar/CalendarHistory", () => ({
  useCalendarHistory: () => ({ failure: model.failure, reload: model.reload }),
}));
vi.mock("../src/renderer/app/SectionChrome", () => ({
  SectionChrome: ({
    tabs,
    activeTab,
    onTabChange,
  }: {
    tabs: { id: string; etiqueta: string }[];
    activeTab: string;
    onTabChange: (id: string) => void;
  }) => (
    <nav>
      {tabs.map((t) => (
        <button
          type="button"
          data-test-tab={t.id === activeTab}
          key={t.id}
          onClick={() => onTabChange(t.id)}
        >
          {t.etiqueta}
        </button>
      ))}
    </nav>
  ),
  SectionPanel: ({ children }: { children: ReactNode }) => children,
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
vi.mock("../src/renderer/ui/CalendarRail", () => ({
  CalendarRail: () => null,
}));
vi.mock("../src/renderer/ui/CalendarLiveView", () => ({
  CalendarLiveView: ({
    onSerie,
    onDetail,
  }: {
    onSerie: (id: string) => void;
    onDetail?: (id: string) => void;
  }) => (
    <>
      <button
        type="button"
        data-calendar-series={fixture.series[0].id}
        onClick={() => onSerie(fixture.series[0].id)}
      >
        Open daily
      </button>
      <button type="button" onClick={() => onDetail?.(fixture.series[0].id)}>
        Ficha
      </button>
    </>
  ),
}));
vi.mock("../src/renderer/ui/CalendarEventsView", () => ({
  CalendarEventsView: ({ onSerie }: { onSerie: (id: string) => void }) => (
    <button
      type="button"
      data-calendar-series={fixture.series[0].id}
      onClick={() => onSerie(fixture.series[0].id)}
    >
      Open event
    </button>
  ),
}));
beforeEach(() => {
  const from = Date.parse(fixture.validFrom);
  model.now = from + 12 * 3600_000;
  model.view = {
    official: fixture,
    fallback: null,
    previous: null,
    following: [],
    utc: true,
    checked: (from + 10 * 3600_000) / 1000,
    updated: (from + 9 * 3600_000) / 1000,
    invalidCache: false,
  };
  model.failure = undefined;
  model.preferenceFailure = undefined;
  model.preferenceIntent = undefined;
  model.discard.mockClear();
  model.reload.mockClear();
  model.alert.mockClear();
  model.band.mockClear();
  model.canAlerts = true;
  model.alertsState = "ready";
});
afterEach(cleanup);
it("uses the last checked stamp and restores focus to the source series on return", () => {
  render(<CalendarEntry />);
  fireEvent.click(screen.getByRole("button", { name: "Open daily" }));
  expect(document.activeElement).toBe(
    screen.getByRole("heading", { name: fixture.series[0].name }),
  );
  expect(
    screen.getByText(
      new RegExp(
        `actualizado hoy ${clock((model.view?.checked ?? 0) * 1000, true)}`,
      ),
    ),
  ).toBeTruthy();
  fireEvent.click(
    screen.getAllByRole("button", { name: "Próximas" }).at(-1) as HTMLElement,
  );
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Open daily" }),
  );
});
it("returns to Events without its count and routes the missing-series fallback to Upcoming", () => {
  const result = render(<CalendarEntry />);
  fireEvent.click(screen.getByRole("button", { name: /Eventos/u }));
  fireEvent.click(screen.getByRole("button", { name: "Open event" }));
  expect(screen.getByRole("button", { name: "Eventos" })).toBeTruthy();
  model.view = {
    ...(model.view as CalendarView),
    official: { ...fixture, series: fixture.series.slice(1) },
  };
  result.rerender(<CalendarEntry />);
  fireEvent.click(screen.getByRole("button", { name: "Volver" }));
  expect(screen.getByRole("button", { name: "Open daily" })).toBeTruthy();
});
it("shows a history failure with an explicit retry inside the series page", () => {
  model.failure = "busy";
  render(<CalendarEntry />);
  fireEvent.click(screen.getByRole("button", { name: "Open daily" }));
  expect(screen.getByRole("alert")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(model.reload).toHaveBeenCalledOnce();
});

it("navigates from the real drawer to its series and gives focus to the title", () => {
  render(
    <TooltipProvider>
      <CalendarEntry />
    </TooltipProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Ficha" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Ver serie" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(
    screen.getByRole("heading", { name: fixture.series[0].name }),
  );
});

it("clears the drawer on schedule expiry and never reopens it when a new publication arrives", async () => {
  const content = () => (
    <TooltipProvider>
      <button type="button" role="tab" aria-selected="true">
        Calendar fallback
      </button>
      <CalendarEntry />
    </TooltipProvider>
  );
  const result = render(content());
  const trigger = screen.getByRole("button", { name: "Ficha" });
  trigger.focus();
  fireEvent.click(trigger);
  expect(screen.getByRole("dialog")).toBeTruthy();
  const publication = model.view;
  model.view = undefined;
  result.rerender(content());
  expect(screen.queryByRole("dialog")).toBeNull();
  await vi.waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "Calendar fallback" }),
    ),
  );
  model.view = publication;
  result.rerender(content());
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("returns from a series departure drawer to the exact departure button", async () => {
  render(
    <TooltipProvider>
      <CalendarEntry />
    </TooltipProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Open daily" }));
  const trigger = screen
    .getAllByRole("button")
    .find((node) => /^\d{2}:\d{2}$/.test(node.textContent ?? ""));
  if (!trigger) throw new Error("series departure missing");
  trigger.focus();
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole("button", { name: "Cerrar (Esc)" }));
  await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
});

it("connects the series band and global lead controls to typed alert intents", () => {
  render(<CalendarEntry />);
  fireEvent.click(screen.getByRole("button", { name: "Open daily" }));
  fireEvent.click(
    screen.getByRole("switch", { name: "Avisar por franja horaria" }),
  );
  expect(model.band).toHaveBeenCalledWith(fixture.series[0].id, {
    seriesId: fixture.series[0].id,
    from: 1200,
    to: 1380,
    days: "all",
    mode: "each",
  });
  fireEvent.click(screen.getByRole("button", { name: "15′" }));
  expect(model.alert).toHaveBeenCalledWith({ kind: "lead", value: 15 });
});
it("keeps series alert controls read-only when the document cannot be saved", () => {
  model.canAlerts = false;
  render(<CalendarEntry />);
  fireEvent.click(screen.getByRole("button", { name: "Open daily" }));
  const toggle = screen.getByRole("switch", {
    name: "Avisar por franja horaria",
  });
  expect(toggle.getAttribute("aria-disabled")).toBe("true");
  fireEvent.click(toggle);
  fireEvent.click(screen.getByRole("button", { name: "15′" }));
  expect(model.band).not.toHaveBeenCalled();
  expect(model.alert).not.toHaveBeenCalled();
});

it("connects alert edits from the actual drawer to the same typed preferences", () => {
  render(
    <TooltipProvider>
      <CalendarEntry />
    </TooltipProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Ficha" }));
  fireEvent.click(
    screen.getByRole("switch", { name: "Avisar por franja horaria" }),
  );
  expect(model.band).toHaveBeenCalledWith(fixture.series[0].id, {
    seriesId: fixture.series[0].id,
    from: 1200,
    to: 1380,
    days: "all",
    mode: "each",
  });
  fireEvent.click(screen.getByRole("button", { name: "15′" }));
  expect(model.alert).toHaveBeenCalledWith({ kind: "lead", value: 15 });
});

it("keeps unrelated UTC errors outside Avisos and explains its own conflict without a blind retry", () => {
  model.preferenceFailure = "coreUnavailable";
  model.preferenceIntent = "utc";
  const result = render(
    <TooltipProvider>
      <CalendarEntry />
    </TooltipProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Avisos" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).queryByRole("alert")).toBeNull();
  model.preferenceFailure = "calendarConflict";
  model.preferenceIntent = "alerts";
  result.rerender(
    <TooltipProvider>
      <CalendarEntry />
    </TooltipProvider>,
  );
  expect(within(dialog).getByRole("alert").textContent).toContain(
    "Se ha actualizado desde otro sitio; revisa y repite",
  );
  expect(
    within(dialog).queryByRole("button", { name: "Reintentar" }),
  ).toBeNull();
});

it("opens the ICS dialog from the real detail drawer and returns to it on cancel", async () => {
  render(
    <TooltipProvider>
      <CalendarEntry />
    </TooltipProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Ficha" }));
  const trigger = screen.getByRole("button", {
    name: "Añadir a mi calendario",
  });
  trigger.focus();
  fireEvent.click(trigger);
  expect(
    screen.getByRole("dialog", { name: "Añadir a mi calendario" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(
    screen.queryByRole("dialog", { name: "Añadir a mi calendario" }),
  ).toBeNull();
  await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
});
