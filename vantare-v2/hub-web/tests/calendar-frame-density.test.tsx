// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { calendarText as text } from "../src/renderer/i18n/calendar";
import { CalendarFrame } from "../src/renderer/ui/CalendarFrame";

afterEach(cleanup);
it("keeps full accessible action names when compact captions are hidden", () => {
  const alerts = vi.fn(),
    exported = vi.fn();
  render(
    <CalendarFrame
      subtitle="Subtítulo completo"
      count={3}
      busy={false}
      onAlerts={alerts}
      onExport={exported}
      onRefresh={() => {}}
    >
      <div>Contenido</div>
    </CalendarFrame>,
  );
  const alert = screen.getByRole("button", { name: text.alerts });
  expect(
    document.getElementById(alert.getAttribute("aria-describedby") ?? "")
      ?.textContent,
  ).toBe("3");
  fireEvent.click(alert);
  fireEvent.click(screen.getByRole("button", { name: text.export }));
  expect(alerts).toHaveBeenCalledOnce();
  expect(exported).toHaveBeenCalledOnce();
  expect(screen.getByTitle("Subtítulo completo")).toBeTruthy();
});
it("preserves unavailable action guards", () => {
  render(
    <CalendarFrame
      subtitle="Calendario"
      count={0}
      busy={false}
      onRefresh={() => {}}
    >
      <div />
    </CalendarFrame>,
  );
  expect(
    screen.getByRole("button", { name: text.alerts }).hasAttribute("disabled"),
  ).toBe(true);
  expect(
    screen.getByRole("button", { name: text.export }).hasAttribute("disabled"),
  ).toBe(true);
});
