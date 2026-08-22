import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMockTelemetry } from "./mock-scenarios";
import type { OverlayFrameV2, OverlaySourceStatusV2 } from "../../generated/telemetry";
import { WidgetVisualHost } from "./WidgetVisualHost";
import { standingsDefinition } from "../widget-types/standings/standings-definition";
import { relativeDefinition } from "../widget-types/relative/relative-definition";
import { deltaDefinition } from "../widget-types/delta/delta-definition";
import { fuelStrategyDefinition } from "../widget-types/fuel-strategy/fuel-strategy-definition";
import { pedalsTelemetryDefinition } from "../widget-types/pedals-telemetry/pedals-telemetry-definition";
import { inputTelemetryDefinition } from "../widget-types/input-telemetry/input-telemetry-definition";
import { racingFlagsDefinition } from "../widget-types/racing-flags/racing-flags-definition";
import * as standingsV2 from "../widget-types/standings/standings-view-model-v2";
import * as relativeV2 from "../widget-types/relative/relative-view-model-v2";
import * as deltaV2 from "../widget-types/delta/delta-view-model-v2";
import * as fuelV2 from "../widget-types/fuel-strategy/fuel-strategy-view-model-v2";
import * as pedalsV2 from "../widget-types/pedals-telemetry/pedals-telemetry-view-model-v2";
import * as inputV2 from "../widget-types/input-telemetry/input-telemetry-view-model-v2";
import * as racingV2 from "../widget-types/racing-flags/racing-flags-view-model-v2";

afterEach(() => cleanup());

const snapshot = buildMockTelemetry({ session: "race", location: "track", state: "ready" });

function makeFrame(): OverlayFrameV2 {
  const missing = { q: "missing" as const };
  const fresh = (v: number) => ({ v, q: "fresh" as const });
  const frame: OverlayFrameV2 = {
    contract: 2,
    algorithm: 1,
    epoch: 1,
    sequence: 1,
    sessionId: "fixture-777",
    generatedAt: "2026-08-19T12:00:00Z",
    units: { speed: "mps", temperature: "celsius", pressure: "kpa", fuel: "liters" },
    session: {
      track: { v: "Spa", q: "fresh" },
      phase: { v: "race", q: "fresh" },
      flag: { v: "green", q: "fresh" },
      remaining: fresh(3600),
      maxLaps: fresh(44),
    },
    player: {
      id: "player-1",
      speed: fresh(50),
      rpm: fresh(7200),
      gear: fresh(4),
      throttle: fresh(0.8),
      brake: fresh(0.1),
      clutch: fresh(0),
      steering: missing,
    },
    standings: [
      { id: "player-1", position: 1, classPosition: 1, gap: { q: "missing" }, lastLap: fresh(92.123), driver: "Player", classId: "HYPERCAR", pit: "none" },
      { id: "car-2", position: 2, classPosition: 2, gap: fresh(1.5), lastLap: fresh(91.8), driver: "ALO", classId: "HYPERCAR", pit: "none" },
    ],
    relative: [
      { id: "car-2", gap: fresh(-1.2), side: "ahead", authority: "native", name: "ALO", classId: "HYPERCAR" },
      { id: "player-1", gap: fresh(0), side: "player", authority: "native", name: "Player", classId: "HYPERCAR" },
      { id: "car-3", gap: fresh(0.8), side: "behind", authority: "native", name: "VER", classId: "HYPERCAR" },
    ],
    delta: { seconds: fresh(-0.42), available: ["personal-best"], reference: "personal-best", requested: "personal-best" },
    fuel: { remaining: fresh(22.5), capacity: fresh(110), perLap: fresh(2.3), estimatedLaps: fresh(9) },
    controls: {
      history: {
        q: "fresh" as const,
        windowMs: 3000,
        throttle: [800, 820, 790],
        brake: [100, 90, 110],
        clutch: [0, 0, 0],
      },
    },
    spotter: { mode: "none", left: missing, right: missing },
    capabilities: { supported: ["controls"], available: { controls: "fresh" }, modes: { spatial: [], delta: [], standings: "none", gaps: "none" } },
  };
  return frame;
}

const source: OverlaySourceStatusV2 = { state: "live" };

