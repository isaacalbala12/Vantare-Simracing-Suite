import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PedalsViewModel } from "../../../widget-types/pedals/pedals-view-model";
import { PedalsOriginal } from "./PedalsOriginal";

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

function renderOriginal(
  model: PedalsViewModel,
  settings: Readonly<Record<string, unknown>> = defaultSettings,
) {
  const view = render(<PedalsOriginal model={model} settings={settings} renderMode="harness" />);
  const root = view.container.querySelector('[data-widget-system="vantare-original"]') as HTMLElement;
  return { root, view };
}

describe("PedalsOriginal", () => {
  it("exposes the Original system root and pedals renderer marker", () => {
    const { root } = renderOriginal(readyModel);
    expect(root).toBeTruthy();
    expect(root.getAttribute("data-widget-renderer")).toBe("pedals");
    expect(root.getAttribute("data-status")).toBe("ready");
  });

  it("renders three pedal bars with exact percentages", () => {
    const { root } = renderOriginal(readyModel);
    const fills = [...root.querySelectorAll(".vo-pedals-fill")];
    expect(fills).toHaveLength(3);
    expect(root.querySelector('[data-pedal="throttle"] .vo-pedals-value')?.textContent).toBe("78%");
    expect(root.querySelector('[data-pedal="brake"] .vo-pedals-value')?.textContent).toBe("12%");
    expect(root.querySelector('[data-pedal="clutch"] .vo-pedals-value')?.textContent).toBe("0%");
    expect((fills[2] as HTMLElement).style.height).toBe("78%");
    expect((fills[1] as HTMLElement).style.height).toBe("12%");
    expect((fills[0] as HTMLElement).style.height).toBe("0%");
  });

  it("handles zero and full pedal extremes", () => {
    const zero = renderOriginal({
      ...readyModel,
      throttle: 0,
      brake: 0,
      clutch: 0,
      throttleText: "0%",
      brakeText: "0%",
      clutchText: "0%",
    });
    for (const fill of zero.root.querySelectorAll(".vo-pedals-fill")) {
      expect((fill as HTMLElement).style.height).toBe("0%");
    }
    cleanup();

    const full = renderOriginal({
      ...readyModel,
      throttle: 1,
      brake: 1,
      clutch: 1,
      throttleText: "100%",
      brakeText: "100%",
      clutchText: "100%",
    });
    for (const fill of full.root.querySelectorAll(".vo-pedals-fill")) {
      expect((fill as HTMLElement).style.height).toBe("100%");
    }
  });

  it("shows deterministic unavailable presentations", () => {
    for (const status of ["missing", "stale", "disconnected"] as const) {
      const { root } = renderOriginal({ ...readyModel, status, throttle: 0, brake: 0, clutch: 0 });
      expect(root.getAttribute("data-status")).toBe(status);
      cleanup();
    }

    const { root } = renderOriginal({
      ...readyModel,
      status: "error",
      statusMessage: "telemetry unavailable",
      throttle: 0,
      brake: 0,
      clutch: 0,
    });
    expect(root.getAttribute("data-status")).toBe("error");
    expect(root.querySelector(".vo-pedals-status-message")?.textContent).toBe("telemetry unavailable");
  });

  it("consumes pedal color and transparent background settings", () => {
    const colored = renderOriginal(readyModel, {
      ...defaultSettings,
      pedalThrottleColor: "#111111",
      pedalBrakeColor: "#222222",
      pedalClutchColor: "#333333",
    });
    expect(
      (colored.root.querySelector('[data-pedal="throttle"] .vo-pedals-fill') as HTMLElement).style
        .background,
    ).toBe("#111111");
    expect(
      (colored.root.querySelector('[data-pedal="brake"] .vo-pedals-fill') as HTMLElement).style
        .background,
    ).toBe("#222222");
    expect(
      (colored.root.querySelector('[data-pedal="clutch"] .vo-pedals-fill') as HTMLElement).style
        .background,
    ).toBe("#333333");
    cleanup();

    const opaque = renderOriginal(readyModel, { ...defaultSettings, transparentBackground: false });
    expect(opaque.root.getAttribute("data-transparent")).toBe("false");
    cleanup();

    const transparent = renderOriginal(readyModel, { ...defaultSettings, transparentBackground: true });
    expect(transparent.root.getAttribute("data-transparent")).toBe("true");
  });

  it("does not render editor controls", () => {
    const { root } = renderOriginal(readyModel);
    expect(root.querySelector("button")).toBeNull();
    expect(root.querySelector("input")).toBeNull();
    expect(root.querySelector("textarea")).toBeNull();
    expect(root.querySelector("[contenteditable='true']")).toBeNull();
  });

  it("does not import forbidden runtime dependencies", () => {
    const source = readFileSync(resolve(testDir, "PedalsOriginal.tsx"), "utf8");
    expect(source).not.toMatch(/@wailsio\/runtime/);
    expect(source).not.toMatch(/telemetry-store/);
    expect(source).not.toMatch(/getTelemetryRef/);
    expect(source).not.toMatch(/profile-document/);
  });
});