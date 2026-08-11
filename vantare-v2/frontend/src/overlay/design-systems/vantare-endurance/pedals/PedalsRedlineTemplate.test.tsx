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

  it("stays quiet when brake and throttle overlap", () => {
    const overlapping = renderRedline(model({ brake: 0.3, throttle: 0.25 }));
    expect(overlapping.querySelector(".ven-pred-seam")).toBeNull();
    expect(rail(overlapping, "brake").getAttribute("data-engaged")).toBe("true");
    expect(rail(overlapping, "throttle").getAttribute("data-engaged")).toBe("true");
  });

  it("carries the configured pedal colours into the rails", () => {
    const container = renderRedline(model({ throttle: 0.5 }), { pedalThrottleColor: "#ff00ff" });
    const root = container.querySelector<HTMLElement>("[data-template='pedals-redline']");
    expect(root?.style.getPropertyValue("--ven-pred-throttle")).toBe("#ff00ff");
    expect(
      rail(container, "throttle").querySelector<HTMLElement>(".ven-pred-fill")?.style.background,
    ).toBe("var(--ven-pred-throttle)");
  });

  it("shows no brake peak on a first render, which keeps stills deterministic", () => {
    const container = renderRedline(model({ brake: 0.9 }));
    expect(container.querySelector("[data-testid='pedals-brake-peak']")).toBeNull();
  });

  it("marks the peak once the driver eases off the brake", () => {
    const { container, rerender } = render(
      <PedalsEndurance
        model={model({ brake: 0.9 })}
        settings={{ templateId: "pedals-redline" }}
        renderMode="harness"
      />,
    );
    rerender(
      <PedalsEndurance
        model={model({ brake: 0.5 })}
        settings={{ templateId: "pedals-redline" }}
        renderMode="harness"
      />,
    );
    const peak = container.querySelector<HTMLElement>("[data-testid='pedals-brake-peak']");
    expect(peak).toBeTruthy();
    expect(peak?.style.bottom).toBe("90%");
  });

  it("clears the peak when the brake is released, so the next corner starts clean", () => {
    const { container, rerender } = render(
      <PedalsEndurance
        model={model({ brake: 0.9 })}
        settings={{ templateId: "pedals-redline" }}
        renderMode="harness"
      />,
    );
    for (const brake of [0.5, 0, 0.3]) {
      rerender(
        <PedalsEndurance
          model={model({ brake })}
          settings={{ templateId: "pedals-redline" }}
          renderMode="harness"
        />,
      );
    }
    expect(container.querySelector("[data-testid='pedals-brake-peak']")).toBeNull();
  });

  it("surfaces a status message without dropping the rails", () => {
    const container = renderRedline(model({ status: "stale", statusMessage: "Sin telemetría" }));
    expect(container.querySelector(".ven-status-message")?.textContent).toBe("Sin telemetría");
    expect(container.querySelectorAll(".ven-pred-rail")).toHaveLength(3);
  });
});
