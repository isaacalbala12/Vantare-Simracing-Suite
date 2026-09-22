import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PedalsTelemetryViewModel } from "../../widget-types/pedals-telemetry/pedals-telemetry-view-model";
import { PedalsAdvancedEfficiency } from "./PedalsAdvancedEfficiency";

afterEach(cleanup);

const model: PedalsTelemetryViewModel = {
  type: "pedals-telemetry",
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
  playerPosition: 1,
  positionText: "1",
  showPosition: true,
  showClutch: true,
};

describe("PedalsAdvancedEfficiency", () => {
  it("copies the complete compact composition under the Efficiency identity", () => {
    const { container } = render(<PedalsAdvancedEfficiency model={model} settings={{}} renderMode="harness" />);
    const root = container.querySelector('[data-widget-system="vantare-functional"]') as HTMLElement;

    expect(root.getAttribute("data-widget-renderer")).toBe("pedals-telemetry");
    expect(root.classList.contains("vf-pedals-adv")).toBe(true);
    expect(root.querySelector(".vf-pedals-adv-gear-letter")?.textContent).toBe("6");
    expect(root.querySelector(".vf-pedals-adv-speed")?.textContent).toContain("242");
    expect(root.querySelector(".vf-pedals-adv-rpm")?.textContent).toContain("8.1k");
    expect(root.querySelector(".vf-pedals-adv-wheel")).toBeTruthy();
    expect(root.querySelector<SVGGElement>(".vf-pedals-adv-wheel-rotor")?.style.transform).toBe("rotate(180deg)");
    expect(root.querySelectorAll(".vf-pedals-adv-bar[data-pedal]")).toHaveLength(3);
    expect(root.querySelectorAll(".vf-pedals-adv-wheel circle")).toHaveLength(14);
  });

  it("keeps the compact pedal bars and their percentages in titles", () => {
    const { container } = render(<PedalsAdvancedEfficiency model={model} settings={{}} renderMode="harness" />);
    const channel = (id: string) => container.querySelector(`[data-pedal="${id}"]`) as HTMLElement;

    expect(channel("clutch").title).toBe("C 6%");
    expect(channel("brake").title).toBe("B 12%");
    expect(channel("throttle").title).toBe("T 78%");
    expect(channel("throttle").querySelector<HTMLElement>("i")?.style.height).toBe("78%");
  });

  it("honors the clutch toggle without changing the composition", () => {
    const { container } = render(
      <PedalsAdvancedEfficiency model={{ ...model, showClutch: false }} settings={{}} renderMode="harness" />,
    );

    expect(container.querySelectorAll(".vf-pedals-adv-bar[data-pedal]")).toHaveLength(2);
    expect(container.querySelector(".vf-pedals-adv-wheel")).toBeTruthy();
  });

  it.each(["stale", "disconnected", "error"] as const)("keeps an accessible status for %s", (status) => {
    const { container, getByRole } = render(
      <PedalsAdvancedEfficiency model={{ ...model, status, statusMessage: "Telemetry unavailable" }} settings={{}} renderMode="harness" />,
    );

    expect(container.querySelector(`[data-status="${status}"]`)).toBeTruthy();
    expect(getByRole("status").textContent).toBe("Telemetry unavailable");
  });
});
