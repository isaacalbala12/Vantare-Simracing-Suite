import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PedalsTelemetryCompactViewModel } from "../../../widget-types/pedals-telemetry-compact/pedals-telemetry-compact-view-model";
import { PedalsTelemetryCompactCrystal } from "./PedalsTelemetryCompactCrystal";

afterEach(() => cleanup());
const model: PedalsTelemetryCompactViewModel = { type: "pedals-telemetry-compact", status: "ready", throttle: 0.78, brake: 0.12, clutch: 0, speedKph: 242, rpm: 8120, gear: 6, speedText: "242", rpmText: "8.1k", gearText: "6", showSpeed: true, showRpm: true, showClutch: true };

describe("PedalsTelemetryCompactCrystal", () => {
  it("renders the low-profile V2 composition", () => {
    const { container } = render(<PedalsTelemetryCompactCrystal model={model} settings={{}} renderMode="harness" />);
    const root = container.querySelector('[data-widget-system="vantare-crystal"]') as HTMLElement;
    expect(root.classList.contains("vc-pedals-telemetry-compact-v2")).toBe(true);
    expect(root.querySelector(".vc-pedals-compact-frame")).toBeTruthy();
    expect(root.querySelectorAll(".vc-pedals-compact-shift i")).toHaveLength(7);
    expect(root.textContent).not.toContain("V2: RECTANGULAR PERFIL BAJO");
    expect(root.textContent).not.toContain("Altura vertical reducida");
    expect(root.querySelectorAll("button, input, textarea")).toHaveLength(0);
  });
});
