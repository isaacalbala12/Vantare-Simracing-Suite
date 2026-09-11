import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WidgetVisualHost } from "../../core/WidgetVisualHost";
import { buildWorkshopFrameV2, createScenarioWidget } from "../../authoring/fixtures/authoring-v2-workshop-frame";
import type { DeltaViewModel } from "../../widget-types/delta/delta-view-model";
import { DeltaFunctional } from "./DeltaFunctional";

afterEach(cleanup);

const model: DeltaViewModel = {
  type: "delta", status: "ready", tone: "gaining", deltaText: "-0.280",
  lastLapText: "1:31.234", bestLapText: "1:30.980", progress: -0.5,
};

describe("Functional Delta", () => {
  it("shows the delta value with its tone, the last lap in the header and a fill that grows from center", () => {
    const { container } = render(<DeltaFunctional model={model} settings={{}} renderMode="harness" />);
    expect(container.querySelector(".vf-delta")?.getAttribute("data-tone")).toBe("gaining");
    expect(container.querySelector(".vf-delta-value")?.textContent).toBe("▲-0.280");
    expect(container.querySelector(".vf-delta-arrow")?.textContent).toBe("▲");
    expect(container.querySelector(".vf-delta-foot .vf-clock")?.textContent).toBe("1:31.234");
    const fill = container.querySelector<HTMLElement>(".vf-delta-fill");
    expect(fill?.style.right).toBe("50%");
    expect(fill?.style.width).toBe("25%");
  });

  it("mirrors the fill to the right of center when losing", () => {
    const { container } = render(<DeltaFunctional model={{ ...model, tone: "losing", progress: 0.5 }} settings={{}} renderMode="harness" />);
    const fill = container.querySelector<HTMLElement>(".vf-delta-fill");
    expect(fill?.style.left).toBe("50%");
    expect(fill?.style.width).toBe("25%");
  });

  it("hides the fill entirely at zero progress", () => {
    const { container } = render(<DeltaFunctional model={{ ...model, tone: "neutral", progress: 0 }} settings={{}} renderMode="harness" />);
    expect(container.querySelector<HTMLElement>(".vf-delta-fill")?.style.display).toBe("none");
  });

  it.each(["disconnected", "missing", "error"] as const)("labels %s instead of pretending a value", (status) => {
    const { getByRole } = render(<DeltaFunctional model={{ ...model, status }} settings={{}} renderMode="harness" />);
    expect(getByRole("status").textContent).toBeTruthy();
  });

  it("labels stale data", () => {
    const { getByRole } = render(<DeltaFunctional model={{ ...model, status: "stale" }} settings={{}} renderMode="harness" />);
    expect(getByRole("status").textContent).toBeTruthy();
  });

  it.each(["studio", "desktop", "obs", "harness"] as const)("renders through the shared host with a V2 Workshop scene on %s", (surface) => {
    const scenario = { widget: "delta", system: "vantare-functional", variant: "default", state: "ready", session: "race", location: "track", sceneId: "delta-cross-zero", sceneFrame: 2 } as const;
    const widget = createScenarioWidget({ ...scenario, designId: "delta-functional-signature" });
    const { container } = render(<WidgetVisualHost widget={widget} runtime={buildWorkshopFrameV2(scenario)} renderMode={surface} />);
    const root = container.querySelector('[data-widget-system="vantare-functional"][data-widget-renderer="delta"]');
    expect(root).not.toBeNull();
    expect(root?.getAttribute("data-status")).toBe("ready");
    expect(root?.getAttribute("data-tone")).toBe("gaining");
    expect(container.querySelector(".vf-delta-value")?.textContent).toContain("0.28");
    expect(container.querySelector('[data-testid="widget-host-diagnostic"]')).toBeNull();
  });
});
