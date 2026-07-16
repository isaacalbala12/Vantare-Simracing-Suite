import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { InputTelemetryViewModel } from "../../../widget-types/input-telemetry/input-telemetry-view-model";
import { InputTelemetryOriginal } from "./InputTelemetryOriginal";
afterEach(() => cleanup());
const model: InputTelemetryViewModel = { type: "input-telemetry", status: "ready", throttle: 0.78, brake: 0.12, clutch: 0, speedKph: 242, rpm: 8120, gear: 6, history: [], historySeconds: 4, showClutch: true };
describe("InputTelemetryOriginal", () => { it("renders inputs and live car fields", () => { const { container } = render(<InputTelemetryOriginal model={model} settings={{}} renderMode="harness" />); expect(container.querySelectorAll("[data-input]")).toHaveLength(3); expect(container.textContent).toContain("8120"); }); });
