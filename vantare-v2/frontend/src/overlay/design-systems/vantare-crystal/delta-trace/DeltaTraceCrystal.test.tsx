import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { DeltaTraceViewModel } from "../../../widget-types/delta-trace/delta-trace-view-model";
import { DeltaTraceCrystal } from "./DeltaTraceCrystal";

afterEach(() => cleanup());

describe("DeltaTraceCrystal", () => {
  it("separates dynamic trace roles while keeping unavailable map and turn honest", () => {
    const model: DeltaTraceViewModel = {
      type: "delta-trace",
      status: "ready",
      points: [{ capturedAt: 1, deltaSeconds: 0.1 }, { capturedAt: 2, deltaSeconds: -0.1 }],
      currentDelta: -0.1,
      trend: "gaining",
      sectorDeltas: [],
      showSectors: true,
      showTrackMap: true,
    };
    const { container } = render(<DeltaTraceCrystal model={model} settings={{}} renderMode="harness" />);
    expect(container.querySelector(".vc-dt-live-fill")).toBeTruthy();
    expect(container.querySelector(".vc-dt-live")).toBeTruthy();
    expect(container.querySelector(".vc-dt-marker-line")).toBeTruthy();
    expect(container.querySelector(".vc-dt-marker-dot")).toBeTruthy();
    expect(container.querySelectorAll(".vc-dt-sectors i")).toHaveLength(14);
    expect(container.querySelector(".vc-dt-turn b")?.textContent).toBe("—");
    expect(container.querySelector(".vc-dt-map")?.textContent).toContain("MAP —");
  });
});
