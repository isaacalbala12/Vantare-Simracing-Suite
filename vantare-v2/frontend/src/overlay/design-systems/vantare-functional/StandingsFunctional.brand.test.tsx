import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { StandingsViewModel } from "../../widget-types/standings/standings-view-model";
import { StandingsFunctional } from "./StandingsFunctional";

afterEach(cleanup);

const model: StandingsViewModel = {
  type: "standings",
  status: "ready",
  sessionLabel: "RACE",
  activeClass: "GT3",
  remainingText: "18:42",
  columns: [
    { id: "position", metricId: "position", enabled: true, widthPreset: "sm" },
    { id: "name", metricId: "driverName", enabled: true, widthPreset: "auto" },
    { id: "gap", metricId: "gap", enabled: true, widthPreset: "lg" },
  ],
  rows: [{
    id: "player",
    position: 3,
    driverNumber: "",
    driverName: "María Costa",
    vehicleClass: "GT3",
    teamCode: "",
    teamBrandColor: "",
    gapText: "+2.106s",
    intervalText: "—",
    currentLapText: "12",
    lastLapText: "1:42.318",
    bestLapText: "1:41.512",
    pitText: "",
    tireCompound: "",
    isPlayer: true,
    isLeader: false,
  }],
};

function brandNodes(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll(".vf-brand")];
}

describe("StandingsFunctional brand decision", () => {
  it("keeps the legacy header brand without an explicit decision", () => {
    const { container } = render(
      <StandingsFunctional model={model} settings={{ showSessionHeader: true }} renderMode="harness" />,
    );
    expect(container.querySelector(".vf-session")).toBeTruthy();
    expect(brandNodes(container)).toHaveLength(1);
  });

  it("mandatory brand survives a hidden header and footer in its own band", () => {
    const { container } = render(
      <StandingsFunctional
        model={model}
        settings={{
          showSessionHeader: false,
          showSessionFooter: false,
          showBrand: false,
          brandVisible: true,
        }}
        renderMode="harness"
      />,
    );
    expect(container.querySelector(".vf-session")).toBeNull();
    expect(container.querySelector(".vf-session-footer")).toBeNull();
    const band = container.querySelector(".vf-brand-band");
    expect(band).toBeTruthy();
    expect(brandNodes(container)).toHaveLength(1);
    expect(band?.textContent).toContain("VANTARE");
    // La tabla aceptada no cambia: mismas filas y columnas.
    expect(container.querySelectorAll("tbody td")).toHaveLength(model.columns.length);
  });

  it("paid opt-in shows the brand while opt-out hides it with a visible header", () => {
    const on = render(
      <StandingsFunctional
        model={model}
        settings={{ showSessionHeader: true, showBrand: true, brandVisible: true }}
        renderMode="harness"
      />,
    );
    expect(brandNodes(on.container)).toHaveLength(1);
    on.unmount();
    const off = render(
      <StandingsFunctional
        model={model}
        settings={{ showSessionHeader: true, showBrand: false, brandVisible: false }}
        renderMode="harness"
      />,
    );
    expect(containerHasHeader(off.container)).toBe(true);
    expect(brandNodes(off.container)).toHaveLength(0);
  });
});

function containerHasHeader(container: HTMLElement): boolean {
  return container.querySelector(".vf-session") !== null;
}
