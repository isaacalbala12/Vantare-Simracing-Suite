import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { DeltaViewModel } from "../../../widget-types/delta/delta-view-model";
import { DeltaOriginal } from "./DeltaOriginal";

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

function renderOriginal(
  model: DeltaViewModel,
  settings: Readonly<Record<string, unknown>> = { showHeader: true },
) {
  const view = render(<DeltaOriginal model={model} settings={settings} renderMode="harness" />);
  const root = view.container.querySelector('[data-widget-system="vantare-original"]') as HTMLElement;
  return { root, view };
}

describe("DeltaOriginal", () => {
  it("exposes the Original system root and delta renderer marker", () => {
    const { root } = renderOriginal(readyGaining);
    expect(root).toBeTruthy();
    expect(root.getAttribute("data-widget-renderer")).toBe("delta");
    expect(root.getAttribute("data-status")).toBe("ready");
  });

  it("renders gaining losing and neutral delta text from the model", () => {
    const gaining = renderOriginal(readyGaining);
    expect(gaining.root.querySelector(".vo-delta-value")?.textContent).toBe("-0.245");
    expect(gaining.root.querySelector(".vo-delta-value")?.getAttribute("data-tone")).toBe("gaining");
    cleanup();

    const losing = renderOriginal(readyLosing);
    expect(losing.root.querySelector(".vo-delta-value")?.textContent).toBe("+0.380");
    expect(losing.root.querySelector(".vo-delta-value")?.getAttribute("data-tone")).toBe("losing");
    cleanup();

    const neutral = renderOriginal(readyNeutral);
    expect(neutral.root.querySelector(".vo-delta-value")?.textContent).toBe("0.000");
    expect(neutral.root.querySelector(".vo-delta-value")?.getAttribute("data-tone")).toBe("neutral");
  });

  it("shows deterministic unavailable presentations", () => {
    for (const status of ["missing", "stale", "disconnected"] as const) {
      const { root } = renderOriginal(unavailable(status));
      expect(root.getAttribute("data-status")).toBe(status);
      expect(root.querySelector(".vo-delta-value")?.textContent).toBe("—");
      cleanup();
    }

    const { root } = renderOriginal(unavailable("error", "telemetry unavailable"));
    expect(root.getAttribute("data-status")).toBe("error");
    expect(root.querySelector(".vo-delta-status-message")?.textContent).toBe("telemetry unavailable");
  });

  it("renders last lap in the header and applies progress to the track fill", () => {
    const { root } = renderOriginal(readyGaining);
    expect(root.querySelector(".vo-delta-label")?.textContent).toBe("DELTA");
    expect(root.querySelector(".vo-delta-last-lap")?.textContent).toBe("1:31.221");
    const fill = root.querySelector(".vo-delta-fill") as HTMLElement;
    expect(fill.style.getPropertyValue("--delta-progress")).toBe("-0.1225");
  });

  it("keeps functional text stable when cosmetic settings change", () => {
    const { root } = renderOriginal(readyGaining, { showHeader: false, accent: "purple" });
    expect(root.querySelector(".vo-delta-value")?.textContent).toBe("-0.245");
    expect(root.querySelector(".vo-delta-header")).toBeNull();
  });

  it("does not render editor controls", () => {
    const { root } = renderOriginal(readyGaining);
    expect(root.querySelector("button")).toBeNull();
    expect(root.querySelector("input")).toBeNull();
    expect(root.querySelector("textarea")).toBeNull();
    expect(root.querySelector("[contenteditable='true']")).toBeNull();
  });

  it("does not import forbidden runtime dependencies", () => {
    const source = readFileSync(resolve(testDir, "DeltaOriginal.tsx"), "utf8");
    expect(source).not.toMatch(/@wailsio\/runtime/);
    expect(source).not.toMatch(/telemetry-store/);
    expect(source).not.toMatch(/getTelemetryRef/);
    expect(source).not.toMatch(/profile-document/);
  });
});