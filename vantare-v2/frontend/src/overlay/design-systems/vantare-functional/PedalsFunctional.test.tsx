import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WidgetVisualHost } from "../../core/WidgetVisualHost";
import { buildWorkshopFrameV2, createScenarioWidget } from "../../authoring/fixtures/authoring-v2-workshop-frame";
import type { PedalsViewModel } from "../../widget-types/pedals/pedals-view-model";
import { PedalsFunctional } from "./PedalsFunctional";

afterEach(cleanup);

const model: PedalsViewModel = {
  type: "pedals", status: "ready",
  throttle: 0.85, brake: 0.2, clutch: 0,
  throttleText: "85%", brakeText: "20%", clutchText: "0%",
};

describe("Functional Pedals", () => {
  it("renders the three channels with their model values", () => {
    const { container } = render(<PedalsFunctional model={model} settings={{}} renderMode="harness" />);
    const pedal = (id: string) => container.querySelector(`[data-pedal="${id}"]`);
    expect(pedal("throttle")?.querySelector(".vf-pedal-value")?.textContent).toBe("85%");
    expect(pedal("brake")?.querySelector(".vf-pedal-value")?.textContent).toBe("20%");
    expect(pedal("clutch")?.querySelector(".vf-pedal-value")?.textContent).toBe("0%");
    expect(pedal("throttle")?.querySelector<HTMLElement>(".vf-pedal-fill")?.style.height).toBe("85%");
    expect(pedal("brake")?.querySelector<HTMLElement>(".vf-pedal-fill")?.style.height).toBe("20%");
  });

  it.each(["disconnected", "missing", "error"] as const)("labels %s while keeping the last values visible", (status) => {
    const { container, getByRole } = render(<PedalsFunctional model={{ ...model, status }} settings={{}} renderMode="harness" />);
    expect(getByRole("status").textContent).toBeTruthy();
    expect(container.querySelectorAll(".vf-pedal")).toHaveLength(3);
  });

  it("hides the header when showHeader is disabled", () => {
    const { container } = render(<PedalsFunctional model={model} settings={{ showHeader: false }} renderMode="harness" />);
    expect(container.querySelector(".vf-session")).toBeNull();
    expect(container.querySelectorAll(".vf-pedal")).toHaveLength(3);
  });

  it.each(["studio", "desktop", "obs", "harness"] as const)("renders through the shared host with V2 Workshop data on %s", (surface) => {
    const scenario = { widget: "pedals", system: "vantare-functional", variant: "pedals-full", state: "ready", session: "race", location: "track" } as const;
    const widget = createScenarioWidget({ ...scenario, designId: "pedals-functional-signature" });
    const { container } = render(<WidgetVisualHost widget={widget} runtime={buildWorkshopFrameV2(scenario)} renderMode={surface} />);
    expect(container.querySelector('[data-widget-system="vantare-functional"][data-widget-renderer="pedals"][data-status="ready"]')).not.toBeNull();
    expect(container.querySelectorAll(".vf-pedal")).toHaveLength(3);
    expect(container.querySelector('[data-testid="widget-host-diagnostic"]')).toBeNull();
  });
});
