// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import alerts from "../fixtures/calendar-alerts-reference.json";
import type { CalendarAlerts } from "../src/contract/generated/calendar";
import { calendarReference } from "../src/mock/calendar-reference";
import { CalendarLiveView } from "../src/renderer/ui/CalendarLiveView";

afterEach(cleanup);
it("keeps the profile visible while launch and protected favorite writes are disabled", () => {
  const value = calendarReference(),
    follow = vi.fn(),
    launch = vi.fn();
  if (!value.official) throw new Error("Missing public reference schedule");
  render(
    <CalendarLiveView
      schedule={value.official}
      alerts={alerts as CalendarAlerts}
      following={value.following}
      utc={false}
      now={Date.parse("2026-10-08T17:47:13Z")}
      limit={10000}
      profile="Carrera LMU"
      canLaunch={false}
      canFollow={false}
      onFollow={follow}
      onLaunch={launch}
    />,
  );
  const launchButton = screen.getByRole("button", {
    name: /Lanzar «Carrera LMU»/,
  });
  expect((launchButton as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(launchButton);
  const stars = screen.getAllByRole("button", { name: /^Alternar favorita:/ });
  expect(stars.length).toBeGreaterThan(0);
  for (const star of stars) {
    expect((star as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(star);
  }
  expect(follow).not.toHaveBeenCalled();
  expect(launch).not.toHaveBeenCalled();
  expect(
    (screen.getByRole("button", { name: "Ficha" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});
