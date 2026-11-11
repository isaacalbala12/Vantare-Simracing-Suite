// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fixture from "../fixtures/calendar-demo.json";
import type { CalendarView } from "../src/contract/generated/calendar";
import CalendarEntry from "../src/renderer/screens/calendar/entry";
import { clock } from "../src/renderer/ui/calendarDate";
import { TooltipProvider } from "../src/renderer/ui/Layers";

const model = vi.hoisted(() => ({
  view: undefined as CalendarView | undefined,
  now: 0,
  failure: undefined as string | undefined,
  reload: vi.fn(),
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
    onTabChange,
  }: {
    tabs: { id: string; etiqueta: string }[];
    onTabChange: (id: string) => void;
  }) => (
    <nav>
      {tabs.map((t) => (
        <button type="button" key={t.id} onClick={() => onTabChange(t.id)}>
          {t.etiqueta}
        </button>
      ))}
    </nav>
  ),
  SectionPanel: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../src/renderer/ui/CalendarFrame", () => ({
  CalendarFrame: ({ children }: { children: ReactNode }) => children,
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
  model.reload.mockClear();
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
