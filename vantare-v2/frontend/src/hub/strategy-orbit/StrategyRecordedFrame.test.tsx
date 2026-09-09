import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StrategyRecordedFrame } from "./StrategyRecordedFrame";

afterEach(cleanup);

it("permite volver, bloquea pasos no alcanzados y anuncia el paso actual", () => {
  const onStep = vi.fn();
  const props = {
    steps: [{ id: "start", label: "Inicio", available: true }, { id: "combination", label: "Combinación", available: true }, { id: "rules", label: "Reglas", available: false }],
    currentStep: "combination", onStep, title: "Elige tu combinación", preservationLabel: "Originales intactos", progressLabel: "Paso 2 de 3", actions: <button>Continuar</button>, children: <p>Contenido del paso</p>,
  };
  const view = render(<StrategyRecordedFrame {...props} />);
  expect(screen.getByRole("button", { name: "Combinación" }).getAttribute("aria-current")).toBe("step");
  fireEvent.click(screen.getByRole("button", { name: "Reglas" }));
  expect(onStep).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Inicio" }));
  expect(onStep).toHaveBeenCalledWith("start");
  view.rerender(<StrategyRecordedFrame {...props} currentStep="start" title="Prepara tu carrera" />);
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Prepara tu carrera" }));
  expect(screen.getByText("Contenido del paso")).toBeTruthy();
});
