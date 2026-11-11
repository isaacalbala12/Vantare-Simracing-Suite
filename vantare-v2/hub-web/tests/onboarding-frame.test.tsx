// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  type FrameProps,
  OnboardingFrame,
} from "../src/renderer/ui/onboarding/Frame";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function props(overrides: Partial<FrameProps> = {}): FrameProps {
  return {
    step: 0,
    message: "Preparado",
    children: null,
    art: null,
    canContinue: true,
    reducedMotion: true,
    back: vi.fn(),
    next: vi.fn(),
    skip: vi.fn(),
    ...overrides,
  };
}
it("advances with Enter from the frame, ignores editable controls, and removes its listener", () => {
  const p = props({ children: <input aria-label="Nombre" /> });
  const view = render(<OnboardingFrame {...p} />);
  const frame = screen.getByRole("region", { name: "Configuración inicial" });
  fireEvent.keyDown(frame, { key: "Enter" });
  expect(p.next).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
  expect(p.next).toHaveBeenCalledTimes(1);
  view.unmount();
  fireEvent.keyDown(window, { key: "Enter" });
  expect(p.next).toHaveBeenCalledTimes(1);
});
it("activates the focused primary button once with Enter", async () => {
  const p = props();
  render(<OnboardingFrame {...p} />);
  screen.getByRole("button", { name: "Empezar" }).focus();
  await userEvent.setup().keyboard("{Enter}");
  expect(p.next).toHaveBeenCalledTimes(1);
});
it.each([{ pending: true }, { loading: true }, { canContinue: false }])(
  "blocks advancement while unavailable: %j",
  (state) => {
    const p = props(state);
    render(<OnboardingFrame {...p} />);
    const frame = screen.getByRole("region", { name: "Configuración inicial" });
    fireEvent.keyDown(frame, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Empezar" }));
    expect(p.next).not.toHaveBeenCalled();
  },
);
it("allows Escape only after the first step and while no write is pending", () => {
  const p = props();
  const view = render(<OnboardingFrame {...p} />);
  const frame = screen.getByRole("region", { name: "Configuración inicial" });
  fireEvent.keyDown(frame, { key: "Escape" });
  expect(p.back).not.toHaveBeenCalled();
  view.rerender(<OnboardingFrame {...p} step={1} />);
  fireEvent.keyDown(frame, { key: "Escape" });
  expect(p.back).toHaveBeenCalledTimes(1);
  view.rerender(<OnboardingFrame {...p} step={1} pending />);
  fireEvent.keyDown(frame, { key: "Escape" });
  expect(p.back).toHaveBeenCalledTimes(1);
});
it("shows complete assistant text with reduced motion and hides the finished primary action", () => {
  const p = props({ step: 7, message: "Todo preparado." });
  render(<OnboardingFrame {...p} />);
  expect(screen.getByText("Todo preparado.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Continuar/ })).toBeNull();
  fireEvent.keyDown(
    screen.getByRole("region", { name: "Configuración inicial" }),
    { key: "Enter" },
  );
  expect(p.next).not.toHaveBeenCalled();
});
