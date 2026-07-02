import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { CalendarReminderBanner } from "./CalendarReminderBanner";
import type { CalendarReminderPayload } from "../../calendar/calendar-types";

const baseReminder: CalendarReminderPayload = {
  eventId: "evt-1",
  title: "6h de Spa",
  track: "Spa-Francorchamps",
  minutesLeft: 15,
  startTime: "2026-07-02T20:00:00+02:00",
  registrationUrl: "",
};

describe("CalendarReminderBanner", () => {
  beforeEach(() => {
    cleanup();
  });
  it("renders title, track and minutes", () => {
    render(<CalendarReminderBanner reminder={baseReminder} onClose={vi.fn()} />);
    expect(screen.getByText("Próxima carrera")).toBeTruthy();
    expect(screen.getByText("6h de Spa")).toBeTruthy();
    expect(screen.getByText("Spa-Francorchamps")).toBeTruthy();
    expect(screen.getByText("Faltan 15 min")).toBeTruthy();
  });

  it("does not render Abrir registro when registrationUrl is empty", () => {
    render(<CalendarReminderBanner reminder={baseReminder} onClose={vi.fn()} />);
    expect(screen.queryByText("Abrir registro")).toBeNull();
  });

  it("renders Abrir registro when registrationUrl is present", () => {
    const withUrl: CalendarReminderPayload = {
      ...baseReminder,
      registrationUrl: "https://example.com/register",
    };
    render(<CalendarReminderBanner reminder={withUrl} onClose={vi.fn()} />);
    expect(screen.getByText("Abrir registro")).toBeTruthy();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(<CalendarReminderBanner reminder={baseReminder} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Cerrar recordatorio"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders without track when track is empty", () => {
    const noTrack: CalendarReminderPayload = {
      ...baseReminder,
      track: "",
    };
    render(<CalendarReminderBanner reminder={noTrack} onClose={vi.fn()} />);
    expect(screen.getByText("Próxima carrera")).toBeTruthy();
    expect(screen.getByText("6h de Spa")).toBeTruthy();
    expect(screen.queryByText("Spa-Francorchamps")).toBeNull();
  });

  it("has role alert for screen reader announcement", () => {
    render(<CalendarReminderBanner reminder={baseReminder} onClose={vi.fn()} />);
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
