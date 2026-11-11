// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import alerts from "../fixtures/calendar-alerts-reference.json";
import type { CalendarAlerts } from "../src/contract/generated/calendar";
import { calendarReference } from "../src/mock/calendar-reference";
import { calendarText as text } from "../src/renderer/i18n/calendar";
import { CalendarRail } from "../src/renderer/ui/CalendarRail";

afterEach(cleanup);
it("shows the upcoming slot and band alerts and routes UTC, export and alert actions", () => {
  const view = calendarReference(),
    utc = vi.fn(),
    exportFile = vi.fn(),
    configure = vi.fn();
  render(
    <CalendarRail
      view={view}
      schedule={view.official}
      health="ok"
      now={Date.parse("2026-10-08T17:47:13Z")}
      alerts={alerts as CalendarAlerts}
      limit={1000}
      nextPublication={Date.parse("2026-10-12T08:00:00Z")}
      onUtc={utc}
      onAlerts={configure}
      onExport={exportFile}
    />,
  );
  expect(screen.getByText("LMGT3 Fixed")).toBeTruthy();
  expect(screen.getByText("WEC Weekly")).toBeTruthy();
  expect(screen.getByText("10 Hours of Road Atlanta")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: text.utc }));
  expect(utc).toHaveBeenCalledWith(true);
  fireEvent.click(screen.getByRole("button", { name: text.configure }));
  expect(configure).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: text.google }));
  expect(exportFile).toHaveBeenCalledOnce();
});
