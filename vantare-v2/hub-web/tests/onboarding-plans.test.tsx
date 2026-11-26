// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { launchLastDay } from "../src/renderer/ui/onboarding/launch-offer";
import { PlansArt } from "../src/renderer/ui/onboarding/PlansArt";

afterEach(cleanup);

// La fecha y el reloj se fijan aquí: alargar la oferta no rompe estos tests.
function renderAt(instant: string, lastDay = "2026-11-26") {
  cleanup();
  return render(
    <PlansArt
      onPrices={() => {}}
      now={() => new Date(instant)}
      lastDay={lastDay}
    />,
  );
}
const banner = () => screen.queryByText("PRECIO DE LANZAMIENTO");
const planButtons = () =>
  screen.getAllByRole("button").map((button) => button.textContent);

it("shows the launch banner with its date before the deadline", () => {
  renderAt("2026-11-20T12:00:00+01:00");
  expect(banner()).toBeTruthy();
  expect(screen.getByText("HASTA EL 26 NOV")).toBeTruthy();
});

it("removes the whole banner after the deadline and keeps the plans", () => {
  renderAt("2026-11-26T12:00:00+01:00");
  const before = planButtons();
  const { container } = renderAt("2026-11-27T00:00:01+01:00");
  expect(banner()).toBeNull();
  expect(screen.queryByText(/HASTA EL/)).toBeNull();
  expect(container.querySelector(".v-ob-plans-heading")).toBeNull();
  expect(planButtons()).toEqual(before);
  // Sin el título del banner, los planes suben un nivel: no se salta ninguno.
  expect(
    screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
  ).toEqual(["PRO", "PRO PLUS"]);
});

it.each([
  ["2026-11-26", "2026-11-26T22:59:59Z", "2026-11-26T23:00:00Z", "26 NOV"],
  ["2027-04-10", "2027-04-10T21:59:59Z", "2027-04-10T22:00:00Z", "10 ABR"],
])("ends %s at midnight in Spain, winter or summer time", (...limit) => {
  const [lastDay, lastSecond, nextDay, label] = limit;
  renderAt(lastSecond, lastDay);
  expect(screen.getByText(`HASTA EL ${label}`)).toBeTruthy();
  renderAt(nextDay, lastDay);
  expect(banner()).toBeNull();
});

it("keeps the configured deadline a real YYYY-MM-DD day", () => {
  expect(new Date(launchLastDay).toISOString().slice(0, 10)).toBe(
    launchLastDay,
  );
});
