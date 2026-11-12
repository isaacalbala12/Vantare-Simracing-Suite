// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { offline } from "../src/renderer/app/Host";
import { navigation } from "../src/renderer/app/navigation";
import {
  AnalysisEmptyLayout,
  AnalysisRailLayout,
  type AnalysisReference,
} from "../src/renderer/ui/analysis/AnalysisEmptyLayout";

afterEach(cleanup);
function Preview() {
  const [reference, setReference] = useState<AnalysisReference>("best");
  return (
    <AnalysisEmptyLayout reference={reference} onReference={setReference} />
  );
}
it("keeps unknown metrics absent and does not invent sessions, traces or import actions", () => {
  const { container } = render(<Preview />);
  expect(
    screen.getByRole("heading", { name: "Sin sesión analizada" }),
  ).toBeTruthy();
  expect(container.querySelectorAll(".v-analysis-stats strong")).toHaveLength(
    4,
  );
  expect(
    [...container.querySelectorAll(".v-analysis-stats strong")].every(
      (el) => el.textContent === "—",
    ),
  ).toBe(true);
  expect(container.querySelector("svg,canvas,input[type=file]")).toBeNull();
  expect(
    screen.queryByRole("button", { name: /abrir|importar|grabar/i }),
  ).toBeNull();
  expect(
    (screen.getByRole("button", { name: "Tiempo" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    screen.getByText("El mapa se dibuja cuando haya una vuelta grabada."),
  ).toBeTruthy();
  expect(
    screen.getByText("Las trazas se dibujan cuando haya una vuelta grabada."),
  ).toBeTruthy();
});
it("changes only the local reference choice with the existing keyboard control", async () => {
  const user = userEvent.setup();
  render(<Preview />);
  const best = screen.getByRole("button", { name: "vs mejor propia" });
  expect(best.getAttribute("aria-pressed")).toBe("true");
  await user.click(best);
  await user.keyboard("{ArrowRight}{Enter}");
  expect(
    screen
      .getByRole("button", { name: "vs mejor sesión" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(
    screen.getByRole("heading", { name: "Sin sesión analizada" }),
  ).toBeTruthy();
});
it("keeps beta navigation hidden and the rail explicitly unindexed", () => {
  expect(
    navigation({
      ...offline.access,
      verified: true,
      blocked: false,
      tester: true,
      calendar: true,
    }).some((item) => item.id === "analysis"),
  ).toBe(false);
  render(<AnalysisRailLayout />);
  expect(screen.getByText("Sin sesiones indexadas.")).toBeTruthy();
  expect(
    screen.getByText(
      "Las grabaciones de vueltas llegarán en una próxima versión.",
    ),
  ).toBeTruthy();
});
