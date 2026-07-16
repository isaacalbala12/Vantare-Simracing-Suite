import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PedalsTelemetryViewModel } from "../../../widget-types/pedals-telemetry/pedals-telemetry-view-model";
import { PedalsTelemetryOriginal } from "./PedalsTelemetryOriginal";

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

describe("PedalsTelemetryOriginal", () => {
  it("renders the functional Original capsule fields and pedal channels", () => {
    const { container } = render(<PedalsTelemetryOriginal model={model} settings={{}} renderMode="harness" />);
    const root = container.querySelector('[data-widget-system="vantare-original"]') as HTMLElement;
    expect(root.getAttribute("data-widget-renderer")).toBe("pedals-telemetry");
    expect(root.querySelector(".vo-pedals-telemetry-gear-value")?.textContent).toBe("6");
    expect(root.textContent).toContain("242");
    expect(root.textContent).toContain("8.1k");
    expect(root.querySelectorAll(".vo-pedals-telemetry-fill")).toHaveLength(3);
  });

  it("honors content visibility and keeps status presentation deterministic", () => {
    const { container } = render(
      <PedalsTelemetryOriginal model={{ ...model, showPosition: false, showClutch: false, status: "stale" }} settings={{}} renderMode="harness" />,
    );
    const root = container.querySelector('[data-widget-system="vantare-original"]') as HTMLElement;
    expect(root.getAttribute("data-status")).toBe("stale");
    expect(root.textContent).not.toContain("POS");
    expect(root.querySelector('[data-pedal="clutch"]')).toBeNull();
  });

  it("does not import runtime or persistence dependencies", () => {
    const source = readFileSync(resolve(testDir, "PedalsTelemetryOriginal.tsx"), "utf8");
    expect(source).not.toMatch(/@wailsio\/runtime|telemetry-store|getTelemetryRef|profile-document/);
  });
});
