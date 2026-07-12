import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PedalsViewModel } from "../../../widget-types/pedals/pedals-view-model";
import { PedalsCrystal } from "./PedalsCrystal";

const testDir = dirname(fileURLToPath(import.meta.url));

afterEach(() => cleanup());

const readyModel: PedalsViewModel = {
  type: "pedals",
  status: "ready",
  throttle: 0.78,
  brake: 0.12,
  clutch: 0,
  throttleText: "78%",
  brakeText: "12%",
  clutchText: "0%",
};

const defaultSettings = {
  transparentBackground: true,
  pedalThrottleColor: "#2ecc71",
  pedalBrakeColor: "#e74c3c",
  pedalClutchColor: "#3498db",
};

function renderCrystal(
  model: PedalsViewModel,
  settings: Readonly<Record<string, unknown>> = defaultSettings,
) {
  const view = render(<PedalsCrystal model={model} settings={settings} renderMode="harness" />);
  const root = view.container.querySelector('[data-widget-system="vantare-crystal"]') as HTMLElement;
  return { root, view };
}

describe("PedalsCrystal", () => {
  it("exposes the Crystal system root and pedals renderer marker", () => {
    const { root } = renderCrystal(readyModel);
    expect(root).toBeTruthy();
    expect(root.getAttribute("data-widget-renderer")).toBe("pedals");
    expect(root.getAttribute("data-status")).toBe("ready");
  });

  it("uses a structurally distinct Crystal composition", () => {
    const { root } = renderCrystal(readyModel);
    expect(root.classList.contains("vc-pedals-v3")).toBe(true);
    expect(root.querySelector(".vc-pedals-frame")).toBeTruthy();
    expect(root.querySelector(".vc-pedals-channel")).toBeTruthy();
    expect(root.querySelector(".vo-pedals-bars")).toBeNull();
    expect(root.querySelector("[data-pedal='throttle']")).toBeTruthy();
    expect(root.querySelector("[data-pedal='brake']")).toBeTruthy();
    expect(root.querySelector("[data-pedal='clutch']")).toBeTruthy();
    expect(root.textContent).not.toMatch(/gear|rpm|speed/i);
  });

  it("renders three pedal channels with exact percentages", () => {
    const { root } = renderCrystal(readyModel);
    const fills = [...root.querySelectorAll(".vc-pedals-fill")];
    expect(fills).toHaveLength(3);
    expect(root.querySelector('[data-pedal="throttle"] .vc-pedals-value')?.textContent).toBe("78%");
    expect((fills[0] as HTMLElement).style.height).toBe("78%");
    expect((fills[1] as HTMLElement).style.height).toBe("12%");
    expect((fills[2] as HTMLElement).style.height).toBe("0%");
  });

  it("handles zero and full pedal extremes", () => {
    const full = renderCrystal({
      ...readyModel,
      throttle: 1,
      brake: 1,
      clutch: 1,
      throttleText: "100%",
      brakeText: "100%",
      clutchText: "100%",
    });
    for (const fill of full.root.querySelectorAll(".vc-pedals-fill")) {
      expect((fill as HTMLElement).style.height).toBe("100%");
    }
  });

  it("shows deterministic unavailable presentations", () => {
    const { root } = renderCrystal({
      ...readyModel,
      status: "error",
      statusMessage: "telemetry unavailable",
      throttle: 0,
      brake: 0,
      clutch: 0,
    });
    expect(root.getAttribute("data-status")).toBe("error");
    expect(root.querySelector(".vc-pedals-status-message")?.textContent).toBe("telemetry unavailable");
  });

  it("consumes pedal color and transparent background settings", () => {
    const colored = renderCrystal(readyModel, {
      ...defaultSettings,
      pedalThrottleColor: "#abcdef",
    });
    expect(
      (colored.root.querySelector('[data-pedal="throttle"] .vc-pedals-fill') as HTMLElement).style
        .background,
    ).toBe("#abcdef");
    cleanup();

    const transparent = renderCrystal(readyModel, { ...defaultSettings, transparentBackground: true });
    expect(transparent.root.getAttribute("data-transparent")).toBe("true");
  });

  it("does not render editor controls", () => {
    const { root } = renderCrystal(readyModel);
    expect(root.querySelector("button")).toBeNull();
    expect(root.querySelector("input")).toBeNull();
    expect(root.querySelector("textarea")).toBeNull();
    expect(root.querySelector("[contenteditable='true']")).toBeNull();
  });

  it("does not import forbidden runtime dependencies", () => {
    const source = readFileSync(resolve(testDir, "PedalsCrystal.tsx"), "utf8");
    expect(source).not.toMatch(/@wailsio\/runtime/);
    expect(source).not.toMatch(/telemetry-store/);
    expect(source).not.toMatch(/getTelemetryRef/);
    expect(source).not.toMatch(/profile-document/);
  });
});
