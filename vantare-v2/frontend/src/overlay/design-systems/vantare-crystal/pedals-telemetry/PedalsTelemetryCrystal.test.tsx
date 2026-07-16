import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PedalsTelemetryViewModel } from "../../../widget-types/pedals-telemetry/pedals-telemetry-view-model";
import { PedalsTelemetryCrystal } from "./PedalsTelemetryCrystal";

const testDir = dirname(fileURLToPath(import.meta.url));
afterEach(() => cleanup());

const model: PedalsTelemetryViewModel = {
  type: "pedals-telemetry",
  status: "ready",
  throttle: 0.78,
  brake: 0.12,
  clutch: 0,
  speedKph: 242,
  rpm: 8120,
  gear: 6,
  playerPosition: 5,
  showPosition: true,
  showClutch: true,
  speedText: "242",
  rpmText: "8.1k",
  gearText: "6",
  positionText: "5",
};

describe("PedalsTelemetryCrystal", () => {
  it("renders the canonical V1 capsule structure", () => {
    const { container } = render(<PedalsTelemetryCrystal model={model} settings={{}} renderMode="harness" />);
    const root = container.querySelector('[data-widget-system="vantare-crystal"]') as HTMLElement;
    expect(root.getAttribute("data-widget-renderer")).toBe("pedals-telemetry");
    expect(root.classList.contains("vc-pedals-telemetry-v1")).toBe(true);
    expect(root.querySelector(".vc-pedals-telemetry-frame")).toBeTruthy();
    expect(root.querySelectorAll(".vc-pedals-telemetry-led")).toHaveLength(10);
    expect(root.querySelectorAll(".vc-pedals-telemetry-fill")).toHaveLength(3);
  });

  it("hides optional channels without adding editor controls", () => {
    const { container } = render(
      <PedalsTelemetryCrystal model={{ ...model, showPosition: false, showClutch: false }} settings={{}} renderMode="harness" />,
    );
    const root = container.querySelector('[data-widget-system="vantare-crystal"]') as HTMLElement;
    expect(root.textContent).not.toContain("POS");
    expect(root.querySelector('[data-pedal="clutch"]')).toBeNull();
    expect(root.querySelectorAll("button, input, textarea, [contenteditable='true']")).toHaveLength(0);
  });

  it("does not import runtime or persistence dependencies", () => {
    const source = readFileSync(resolve(testDir, "PedalsTelemetryCrystal.tsx"), "utf8");
    expect(source).not.toMatch(/@wailsio\/runtime|telemetry-store|getTelemetryRef|profile-document/);
  });
});
