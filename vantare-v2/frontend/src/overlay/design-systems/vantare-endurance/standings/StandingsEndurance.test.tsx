import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultStandingsContent, getEnabledStandingsColumns } from "../../../widget-types/standings/standings-content";
import {
  withStandingsMotionIdentity,
  type StandingsRowViewModel,
  type StandingsViewModel,
} from "../../../widget-types/standings/standings-view-model";
import { StandingsEndurance } from "./StandingsEndurance";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const templateRow: StandingsRowViewModel = {
  id: "template",
  position: 1,
  driverNumber: "",
  driverName: "Driver",
  vehicleClass: "HYPERCAR",
  teamCode: "",
  teamBrandColor: "",
  gapText: "+0.0s",
  intervalText: "+0.0s",
  currentLapText: "1",
  lastLapText: "1:31.234",
  bestLapText: "1:30.999",
  pitText: "",
  tireCompound: "",
  isPlayer: false,
  isLeader: false,
};

function battleModel(sessionId: string, epoch: number, sequence: number): StandingsViewModel {
  const model: StandingsViewModel = {
    type: "standings",
    status: "ready",
    activeClass: "HYPERCAR",
    sessionLabel: "RACE",
    remainingText: "—",
    columns: getEnabledStandingsColumns(createDefaultStandingsContent()),
    rows: [
      {
        ...templateRow,
        id: "ahead",
        position: 1,
        gapText: "+0.0s",
        pitText: "",
        isPlayer: false,
        isLeader: true,
      },
      {
        ...templateRow,
        id: "player",
        position: 2,
        gapText: "+0.4s",
        pitText: "",
        isPlayer: true,
        isLeader: false,
      },
    ],
  };
  return withStandingsMotionIdentity(model, `${sessionId}:${epoch}`, sequence);
}

describe("StandingsEndurance Redline motion lifecycle", () => {
  it("preserves non-enumerable identity through row fitting and cancels callbacks on every reset", () => {
    vi.useFakeTimers();
    const initial = battleModel("session-a", 1, 10);
    expect(Object.getOwnPropertyDescriptor(initial, "motionIdentity")?.enumerable).toBe(false);
    expect(Object.getOwnPropertyDescriptor(initial, "motionSequence")?.enumerable).toBe(false);

    const view = render(
      <StandingsEndurance
        model={initial}
        settings={{ templateId: "standings-redline" }}
        renderMode="harness"
        layout={{ w: 520, h: 560 }}
      />,
    );
    const stage = () => view.container.querySelector(".ven-red-battle")?.getAttribute("data-stage");
    expect(stage()).toBe("seam");

    act(() => vi.advanceTimersByTime(1000));
    view.rerender(
      <StandingsEndurance
        model={battleModel("session-b", 1, 20)}
        settings={{ templateId: "standings-redline" }}
        renderMode="harness"
        layout={{ w: 520, h: 560 }}
      />,
    );
    act(() => vi.advanceTimersByTime(1500));
    expect(stage()).toBe("seam");

    view.rerender(
      <StandingsEndurance
        model={battleModel("session-b", 2, 30)}
        settings={{ templateId: "standings-redline" }}
        renderMode="harness"
        layout={{ w: 520, h: 560 }}
      />,
    );
    act(() => vi.advanceTimersByTime(1000));
    expect(stage()).toBe("seam");

    view.rerender(
      <StandingsEndurance
        model={battleModel("session-b", 2, 29)}
        settings={{ templateId: "standings-redline" }}
        renderMode="harness"
        layout={{ w: 520, h: 560 }}
      />,
    );
    act(() => vi.advanceTimersByTime(1500));
    expect(stage()).toBe("seam");
  });
});
