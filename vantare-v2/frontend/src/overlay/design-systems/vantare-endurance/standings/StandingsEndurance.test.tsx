import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMockTelemetry } from "../../../core/mock-scenarios";
import { createDefaultStandingsContent } from "../../../widget-types/standings/standings-content";
import {
  buildStandingsViewModel,
  type StandingsViewModel,
} from "../../../widget-types/standings/standings-view-model";
import { StandingsEndurance } from "./StandingsEndurance";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function battleModel(sessionId: string, epoch: number, sequence: number): StandingsViewModel {
  const snapshot = buildMockTelemetry({ session: "race", location: "track", state: "ready" });
  const model = buildStandingsViewModel({
    ...snapshot,
    capturedAt: sequence,
    session: { ...snapshot.session, key: sessionId, epoch },
  }, createDefaultStandingsContent());
  const source = model.rows[0]!;
  model.rows = [
    {
      ...source,
      id: "ahead",
      position: 1,
      gapText: "+0.0s",
      pitText: "",
      isPlayer: false,
      isLeader: true,
    },
    {
      ...source,
      id: "player",
      position: 2,
      gapText: "+0.4s",
      pitText: "",
      isPlayer: true,
      isLeader: false,
    },
  ];
  return model;
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
