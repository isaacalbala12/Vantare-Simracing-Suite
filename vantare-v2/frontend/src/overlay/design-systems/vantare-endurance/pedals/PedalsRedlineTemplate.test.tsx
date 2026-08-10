import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import type { PedalsViewModel } from "../../../widget-types/pedals/pedals-view-model";
import { PedalsEndurance } from "./PedalsEndurance";

function model(partial: Partial<PedalsViewModel> = {}): PedalsViewModel {
  return {
    type: "pedals",
    status: "ready",
    throttle: 0,
    brake: 0,
    clutch: 0,
    throttleText: "0%",
    brakeText: "0%",
    clutchText: "0%",
    ...partial,
  };
}

function renderRedline(viewModel: PedalsViewModel, settings: Record<string, unknown> = {}) {
  const { container } = render(
    <PedalsEndurance
      model={viewModel}
      settings={{ templateId: "pedals-redline", ...settings }}
      renderMode="harness"
    />,
  );
  return container;
}

function rail(container: HTMLElement, pedal: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`.ven-pred-rail[data-pedal="${pedal}"]`);
  if (!element) {
    throw new Error(`missing rail for ${pedal}`);
  }
  return element;
}

describe("PedalsRedlineTemplate", () => {
  it("renders one rail per pedal in pedalbox order", () => {
    const container = renderRedline(model());
    const order = [...container.querySelectorAll(".ven-pred-rail")].map((node) =>
      node.getAttribute("data-pedal"),
    );
    expect(order).toEqual(["clutch", "brake", "throttle"]);
  });

  it("scales each fill by its pedal value", () => {
    const container = renderRedline(model({ throttle: 1, brake: 0.5, clutch: 0 }));
    const fillOf = (pedal: string) =>
      rail(container, pedal).querySelector<HTMLElement>(".ven-pred-fill")?.style.transform;

    expect(fillOf("throttle")).toBe("scaleY(1)");
    expect(fillOf("brake")).toBe("scaleY(0.5)");
    expect(fillOf("clutch")).toBe("scaleY(0)");
  });

  it("states the reading each rail carries", () => {
    const container = renderRedline(model({ brake: 0.42, brakeText: "42%" }));
    expect(rail(container, "brake").textContent).toContain("BRK");
    expect(rail(container, "brake").textContent).toContain("42%");
  });

  it("marks a pedal engaged only once it is off its rest position", () => {
    const container = renderRedline(model({ throttle: 0.01, brake: 0.2 }));
    expect(rail(container, "throttle").getAttribute("data-engaged")).toBeNull();
    expect(rail(container, "brake").getAttribute("data-engaged")).toBe("true");
  });

  it("marks a pinned pedal as saturated", () => {
    const container = renderRedline(model({ throttle: 1, brake: 0.98 }));
    expect(rail(container, "throttle").getAttribute("data-saturated")).toBe("true");
    expect(rail(container, "brake").getAttribute("data-saturated")).toBeNull();
  });

  it("draws the seam only while brake and throttle overlap", () => {
    const overlapping = renderRedline(model({ brake: 0.3, throttle: 0.25 }));
    expect(overlapping.querySelector(".ven-pred-seam")).toBeTruthy();
    expect(overlapping.querySelector(".ven-pred-block")?.getAttribute("data-trail-braking")).toBe(
      "true",
    );

    const brakingOnly = renderRedline(model({ brake: 0.3, throttle: 0 }));
    expect(brakingOnly.querySelector(".ven-pred-seam")).toBeNull();
  });

  it("carries the configured pedal colours into the rails", () => {
    const container = renderRedline(model({ throttle: 0.5 }), { pedalThrottleColor: "#ff00ff" });
    const root = container.querySelector<HTMLElement>("[data-template='pedals-redline']");
    expect(root?.style.getPropertyValue("--ven-pred-throttle")).toBe("#ff00ff");
    expect(
      rail(container, "throttle").querySelector<HTMLElement>(".ven-pred-fill")?.style.background,
    ).toBe("var(--ven-pred-throttle)");
  });

  it("surfaces a status message without dropping the rails", () => {
    const container = renderRedline(model({ status: "stale", statusMessage: "Sin telemetría" }));
    expect(container.querySelector(".ven-status-message")?.textContent).toBe("Sin telemetría");
    expect(container.querySelectorAll(".ven-pred-rail")).toHaveLength(3);
  });
});
