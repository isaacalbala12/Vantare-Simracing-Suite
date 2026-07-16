import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { InputTelemetryViewModel } from "../../../widget-types/input-telemetry/input-telemetry-view-model";
import { InputTelemetryCrystal } from "./InputTelemetryCrystal";
afterEach(() => cleanup());
const model: InputTelemetryViewModel = { type: "input-telemetry", status: "ready", throttle: 0.78, brake: 0.12, clutch: 0, speedKph: 242, rpm: 8120, gear: 6, history: [], historySeconds: 4, showClutch: true };
describe("InputTelemetryCrystal", () => { it.each(["input-blade", "input-capsule", "input-dense"])('renders template %s', (templateId) => { const { container } = render(<InputTelemetryCrystal model={model} settings={{ templateId }} renderMode="harness" />); const root = container.querySelector('[data-widget-system="vantare-crystal"]') as HTMLElement; expect(root.getAttribute("data-template")).toBe(templateId); expect(root.querySelectorAll("[data-input]")).toHaveLength(3); cleanup(); }); });
