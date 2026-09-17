import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PedalsTelemetryCompactViewModel } from "../../widget-types/pedals-telemetry-compact/pedals-telemetry-compact-view-model";
import { PedalsAdvancedIracing } from "./PedalsAdvancedIracing";

afterEach(cleanup);

const model: PedalsTelemetryCompactViewModel = {
  type: "pedals-telemetry-compact",
  status: "ready",
  throttle: 0.78,
  brake: 0.12,
  clutch: 0.06,
  speedKph: 242,
  rpm: 8120,
  gear: 6,
  steering: 0.4,
  speedText: "242",
  rpmText: "8.1k",
  gearText: "6",
  showSpeed: true,
  showRpm: true,
  showClutch: true,
};

describe("PedalsAdvancedIracing", () => {
  it("preserves the original iRacing composition with the Efficiency palette contract", () => {
    const { container } = render(<PedalsAdvancedIracing model={model} settings={{}} renderMode="harness" />);
    const root = container.querySelector('[data-widget-system="vantare-iracing"]') as HTMLElement;

    expect(root.getAttribute("data-widget-renderer")).toBe("pedals-telemetry-compact");
    expect(root.querySelector(".vi-gear-letter")?.textContent).toBe("6");
    expect(root.querySelector(".vi-speed")?.textContent).toContain("242");
    expect(root.querySelector(".vi-rpm")?.textContent).toContain("8.1k");
    expect(root.querySelector(".vi-wheel")).toBeTruthy();
    expect(root.querySelector<SVGGElement>(".vi-wheel-rotor")?.style.transform).toBe("rotate(180deg)");
    expect(root.querySelectorAll(".vi-bar[data-pedal]")).toHaveLength(3);
  });

  it("keeps the compact pedal bars and their percentages in titles", () => {
    const { container } = render(<PedalsAdvancedIracing model={model} settings={{}} renderMode="harness" />);
    const channel = (id: string) => container.querySelector(`[data-pedal="${id}"]`) as HTMLElement;

    expect(channel("clutch").title).toBe("C 6%");
    expect(channel("brake").title).toBe("B 12%");
    expect(channel("throttle").title).toBe("T 78%");
    expect(channel("throttle").querySelector<HTMLElement>("i")?.style.height).toBe("78%");
  });

  it("honors compact content toggles without changing the composition", () => {
    const { container } = render(
      <PedalsAdvancedIracing model={{ ...model, showSpeed: false, showRpm: false, showClutch: false }} settings={{}} renderMode="harness" />,
    );

    expect(container.querySelector(".vi-speed")).toBeNull();
    expect(container.querySelector(".vi-rpm")).toBeNull();
    expect(container.querySelectorAll(".vi-bar[data-pedal]")).toHaveLength(2);
    expect(container.querySelector(".vi-wheel")).toBeTruthy();
  });

  it.each(["stale", "missing", "disconnected", "error"] as const)("keeps an accessible status for %s", (status) => {
    const { container, getByRole } = render(
      <PedalsAdvancedIracing model={{ ...model, status, statusMessage: "Telemetry unavailable" }} settings={{}} renderMode="harness" />,
    );

    expect(container.querySelector(`[data-status="${status}"]`)).toBeTruthy();
    expect(getByRole("status").textContent).toBe("Telemetry unavailable");
  });
});