type Case = {
  type: string;
  feature: string;
  definition: { createDefault: (id: string) => never };
  spyModule: Record<string, unknown>;
  spyName: string;
};

const cases: Case[] = [
  { type: "standings", feature: "standings", definition: standingsDefinition as unknown as Case["definition"], spyModule: standingsV2 as unknown as Record<string, unknown>, spyName: "buildStandingsViewModelV2" },
  { type: "relative", feature: "relative", definition: relativeDefinition as unknown as Case["definition"], spyModule: relativeV2 as unknown as Record<string, unknown>, spyName: "buildRelativeViewModelV2" },
  { type: "delta", feature: "delta", definition: deltaDefinition as unknown as Case["definition"], spyModule: deltaV2 as unknown as Record<string, unknown>, spyName: "buildDeltaViewModelV2" },
  { type: "fuel-strategy", feature: "fuel", definition: fuelStrategyDefinition as unknown as Case["definition"], spyModule: fuelV2 as unknown as Record<string, unknown>, spyName: "buildFuelStrategyViewModelV2" },
  { type: "pedals-telemetry", feature: "player-instruments", definition: pedalsTelemetryDefinition as unknown as Case["definition"], spyModule: pedalsV2 as unknown as Record<string, unknown>, spyName: "buildPedalsTelemetryViewModelV2" },
  { type: "input-telemetry", feature: "controls", definition: inputTelemetryDefinition as unknown as Case["definition"], spyModule: inputV2 as unknown as Record<string, unknown>, spyName: "buildInputTelemetryViewModelV2" },
  { type: "racing-flags", feature: "session", definition: racingFlagsDefinition as unknown as Case["definition"], spyModule: racingV2 as unknown as Record<string, unknown>, spyName: "buildRacingFlagsViewModelV2" },
];

describe("WidgetVisualHost v2 generic registry", () => {
  it.each(cases)("[$type] con feature off usa VM v1 y con feature on usa VM v2 (frame v2 fixture)", ({ definition, spyModule, spyName, feature }) => {
    const widget = (definition.createDefault as (id: string) => { id: string; type: string })("v2-case-" + feature);
    const frame = makeFrame();

    const spy = vi.spyOn(spyModule as never, spyName as never);

    // off: no feature -> v1, spy no llamado
    render(
      <WidgetVisualHost
        widget={widget as never}
        snapshot={snapshot}
        renderMode="harness"
        runtime={{ overlayV2Frame: frame, overlayV2Source: source } as never}
      />,
    );
    expect(spy).not.toHaveBeenCalled();
    cleanup();

    // on: feature activa -> v2, spy llamado una vez con frame, source, content
    spy.mockClear();
    render(
      <WidgetVisualHost
        widget={widget as never}
        snapshot={snapshot}
        renderMode="harness"
        runtime={{ overlayV2Frame: frame, overlayV2Source: source, overlayV2Features: [feature] } as never}
      />,
    );
    expect(spy).toHaveBeenCalledTimes(1);
    const call = (spy.mock.calls[0] as unknown[])!;
    expect(call[0]).toBe(frame);
    expect(call[1]).toBe(source);
    if ((widget as { type: string }).type !== "delta") {
      expect(call[2]).toBeDefined();
    }

    spy.mockRestore();
    cleanup();
  });

  it("con frame v2 pero sin source no usa v2", () => {
    const widget = standingsDefinition.createDefault("no-source");
    const frame = makeFrame();
    const spy = vi.spyOn(standingsV2, "buildStandingsViewModelV2");
    render(
      <WidgetVisualHost
        widget={widget as never}
        snapshot={snapshot}
        renderMode="harness"
        runtime={{ overlayV2Frame: frame, overlayV2Features: ["standings"] } as never}
      />,
    );
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    cleanup();
  });

  it("sin frame v2 no usa v2 aunque feature este on", () => {
    const widget = standingsDefinition.createDefault("no-frame");
    const spy = vi.spyOn(standingsV2, "buildStandingsViewModelV2");
    render(
      <WidgetVisualHost
        widget={widget as never}
        snapshot={snapshot}
        renderMode="harness"
        runtime={{ overlayV2Source: source, overlayV2Features: ["standings"] } as never}
      />,
    );
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    cleanup();
  });
});
