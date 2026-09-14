import { readFileSync } from "node:fs";
import path from "node:path";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OverlayUpdateV2 } from "../../generated/telemetry";
import {
  createOverlayFrameV2Store,
  OVERLAY_V2_SNAPSHOT_EVENT,
} from "../../telemetry-transport/overlay-frame-v2-store";
import { bindOverlayV2Coordinator } from "../core/overlay-v2-coordinator-binding";
import type { ProfileDocumentV3 } from "../core/profile-document";
import {
  createTelemetryRateCoordinator,
  type TelemetryScheduler,
} from "../core/telemetry-rate-coordinator";
import { standingsDefinition } from "../widget-types/standings/standings-definition";
import { getOverlayV2ViewModelEntry } from "../core/overlay-v2-view-models";
import { RuntimeOverlaySurface } from "./RuntimeOverlaySurface";

const originalResizeObserver = globalThis.ResizeObserver;

function schedulerHarness() {
  let paint: (() => void) | undefined;
  return {
    create(): TelemetryScheduler {
      return {
        start(next) { paint = next; },
        stop() { paint = undefined; },
      };
    },
    tick() { paint?.(); },
  };
}

function documentWithStandings(x = 64): ProfileDocumentV3 {
  const widget = standingsDefinition.createDefault("standings-performance");
  widget.layout = { ...widget.layout, x };
  return {
    schemaVersion: 3,
    id: "performance-integration",
    name: "Performance integration",
    displayMode: "racing",
    monitorIndex: 0,
    layoutViewport: { width: 1920, height: 1080 },
    layouts: { general: { type: "general", widgets: [widget] } },
  };
}

function golden(): OverlayUpdateV2 {
  return JSON.parse(readFileSync(path.resolve(
    process.cwd(),
    "../internal/telemetry/projection/overlayv2/testdata/overlay_v2_1.golden.json",
  ), "utf8")) as OverlayUpdateV2;
}

function updateFor(sequence: number, level: 1 | 5): OverlayUpdateV2 {
  const update = golden();
  if (!update.frame) throw new Error("golden frame missing");
  return {
    ...update,
    revision: sequence,
    source: { state: "live" },
    frame: {
      ...update.frame,
      sequence,
      capabilities: {
        ...update.frame.capabilities,
        performance: {
          level,
          mode: "manual",
          effects: "full",
          rafCap: level === 1 ? null : 20,
          widgetHz: level === 1 ? {} : { standings: 2 },
          sourceHz: 60,
        },
      },
    },
  };
}

beforeEach(() => {
  globalThis.ResizeObserver = class {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element): void {
      this.callback(
        [{ target, contentRect: { width: 1920, height: 1080 } } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
    disconnect(): void {}
    unobserve(): void {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  globalThis.ResizeObserver = originalResizeObserver;
  vi.restoreAllMocks();
});

describe("store → RuntimeOverlaySurface → renderer", () => {
  it.each([
    [5 as const, 2],
    [1 as const, 60],
  ])("limits Standings renders for level %i", (level, expectedRenders) => {
    const harness = schedulerHarness();
    let currentTime = 0;
    const coordinator = createTelemetryRateCoordinator({
      createScheduler: harness.create,
      now: () => currentTime,
    });
    const store = createOverlayFrameV2Store();
    const unbind = bindOverlayV2Coordinator(store, coordinator);
    const renderStandings = vi.spyOn(getOverlayV2ViewModelEntry("standings")!, "buildViewModelV2");
    const view = render(
      <RuntimeOverlaySurface
        document={documentWithStandings()}
        telemetry={coordinator}
        renderMode="desktop"
      />,
    );
    renderStandings.mockClear();

    for (let frame = 1; frame <= 60; frame += 1) {
      currentTime = (frame - 1) * (1_000 / 60);
      act(() => {
        store.ingest(OVERLAY_V2_SNAPSHOT_EVENT, updateFor(frame, level));
        harness.tick();
      });
    }

    expect(renderStandings).toHaveBeenCalledTimes(expectedRenders);
    expect(view.getByTestId("runtime-widget-frame")).toBeTruthy();
    unbind();
    store.dispose();
    coordinator.dispose();
  });

  it("repaints immediately when the profile layout changes", () => {
    const harness = schedulerHarness();
    const coordinator = createTelemetryRateCoordinator({ createScheduler: harness.create });
    const update = golden();
    coordinator.setOverlayFrame(update.frame ?? undefined, update.source);
    const renderStandings = vi.spyOn(getOverlayV2ViewModelEntry("standings")!, "buildViewModelV2");
    const view = render(
      <RuntimeOverlaySurface
        document={documentWithStandings(64)}
        telemetry={coordinator}
        renderMode="desktop"
      />,
    );
    renderStandings.mockClear();

    view.rerender(
      <RuntimeOverlaySurface
        document={documentWithStandings(180)}
        telemetry={coordinator}
        renderMode="desktop"
      />,
    );

    expect(renderStandings).toHaveBeenCalledTimes(1);
    expect((view.getByTestId("runtime-widget-frame") as HTMLElement).style.left).toBe("180px");
    coordinator.dispose();
  });
});
