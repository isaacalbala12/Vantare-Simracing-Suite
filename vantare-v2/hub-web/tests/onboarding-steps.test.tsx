// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import settings from "../fixtures/settings-base.json";
import type {
  AppearanceSettings,
  PerformanceLevel,
  SettingsPatch,
} from "../src/contract/generated/contract";
import { AccountStep } from "../src/renderer/ui/onboarding/AccountStep";
import {
  AppearanceArt,
  AppearanceStep,
} from "../src/renderer/ui/onboarding/AppearanceStep";
import { PerformanceStep } from "../src/renderer/ui/onboarding/PerformanceStep";
import { PerformanceLevels } from "../src/renderer/ui/PerformanceLevels";

function PerformanceExample() {
  const [automatic, setAutomatic] = useState(true);
  const [level, setLevel] = useState<PerformanceLevel>("balanced");
  return (
    <PerformanceStep
      equipment={{ cpu: null, cores: null, ramGb: null }}
      automatic={automatic}
      level={level}
      onLevel={(next) => {
        setAutomatic(false);
        setLevel(next);
      }}
      onAutomatic={() => {
        setAutomatic(true);
        setLevel("balanced");
      }}
    />
  );
}
function AppearanceExample({
  update,
}: {
  update: (patch: SettingsPatch) => void;
}) {
  const [appearance, setAppearance] = useState(
    settings.appearance as AppearanceSettings,
  );
  function change(patch: SettingsPatch) {
    update(patch);
    if (patch.field === "palette" || patch.field === "scheme")
      setAppearance((current) => ({
        ...current,
        [patch.field]: patch.value,
      }));
  }
  return (
    <>
      <AppearanceStep
        appearance={appearance}
        disabled={false}
        pending={false}
        update={change}
      />
      <AppearanceArt appearance={appearance} />
    </>
  );
}
beforeEach(() =>
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })),
);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("keeps automatic separate from a fixed level and can return to it", () => {
  render(<PerformanceExample />);
  expect(screen.getByText("CPU no disponible")).toBeTruthy();
  expect(screen.getByText("RAM no disponible")).toBeTruthy();
  expect(
    screen
      .getAllByRole("radio")
      .some((radio) => radio.getAttribute("aria-checked") === "true"),
  ).toBe(false);
  fireEvent.click(screen.getByRole("radio", { name: "Ahorro" }));
  expect(
    screen.getByRole("radio", { name: "Ahorro" }).getAttribute("aria-checked"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: /Automático/ }));
  expect(
    screen
      .getAllByRole("radio")
      .some((radio) => radio.getAttribute("aria-checked") === "true"),
  ).toBe(false);
});
it("preserves the settings selector and its Studio action", () => {
  const studio = vi.fn();
  render(
    <PerformanceLevels
      value="balanced"
      pending={false}
      disabled={false}
      onChange={() => {}}
      onStudio={studio}
    />,
  );
  expect(screen.getAllByRole("radio")).toHaveLength(5);
  expect(screen.getByText("Automático")).toBeTruthy();
  const custom = screen.getByRole("button");
  fireEvent.click(custom);
  expect(studio).toHaveBeenCalledOnce();
});
it("reuses appearance selectors and immediately reflects palette and scheme props", () => {
  const update = vi.fn();

  render(<AppearanceExample update={update} />);
  fireEvent.click(screen.getByRole("radio", { name: "Vantare clásico" }));
  expect(update).toHaveBeenLastCalledWith({
    field: "palette",
    value: "classic",
  });
  fireEvent.click(screen.getByRole("button", { name: "Claro" }));
  expect(update).toHaveBeenLastCalledWith({ field: "scheme", value: "light" });
  expect(
    screen.getByText("VISTA PREVIA · VANTARE CLÁSICO · CLARO"),
  ).toBeTruthy();
});
it("keeps account status behind props without adding a login action", () => {
  const view = render(<AccountStep />);
  expect(screen.getByRole("status").textContent).toContain(
    "Puedes continuar sin cuenta",
  );
  expect(screen.queryByRole("button")).toBeNull();
  view.rerender(
    <AccountStep value={{ signedIn: true, checking: false, blocked: true }} />,
  );
  expect(screen.getByRole("status").textContent).toBe("Acceso bloqueado");
});
