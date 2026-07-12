import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PedalsTelemetryCompactViewModel } from "../../../widget-types/pedals-telemetry-compact/pedals-telemetry-compact-view-model";
import { PedalsTelemetryCompactOriginal } from "./PedalsTelemetryCompactOriginal";

afterEach(() => cleanup());
const model: PedalsTelemetryCompactViewModel = { type: "pedals-telemetry-compact", status: "ready", throttle: 0.78, brake: 0.12, clutch: 0, speedKph: 242, rpm: 8120, gear: 6, speedText: "242", rpmText: "8.1k", gearText: "6", showSpeed: true, showRpm: true, showClutch: true };

describe("PedalsTelemetryCompactOriginal", () => {
  it("renders compact telemetry and three input channels", () => {
    const { container } = render(<PedalsTelemetryCompactOriginal model={model} settings={{}} renderMode="harness" />);
    const root = container.querySelector('[data-widget-system="vantare-original"]') as HTMLElement;
    expect(root.getAttribute("data-widget-renderer")).toBe("pedals-telemetry-compact");
    expect(root.querySelectorAll("[data-pedal]")).toHaveLength(3);
    expect(root.textContent).toContain("242");
  });
});
