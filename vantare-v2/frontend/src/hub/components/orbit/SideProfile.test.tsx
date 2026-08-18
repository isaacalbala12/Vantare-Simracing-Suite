import { describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { SideProfile } from "./SideProfile";
import type { ProfileEntry } from "../../state/overlay-workbench";

const labels = {
  title: "Perfil de overlay",
  stopped: "Detenido",
  live: "En directo",
  widgets: "{{n}} widgets",
  active: "Activo",
  recommended: "Recomendado",
  empty: "Sin perfiles todavía",
};

const profile = (id: string, name: string): ProfileEntry => ({
  id,
  file: `${id}.json`,
  name,
  displayMode: "general",
  widgets: 3,
});

function renderBlock(overrides: Partial<Parameters<typeof SideProfile>[0]> = {}) {
  cleanup();
  render(
    <SideProfile
      active={null}
      labels={labels}
      onActivate={vi.fn()}
      onOpenStudio={vi.fn()}
      onToggleOverlay={vi.fn()}
      recommended={null}
      running={false}
      {...overrides}
    />,
  );
  return screen.getByTestId("orbit-side-profile");
}

describe("SideProfile", () => {
  it("dice «sin perfiles» solo cuando no hay ni activo ni recomendado", () => {
    const list = renderBlock();
    expect(within(list).getByText("Sin perfiles todavía")).toBeTruthy();
  });

  it("no se contradice: con un recomendado en la lista no dice «sin perfiles»", () => {
    const list = renderBlock({ recommended: profile("rec", "Vantare Endurance") });
    expect(within(list).queryByText("Sin perfiles todavía")).toBeNull();
    expect(within(list).getByText("Vantare Endurance")).toBeTruthy();
  });

  it("con perfil activo pinta su fila y el conmutador del overlay", () => {
    const list = renderBlock({ active: profile("mine", "Mi overlay") });
    expect(within(list).queryByText("Sin perfiles todavía")).toBeNull();
    expect(within(list).getByText("Mi overlay")).toBeTruthy();
    expect(within(list).getByTestId("orbit-side-profile-toggle")).toBeTruthy();
  });
});
