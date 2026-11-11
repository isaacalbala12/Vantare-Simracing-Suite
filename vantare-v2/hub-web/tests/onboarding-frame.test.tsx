// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  SimulatorChoices,
  StyleChoices,
} from "../src/renderer/ui/onboarding/Choices";
import {
  type FrameProps,
  OnboardingFrame,
  type OnboardingStep,
} from "../src/renderer/ui/onboarding/Frame";

import {
  canAdvance,
  onboardingMotion,
} from "../src/renderer/ui/onboarding/navigation";

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
it("keeps the summary primary hidden but forwards Enter to its explicit finish handler", () => {
  const p = props({ step: 7, message: "Todo preparado." });
  render(<OnboardingFrame {...p} />);
  expect(screen.getByText("Todo preparado.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Continuar/ })).toBeNull();
  fireEvent.keyDown(
    screen.getByRole("region", { name: "Configuración inicial" }),
    { key: "Enter" },
  );
  expect(p.next).toHaveBeenCalledTimes(1);
});

function Harness() {
  const [selected, setSelected] = useState<[boolean, boolean]>([true, false]);
  return (
    <SimulatorChoices
      selected={selected}
      found={[true, false]}
      toggle={(id) =>
        setSelected(
          (previous) =>
            previous.map((value, index) => (index === id ? !value : value)) as [
              boolean,
              boolean,
            ],
        )
      }
    />
  );
}

it("lets the user select an undetected simulator without replacing the detected one", async () => {
  render(<Harness />);
  const lmu = screen.getByRole("button", { name: "Le Mans Ultimate" });
  const acc = screen.getByRole("button", {
    name: "Assetto Corsa Competizione",
  });
  expect(lmu.getAttribute("aria-pressed")).toBe("true");
  expect(acc.getAttribute("aria-pressed")).toBe("false");
  await userEvent.setup().click(acc);
  expect(acc.getAttribute("aria-pressed")).toBe("true");
  expect(lmu.getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText("NO ENCONTRADO")).toBeTruthy();
});
it("keeps independent style selections and blocks changes while saving", async () => {
  const toggle = vi.fn();
  const view = render(
    <StyleChoices selected={[true, false, true, false]} toggle={toggle} />,
  );
  expect(
    screen
      .getByRole("button", { name: "Carreras online" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(
    screen
      .getByRole("button", { name: "Resistencia" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Streaming" }));
  expect(toggle).toHaveBeenCalledExactlyOnceWith(3);
  view.rerender(
    <StyleChoices
      selected={[true, false, true, false]}
      disabled
      toggle={toggle}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Ligas" }));
  expect(toggle).toHaveBeenCalledTimes(1);
});

function FlowHarness() {
  const [step, setStep] = useState<OnboardingStep>(0);
  const [simulators, setSimulators] = useState<[boolean, boolean]>([
    true,
    false,
  ]);
  const [styles, setStyles] = useState<[boolean, boolean, boolean, boolean]>([
    true,
    false,
    false,
    false,
  ]);
  const allowed = canAdvance(step, simulators, styles);
  function move(action: "next" | "back" | "skip") {
    const result = onboardingMotion(action, step, allowed);
    if (result.kind === "page") setStep(result.step);
  }
  return (
    <OnboardingFrame
      {...props()}
      step={step}
      canContinue={allowed}
      next={() => move("next")}
      back={() => move("back")}
      skip={() => move("skip")}
    >
      {step === 1 && (
        <SimulatorChoices
          found={[true, false]}
          selected={simulators}
          toggle={(id) =>
            setSimulators((previous) => {
              const next: [boolean, boolean] = [...previous];
              next[id] = !next[id];
              return next;
            })
          }
        />
      )}
      {step === 2 && (
        <StyleChoices
          selected={styles}
          toggle={(id) =>
            setStyles((previous) => {
              const next: [boolean, boolean, boolean, boolean] = [...previous];
              next[id] = !next[id];
              return next;
            })
          }
        />
      )}
    </OnboardingFrame>
  );
}
it("blocks the real first steps until the user selects a simulator and a style", async () => {
  const user = userEvent.setup();
  render(<FlowHarness />);
  expect(screen.queryByRole("button", { name: "← Atrás" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Empezar" }));
  await user.click(screen.getByRole("button", { name: "Le Mans Ultimate" }));
  expect(
    (screen.getByRole("button", { name: "Continuar" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.keyDown(screen.getByRole("region"), { key: "Enter" });
  expect(screen.getByRole("heading", { name: "¿A QUÉ CORRES?" })).toBeTruthy();
  await user.click(
    screen.getByRole("button", { name: "Assetto Corsa Competizione" }),
  );
  await user.click(screen.getByRole("button", { name: "Continuar" }));
  await user.click(screen.getByRole("button", { name: "Carreras online" }));
  expect(
    (screen.getByRole("button", { name: "Continuar" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "Ligas" }));
  await user.click(screen.getByRole("button", { name: "Continuar" }));
  expect(screen.getByRole("heading", { name: /GUARDA TU/ })).toBeTruthy();
});
it("skips to privacy and restores the previous step with Escape", async () => {
  const user = userEvent.setup();
  render(<FlowHarness />);
  await user.click(screen.getByRole("button", { name: "Saltar" }));
  expect(screen.getByRole("heading", { name: "TÚ DECIDES." })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Saltar" })).toBeNull();
  fireEvent.keyDown(screen.getByRole("region"), { key: "Escape" });
  expect(screen.getByRole("heading", { name: "A TU GUSTO." })).toBeTruthy();
});
