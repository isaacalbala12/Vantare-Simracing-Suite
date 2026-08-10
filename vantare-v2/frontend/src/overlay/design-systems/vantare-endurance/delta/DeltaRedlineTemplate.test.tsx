import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import type { DeltaViewModel } from "../../../widget-types/delta/delta-view-model";
import { DeltaEndurance } from "./DeltaEndurance";

function model(partial: Partial<DeltaViewModel> = {}): DeltaViewModel {
  return {
    type: "delta",
    status: "ready",
    tone: "neutral",
    deltaText: "0.000",
    lastLapText: "1:38.451",
    bestLapText: "1:38.031",
    progress: 0,
    ...partial,
  };
}

function renderRedline(viewModel: DeltaViewModel, settings: Record<string, unknown> = {}) {
  const { container } = render(
    <DeltaEndurance
      model={viewModel}
      settings={{ templateId: "delta-redline", ...settings }}
      renderMode="harness"
    />,
  );
  return container;
}

describe("DeltaRedlineTemplate", () => {
  it("deflects the fill toward the gaining side and scales it from progress", () => {
    const container = renderRedline(model({ tone: "gaining", deltaText: "−0.540", progress: -0.27 }));
    const fill = container.querySelector<HTMLElement>(".ven-dred-fill");
    expect(fill?.dataset.dir).toBe("gain");
    // Half the bar is one full-scale deflection, so 0.27 of scale is 13.5%.
    expect(fill?.style.width).toBe("13.5%");
  });

  it("deflects the other way when losing", () => {
    const container = renderRedline(model({ tone: "losing", deltaText: "+0.870", progress: 0.435 }));
    const fill = container.querySelector<HTMLElement>(".ven-dred-fill");
    expect(fill?.dataset.dir).toBe("loss");
    expect(fill?.style.width).toBe("21.75%");
  });

  it("renders no fill at all on an exact zero, leaving only the anchor", () => {
    const container = renderRedline(model({ deltaText: "0.000", progress: 0 }));
    expect(container.querySelector(".ven-dred-fill")).toBeNull();
    expect(container.querySelector(".ven-dred-zero")).not.toBeNull();
  });

  it("keeps a barely-off-zero delta visible instead of fading it out", () => {
    const container = renderRedline(model({ tone: "gaining", progress: -0.001 }));
    const fill = container.querySelector<HTMLElement>(".ven-dred-fill");
    expect(Number(fill?.style.opacity)).toBeGreaterThanOrEqual(0.3);
  });

  it("clamps a delta beyond full scale to half the bar", () => {
    const container = renderRedline(model({ tone: "losing", progress: 4 }));
    expect(container.querySelector<HTMLElement>(".ven-dred-fill")?.style.width).toBe("50%");
  });

  it("states the reference lap, and drops the row when the header is off", () => {
    const shown = renderRedline(model());
    expect(shown.querySelector(".ven-dred-ref")?.textContent).toContain("1:38.031");
    const hidden = renderRedline(model(), { showHeader: false });
    expect(hidden.querySelector(".ven-dred-ref")).toBeNull();
  });
});
