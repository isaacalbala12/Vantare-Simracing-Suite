import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { DeltaViewModel } from "../../../widget-types/delta/delta-view-model";
import { DeltaCrystal } from "./DeltaCrystal";

const testDir = dirname(fileURLToPath(import.meta.url));

afterEach(() => cleanup());

const readyGaining: DeltaViewModel = {
  type: "delta",
  status: "ready",
  tone: "gaining",
  deltaText: "-0.245",
  lastLapText: "1:31.221",
  bestLapText: "1:30.876",
  progress: -0.1225,
};

const readyLosing: DeltaViewModel = {
  ...readyGaining,
  tone: "losing",
  deltaText: "+0.380",
  progress: 0.19,
};

const readyNeutral: DeltaViewModel = {
  ...readyGaining,
  tone: "neutral",
  deltaText: "0.000",
  progress: 0,
};

const unavailable = (status: DeltaViewModel["status"], statusMessage?: string): DeltaViewModel => ({
  type: "delta",
  status,
  statusMessage,
  tone: "neutral",
  deltaText: "—",
  lastLapText: "—",
  bestLapText: "—",
  progress: 0,
});

function renderCrystal(
  model: DeltaViewModel,
  settings: Readonly<Record<string, unknown>> = { showHeader: true },
) {
  const view = render(<DeltaCrystal model={model} settings={settings} renderMode="harness" />);
  const root = view.container.querySelector('[data-widget-system="vantare-crystal"]') as HTMLElement;
  return { root, view };
}

describe("DeltaCrystal", () => {
  it("exposes the Crystal system root and delta renderer marker", () => {
    const { root } = renderCrystal(readyGaining);
    expect(root).toBeTruthy();
    expect(root.getAttribute("data-widget-renderer")).toBe("delta");
    expect(root.getAttribute("data-status")).toBe("ready");
  });

  it("uses a structurally distinct Crystal composition", () => {
    const { root } = renderCrystal(readyGaining);
    expect(root.querySelector(".vc-delta-glow")).toBeTruthy();
    expect(root.querySelector(".vc-delta-material")).toBeTruthy();
    expect(root.querySelector(".vc-delta-meta")).toBeTruthy();
    expect(root.querySelector(".vc-delta-meter")).toBeTruthy();
    expect(root.querySelector(".vo-delta-header")).toBeNull();
    expect(root.querySelector(".vo-delta-track")).toBeNull();
  });

  it("renders gaining losing and neutral delta text from the model", () => {
    const gaining = renderCrystal(readyGaining);
    expect(gaining.root.querySelector(".vc-delta-value")?.textContent).toBe("-0.245");
    expect(gaining.root.querySelector(".vc-delta-value")?.getAttribute("data-tone")).toBe("gaining");
    cleanup();

    const losing = renderCrystal(readyLosing);
    expect(losing.root.querySelector(".vc-delta-value")?.textContent).toBe("+0.380");
    expect(losing.root.querySelector(".vc-delta-value")?.getAttribute("data-tone")).toBe("losing");
    cleanup();

    const neutral = renderCrystal(readyNeutral);
    expect(neutral.root.querySelector(".vc-delta-value")?.textContent).toBe("0.000");
    expect(neutral.root.querySelector(".vc-delta-value")?.getAttribute("data-tone")).toBe("neutral");
  });

  it("shows deterministic unavailable presentations", () => {
    for (const status of ["missing", "stale", "disconnected"] as const) {
      const { root } = renderCrystal(unavailable(status));
      expect(root.getAttribute("data-status")).toBe(status);
      expect(root.querySelector(".vc-delta-value")?.textContent).toBe("—");
      cleanup();
    }

    const { root } = renderCrystal(unavailable("error", "telemetry unavailable"));
    expect(root.getAttribute("data-status")).toBe("error");
    expect(root.querySelector(".vc-delta-status-message")?.textContent).toBe("telemetry unavailable");
  });

  it("renders best lap in meta and applies progress to the meter fill", () => {
    const { root } = renderCrystal(readyGaining);
    const meta = root.querySelector(".vc-delta-meta");
    expect(meta?.querySelector("span")?.textContent).toBe("DELTA");
    expect(meta?.querySelector("span:last-child")?.textContent).toBe("1:30.876");
    const fill = root.querySelector(".vc-delta-meter > span") as HTMLElement;
    expect(fill.style.getPropertyValue("--delta-progress")).toBe("-0.1225");
  });

  it("keeps functional text stable when cosmetic settings change", () => {
    const { root } = renderCrystal(readyGaining, { showHeader: false, glowIntensity: 0.8 });
    expect(root.querySelector(".vc-delta-value")?.textContent).toBe("-0.245");
    expect(root.querySelector(".vc-delta-meta")).toBeNull();
  });

  it("consumes the showHeader appearance control path", () => {
    const hidden = renderCrystal(readyGaining, { showHeader: false });
    expect(hidden.root.querySelector(".vc-delta-meta")).toBeNull();
    cleanup();

    const visible = renderCrystal(readyGaining, { showHeader: true });
    expect(visible.root.querySelector(".vc-delta-meta")).toBeTruthy();
  });

  it("does not render editor controls", () => {
    const { root } = renderCrystal(readyGaining);
    expect(root.querySelector("button")).toBeNull();
    expect(root.querySelector("input")).toBeNull();
    expect(root.querySelector("textarea")).toBeNull();
    expect(root.querySelector("[contenteditable='true']")).toBeNull();
  });

  it("does not import forbidden runtime dependencies", () => {
    const source = readFileSync(resolve(testDir, "DeltaCrystal.tsx"), "utf8");
    expect(source).not.toMatch(/@wailsio\/runtime/);
    expect(source).not.toMatch(/telemetry-store/);
    expect(source).not.toMatch(/getTelemetryRef/);
    expect(source).not.toMatch(/profile-document/);
  });
});