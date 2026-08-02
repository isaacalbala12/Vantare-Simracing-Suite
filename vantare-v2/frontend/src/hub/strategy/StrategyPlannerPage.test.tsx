import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StrategyPlannerPage } from "./StrategyPlannerPage";

afterEach(cleanup);

describe("Strategy Planner shell", () => {
  it("exposes the complete gallery to workspace flow without claiming live data", () => {
    render(<StrategyPlannerPage demo />);

    expect(screen.getByRole("heading", { name: "Mis planes" })).toBeTruthy();
    expect(screen.getByText("Datos de ejemplo · sin telemetría live")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Crear plan" }));
    expect(screen.getByRole("heading", { name: "Entrada de carrera" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Continuar a revisión/ }));
    expect(screen.getByRole("heading", { name: "Revisar datos" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Crear workspace/ }));
    expect(screen.getByRole("heading", { name: "Plan de carrera" })).toBeTruthy();
    expect(screen.getByTestId("strategy-column-plans")).toBeTruthy();
    expect(screen.getByTestId("strategy-column-stints")).toBeTruthy();
    expect(screen.getByTestId("strategy-column-inventory")).toBeTruthy();
  });

  it("traps comparison focus, isolates the background and restores the opener", async () => {
    render(<StrategyPlannerPage demo initialScreen="workspace" />);

    const opener = screen.getByRole("button", { name: "Comparar planes" });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole("dialog", { name: "Comparar estrategias" })).toBeTruthy();
    const close = screen.getByRole("button", { name: "Cerrar comparación" });
    expect(document.activeElement).toBe(close);
    expect(document.querySelector(".strategy-planner__background")?.hasAttribute("inert")).toBe(true);
    expect(document.querySelector(".strategy-planner__background")?.getAttribute("aria-hidden")).toBe("true");

    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Comparar estrategias" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(opener));

    fireEvent.click(screen.getByRole("button", { name: "Guardar plan" }));
    expect(screen.getByRole("status").textContent).toContain("esta sesión de demostración");
  });

  it("labels wide panels without referring to hidden responsive controls", () => {
    render(<StrategyPlannerPage demo initialScreen="workspace" />);

    expect(screen.getByRole("complementary", { name: "Estrategias" })).toBeTruthy();
    expect(screen.getByRole("main", { name: "Stints" })).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Inventario" })).toBeTruthy();
    expect(document.querySelector("[role=tabpanel]")).toBeNull();
    expect(document.querySelector("[aria-labelledby^=strategy-tab]")).toBeNull();
  });

  it("renders a complete 78-lap plan and coherent metrics for every strategy", () => {
    render(<StrategyPlannerPage demo initialScreen="workspace" />);

    const stints = screen.getAllByTestId(/^strategy-stint-/);
    expect(stints).toHaveLength(4);
    expect(stints.reduce((total, stint) => total + Number(stint.getAttribute("data-laps")), 0)).toBe(78);
    expect(within(stints[3]).getByText("v.59–78 · 20v")).toBeTruthy();

    const expectations = [
      { label: "A", compounds: ["M", "H", "H", "S"], usage: "1M · 2H · 1S", time: "6h 04m 12.0s", fuelSave: "+1.0 v/stint" },
      { label: "B", compounds: ["S", "M", "S", "S"], usage: "3S · 1M", time: "6h 04m 15.2s", fuelSave: "+3.0 v/stint" },
      { label: "C", compounds: ["H", "H", "H", "M"], usage: "3H · 1M", time: "6h 04m 17.9s", fuelSave: "0 v/stint" },
    ];

    for (const expected of expectations) {
      const option = screen.getByTestId(`strategy-option-${expected.label}`);
      const compounds = Array.from(option.querySelectorAll<HTMLElement>("[data-compound]"), (chip) => chip.dataset.compound);
      expect(compounds).toEqual(expected.compounds);
      expect(within(option).getByTestId("strategy-option-usage").textContent).toBe(expected.usage);
      expect(definitionValue(option, "Tiempo")).toBe(expected.time);
      expect(definitionValue(option, "Pits")).toBe("3");
      expect(definitionValue(option, "Ahorro")).toBe(expected.fuelSave);
    }
    expect(screen.getByTestId("strategy-active-fuel-save").textContent).toBe("+1.0 v");
  });

  it("supports keyboard navigation between compact workspace panels", () => {
    render(<StrategyPlannerPage demo initialScreen="workspace" />);

    const tab = screen.getByRole("button", { name: "Stints" });
    tab.focus();
    fireEvent.keyDown(tab, { key: "ArrowRight" });
    expect(screen.getByRole("button", { name: "Inventario" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(screen.getByRole("button", { name: "Inventario" }), { key: "Home" });
    expect(screen.getByRole("button", { name: "Estrategias" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("returns from the workspace to the editable inputs", () => {
    render(<StrategyPlannerPage demo initialScreen="workspace" />);
    fireEvent.click(screen.getByRole("button", { name: "Editar datos" }));
    expect(screen.getByRole("heading", { name: "Entrada de carrera" })).toBeTruthy();
  });

  it("renders explicit loading, empty and error gallery states", () => {
    const { rerender } = render(<StrategyPlannerPage demo galleryState="loading" />);
    expect(screen.getByRole("status").textContent).toContain("Cargando planes");

    rerender(<StrategyPlannerPage galleryState="empty" />);
    expect(screen.getByText("Todavía no tienes planes guardados")).toBeTruthy();

    rerender(<StrategyPlannerPage galleryState="error" />);
    expect(screen.getByRole("alert").textContent).toContain("No se pudo abrir la galería");
  });
});

function definitionValue(container: HTMLElement, term: string) {
  const dt = within(container).getByText(term, { selector: "dt" });
  return dt.parentElement?.querySelector("dd")?.textContent ?? "";
}
