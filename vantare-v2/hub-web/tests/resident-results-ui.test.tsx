// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import fixture from "../fixtures/launcher-base.json";
import type {
  LauncherView,
  ResidentRunResults,
} from "../src/contract/generated/contract";
import type { ResidentControlController } from "../src/renderer/screens/launcher/resident-control";
import { ResidentResults } from "../src/renderer/ui/launcher/ResidentResults";

afterEach(cleanup);
function setup() {
  const view = structuredClone(fixture) as LauncherView;
  view.revision = "c".repeat(64);
  view.profiles[0].apps = ["lmu", "obs", "obs"];
  const value: ResidentRunResults & { retryFailed: boolean } = {
    run: "7",
    profile: view.profiles[0].id,
    revision: view.revision,
    accountGeneration: "a".repeat(64),
    mode: "rehearsal",
    retryFailed: true,
    outcome: { kind: "failed", reason: "step-failed" },
    steps: [
      { index: 0, state: "not-selected" },
      { index: 1, state: "not-run" },
      { index: 2, state: "ready" },
    ],
  };
  const control: ResidentControlController = {
    results: { kind: "known", value },
    attempt: undefined,
    scope: { instance: "b".repeat(64), accountGeneration: "a".repeat(64) },
    capable: true,
    hasProfiles: true,
    cancelTarget: undefined,
    busy: false,
    reason: vi.fn(() => undefined),
    cancel: vi.fn(),
    rehearse: vi.fn(),
    retry: vi.fn(),
  };
  return { view, control, value };
}
it("shows each indexed final state, including duplicate applications, without treating NotRun as Ready", () => {
  const { view, control } = setup();
  render(<ResidentResults view={view} control={control} />);
  expect(screen.getByText("Paso 2 · OBS Studio")).toBeTruthy();
  expect(screen.getByText("Paso 3 · OBS Studio")).toBeTruthy();
  expect(screen.getByText("No ejecutado")).toBeTruthy();
  expect(screen.getAllByText("Listo")).toHaveLength(1);
  expect(screen.getByText("Sin seleccionar")).toBeTruthy();
});
it("submits the captured source and All scope without sending or deriving selected indices", () => {
  const { view, control, value } = setup();
  render(<ResidentResults view={view} control={control} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Repetir los mismos pasos" }),
  );
  expect(control.retry).toHaveBeenCalledExactlyOnceWith({
    instance: "b".repeat(64),
    accountGeneration: value.accountGeneration,
    run: value.run,
    profile: value.profile,
    revision: value.revision,
    scope: "all",
  });
  expect(screen.getByText(/conserva esa selección/)).toBeTruthy();
});
it.each(["unsupported", "unknown"] as const)(
  "explains %s instead of showing empty results or zero failures",
  (kind) => {
    const { view, control } = setup();
    control.results = { kind };
    render(<ResidentResults view={view} control={control} />);
    expect(screen.queryByRole("list")).toBeNull();
    expect(
      screen.getByText(
        kind === "unknown"
          ? "Resultado de la secuencia desconocido. No permite saber qué pasos fallaron."
          : "El residente actual no ofrece resultados por paso ni reintentos comprobados.",
      ),
    ).toBeTruthy();
    for (const button of screen.getAllByRole("button")) {
      expect(button.getAttribute("aria-disabled")).toBe("true");
      fireEvent.click(button);
    }
    expect(control.retry).not.toHaveBeenCalled();
  },
);
it("does not assign edited app names to an old revision", () => {
  const { view, control } = setup();
  view.revision = "e".repeat(64);
  render(<ResidentResults view={view} control={control} />);
  expect(screen.getByText("Paso 2")).toBeTruthy();
  expect(screen.queryByText(/OBS Studio/)).toBeNull();
  expect(screen.getByText(/Los nombres actuales no se atribuyen/)).toBeTruthy();
});
it("keeps retry focus and its description while an order is pending, without a second activation", () => {
  const { view, control } = setup();
  const ui = render(<ResidentResults view={view} control={control} />);
  const button = screen.getByRole("button", { name: "Reintentar fallidos" });
  button.focus();
  fireEvent.click(button);
  control.reason = () => "busy";
  ui.rerender(<ResidentResults view={view} control={control} />);
  expect(document.activeElement).toBe(button);
  expect(button.getAttribute("aria-disabled")).toBe("true");
  expect(
    document.getElementById(button.getAttribute("aria-describedby") ?? "")
      ?.textContent,
  ).toContain("Hay una orden pendiente");
  fireEvent.click(button);
  expect(control.retry).toHaveBeenCalledTimes(1);
});
it("never enables retry before the known run has an outcome", () => {
  const { view, control, value } = setup();
  value.outcome = null;
  render(<ResidentResults view={view} control={control} />);
  expect(screen.getByText(/La secuencia sigue en curso/)).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Repetir los mismos pasos" }),
  );
  expect(control.retry).not.toHaveBeenCalled();
});
