import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDefaultStandingsContent,
  getEnabledStandingsColumns,
} from "../../../widget-types/standings/standings-content";
import type {
  StandingsRowViewModel,
  StandingsViewModel,
} from "../../../widget-types/standings/standings-view-model";
import { StandingsCrystal } from "./StandingsCrystal";

afterEach(() => cleanup());

function standingsRow(
  row: Pick<StandingsRowViewModel, "id" | "position" | "driverName"> &
    Partial<StandingsRowViewModel>,
): StandingsRowViewModel {
  return {
    vehicleClass: "HYPERCAR",
    driverNumber: "",
    teamCode: "",
    teamBrandColor: "",
    gapText: "+1.234",
    intervalText: "+0.456",
    currentLapText: "12",
    lastLapText: "1:31.234",
    bestLapText: "1:30.999",
    pitText: "",
    tireCompound: "",
    isPlayer: false,
    isLeader: false,
    ...row,
  };
}

const readyModel: StandingsViewModel = {
  type: "standings",
  status: "ready",
  activeClass: "HYPERCAR",
  sessionLabel: "RACE",
  remainingText: "—",
  columns: getEnabledStandingsColumns(createDefaultStandingsContent()),
  rows: [standingsRow({ id: "1", position: 1, driverName: "Leader", isLeader: true })],
};

function brandNodes(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll("[data-crystal-primitive='brand']")];
}

describe("StandingsCrystal brand decision", () => {
  it("keeps the legacy header brand without an explicit decision", () => {
    const { container } = render(
      <StandingsCrystal model={readyModel} settings={{ showSessionHeader: true }} renderMode="harness" />,
    );
    expect(container.querySelector(".vc-standings-header")).toBeTruthy();
    expect(brandNodes(container)).toHaveLength(2);
    expect(container.querySelector(".vc-brand-band")).toBeNull();
  });

  it("mandatory brand survives a hidden header in its own band", () => {
    const { container } = render(
      <StandingsCrystal
        model={readyModel}
        settings={{ showSessionHeader: false, showBrand: false, brandVisible: true }}
        renderMode="harness"
      />,
    );
    expect(container.querySelector(".vc-standings-header")).toBeNull();
    const band = container.querySelector(".vc-brand-band");
    expect(band).toBeTruthy();
    expect(brandNodes(container)).toHaveLength(2);
    expect(band?.textContent).toContain("VANTARE");
  });

  it("paid opt-out hides the brand with a visible header", () => {
    const { container } = render(
      <StandingsCrystal
        model={readyModel}
        settings={{ showSessionHeader: true, showBrand: false, brandVisible: false }}
        renderMode="harness"
      />,
    );
    expect(container.querySelector(".vc-standings-header")).toBeTruthy();
    expect(brandNodes(container)).toHaveLength(0);
    expect(container.querySelector(".vc-brand-band")).toBeNull();
  });

  it("paid opt-out with a hidden header shows no brand at all", () => {
    const { container } = render(
      <StandingsCrystal
        model={readyModel}
        settings={{ showSessionHeader: false, brandVisible: false }}
        renderMode="harness"
      />,
    );
    expect(brandNodes(container)).toHaveLength(0);
  });
});
