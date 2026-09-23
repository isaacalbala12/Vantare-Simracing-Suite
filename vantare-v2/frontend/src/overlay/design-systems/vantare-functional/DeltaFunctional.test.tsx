import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WidgetVisualHost } from "../../core/WidgetVisualHost";
import { buildWorkshopFrameV2, createScenarioWidget } from "../../authoring/fixtures/authoring-v2-workshop-frame";
import type { DeltaViewModel } from "../../widget-types/delta/delta-view-model";
import { DeltaFunctional } from "./DeltaFunctional";

afterEach(cleanup);

const model: DeltaViewModel = {
  type: "delta", status: "ready", tone: "gaining", deltaText: "-0.280",
  lastLapText: "1:31.234", bestLapText: "1:30.980", progress: -0.5,
  completedLap: 127, sessionIdentity: "race:1",
};

describe("Functional Delta", () => {
  it("discloses a fallback even when its measurement is stale", () => {
    const { getByRole } = render(<DeltaFunctional model={{ ...model, status: "stale", requestedReference: "previous-lap", reference: "personal-best" }} settings={{}} renderMode="harness" />);
    expect(getByRole("note").textContent).toMatch(/Vuelta anterior.*no disponible.*Mejor personal/i);
  });

  it("discloses an unavailable requested reference", () => {
    const { getByRole } = render(<DeltaFunctional model={{ ...model, status: "missing", requestedReference: "previous-lap", reference: undefined }} settings={{}} renderMode="harness" />);
    expect(getByRole("note").textContent).toMatch(/Vuelta anterior.*no disponible/i);
  });

  it("does not animate a reference switch as driving improvement", () => {
    const { container, rerender } = render(<DeltaFunctional model={{ ...model, tone: "losing", requestedReference: "personal-best", reference: "personal-best" }} settings={{}} renderMode="harness" />);
    rerender(<DeltaFunctional model={{ ...model, requestedReference: "previous-lap", reference: "previous-lap" }} settings={{}} renderMode="harness" />);
    expect(container.querySelector(".vf-delta")?.getAttribute("data-cross")).toBeNull();
  });

  it("keeps lap notices hidden while idle and shows the last lap only after a completed lap", () => {
    const { container, rerender } = render(<DeltaFunctional model={model} settings={{}} renderMode="harness" />);
    expect(container.querySelector(".vf-delta")?.getAttribute("data-tone")).toBe("gaining");
    expect(container.querySelector(".vf-delta-value")?.textContent).toBe("▲-0.280");
    expect(container.querySelector(".vf-delta-arrow")?.textContent).toBe("▲");
    expect(container.querySelector(".vf-delta-last .vf-clock")?.textContent).toBe("1:31.234");
    expect(container.querySelector(".vf-delta")?.getAttribute("data-delta-event")).toBeNull();
    rerender(<DeltaFunctional model={{ ...model, lastLapText: "1:31.111", completedLap: 128 }} settings={{}} renderMode="harness" />);
    expect(container.querySelector(".vf-delta")?.getAttribute("data-delta-event")).toBe("lap-completed");
    expect(container.querySelector(".vf-delta-last .vf-clock")?.textContent).toBe("1:31.111");
    const fill = container.querySelector<HTMLElement>(".vf-delta-fill");
    expect(fill?.style.left).toBe("25%");
    expect(fill?.style.width).toBe("25%");
  });

  it("shows the personal best on the left when a new personal best arrives", () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<DeltaFunctional model={model} settings={{}} renderMode="harness" />);
    rerender(<DeltaFunctional model={{ ...model, lastLapText: "1:30.700", bestLapText: "1:30.700", completedLap: 128 }} settings={{}} renderMode="harness" />);
    expect(container.querySelector(".vf-delta")?.getAttribute("data-delta-event")).toBe("personal-best");
    expect(container.querySelector(".vf-delta-reference .vf-clock")?.textContent).toBe("1:30.700");
    expect(container.querySelector(".vf-delta-last .vf-clock")?.textContent).toBe("1:30.700");
    vi.advanceTimersByTime(4000);
    expect(container.querySelector(".vf-delta")?.getAttribute("data-delta-event")).toBeNull();
  });

  it("does not classify a slower best as a personal-best event", () => {
    const { container, rerender } = render(<DeltaFunctional model={model} settings={{}} renderMode="harness" />);
    rerender(<DeltaFunctional model={{ ...model, lastLapText: "1:32.000", bestLapText: "1:31.100", completedLap: 128 }} settings={{}} renderMode="harness" />);
    expect(container.querySelector(".vf-delta")?.getAttribute("data-delta-event")).toBe("lap-completed");
  });

  it("mirrors the fill to the right of center when losing", () => {
    const { container } = render(<DeltaFunctional model={{ ...model, tone: "losing", progress: 0.5 }} settings={{}} renderMode="harness" />);
    const fill = container.querySelector<HTMLElement>(".vf-delta-fill");
    expect(fill?.style.left).toBe("50%");
    expect(fill?.style.width).toBe("25%");
  });

  it("keeps left/width interpolable on both sides so the zero crossing drains through the anchor", () => {
    const { container, rerender } = render(<DeltaFunctional model={{ ...model, progress: -0.02 }} settings={{}} renderMode="harness" />);
    const fill = container.querySelector<HTMLElement>(".vf-delta-fill");
    expect(fill?.style.left).toBe("49%");
    rerender(<DeltaFunctional model={{ ...model, tone: "losing", progress: 0.02 }} settings={{}} renderMode="harness" />);
    expect(fill?.style.left).toBe("50%");
    expect(fill?.style.right).toBe("");
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
