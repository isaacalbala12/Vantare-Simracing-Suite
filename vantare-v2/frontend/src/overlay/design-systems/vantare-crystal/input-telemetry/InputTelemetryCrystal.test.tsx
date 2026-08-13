import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { InputTelemetryViewModel } from "../../../widget-types/input-telemetry/input-telemetry-view-model";
import { InputTelemetryCrystal } from "./InputTelemetryCrystal";
afterEach(() => cleanup());
const model: InputTelemetryViewModel = { type: "input-telemetry", status: "ready", throttle: 0.78, brake: 0.12, clutch: 0, speedKph: 242, rpm: 8120, gear: 6, history: [{ capturedAt: 1, throttle: 0.1, brake: 0.8, clutch: 0 }, { capturedAt: 2, throttle: 0.9, brake: 0.2, clutch: 0 }], historySeconds: 4, showClutch: true };
describe("InputTelemetryCrystal", () => {
  it("renders the simple Telemetry Blade from the Vantare Crystal reference", () => {
    const { container } = render(<InputTelemetryCrystal model={model} settings={{ templateId: "input-blade" }} renderMode="harness" />);
    const root = container.querySelector('[data-template="input-blade"]') as HTMLElement;

    expect(root.querySelector('[data-metric="gear"]')?.textContent).toBe("6");
    expect(root.querySelector('[data-metric="speed"]')?.textContent).toContain("242KPH");
    expect(root.querySelector('[data-metric="rpm"]')?.textContent).toContain("8120RPM");
    expect(root.querySelector("header")).toBeNull();
    expect(root.querySelector("svg")).toBeNull();
    expect(root.querySelector(".vc-input-vertical")).toBeNull();
    expect(root.querySelector(".vc-input-blade-shell")).not.toBeNull();
  });

  it.each(["input-capsule", "input-dense"])('renders template %s from its ViewModel', (templateId) => { const { container } = render(<InputTelemetryCrystal model={model} settings={{ templateId }} renderMode="harness" />); const root = container.querySelector('[data-widget-system="vantare-crystal"]') as HTMLElement; expect(root.getAttribute("data-template")).toBe(templateId); expect(root.querySelectorAll("[data-input]")).toHaveLength(3); expect(root.querySelector("path")?.getAttribute("d")).toContain(templateId === "input-dense" ? "L400" : "L500"); cleanup(); });
  it("omits clutch when the content contract disables it", () => { const { container } = render(<InputTelemetryCrystal model={{ ...model, showClutch: false }} settings={{ templateId: "input-dense" }} renderMode="harness" />); expect(container.querySelector('[data-input="clutch"]')).toBeNull(); });
});
