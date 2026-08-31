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
      { id: "player-1", position: 1, classPosition: 1, gap: { q: "missing" }, bestLap: fresh(90), lastLap: fresh(92.123), lapDistance: fresh(500), groundPosition: { q: "missing" }, driver: "Player", classId: "HYPERCAR", pit: "none" },
      { id: "car-2", position: 2, classPosition: 2, gap: fresh(1.5), bestLap: fresh(89.5), lastLap: fresh(91.8), lapDistance: fresh(510), groundPosition: { q: "missing" }, driver: "ALO", classId: "HYPERCAR", pit: "none" },
    ],
    relative: [
      { id: "car-2", position: 2, gap: fresh(1.2), groundPosition: { q: "fresh", v: { x: 10, z: 0 } }, lastLap: fresh(91.8), side: "ahead", authority: "native", name: "ALO", classId: "HYPERCAR" },
      { id: "player-1", position: 1, gap: fresh(0), groundPosition: { q: "fresh", v: { x: 0, z: 0 } }, lastLap: fresh(92.123), side: "player", authority: "native", name: "Player", classId: "HYPERCAR" },
      { id: "car-3", position: 3, gap: fresh(-0.8), groundPosition: { q: "fresh", v: { x: -10, z: 0 } }, lastLap: fresh(93), side: "behind", authority: "native", name: "VER", classId: "HYPERCAR" },
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
  it("monta dos Relative con estado productivo aislado por instancia", () => {
    const first = relativeDefinition.createDefault("relative-a");
    const second = relativeDefinition.createDefault("relative-b");
    const frame = makeFrame();
    const spy = vi.spyOn(relativeV2, "buildRelativeViewModelV2");
    let nowMs = 0;

    const view = render(<>
      <WidgetVisualHost widget={first} renderMode="harness" runtime={{ overlayV2Frame: frame, overlayV2Source: source, relativeViewModelNowMs: () => nowMs }} />
      <WidgetVisualHost widget={second} renderMode="harness" runtime={{ overlayV2Frame: frame, overlayV2Source: source, relativeViewModelNowMs: () => nowMs }} />
    </>);

    const firstOptions = spy.mock.calls[0]?.[3];
    const secondOptions = spy.mock.calls[1]?.[3];
    expect(firstOptions?.state).toBeDefined();
    expect(secondOptions?.state).toBeDefined();
    expect(firstOptions?.state).not.toBe(secondOptions?.state);
    expect(firstOptions?.instanceKey).toBe(`harness:${first.id}`);
    expect(secondOptions?.instanceKey).toBe(`harness:${second.id}`);

    nowMs = 100;
    view.rerender(<>
      <WidgetVisualHost widget={first} renderMode="harness" runtime={{ overlayV2Frame: { ...frame, sequence: 2 }, overlayV2Source: source, relativeViewModelNowMs: () => nowMs }} />
      <WidgetVisualHost widget={second} renderMode="harness" runtime={{ overlayV2Frame: frame, overlayV2Source: source, relativeViewModelNowMs: () => nowMs }} />
    </>);
    expect(spy.mock.calls[2]?.[3]?.state).toBe(firstOptions?.state);
    expect(spy.mock.calls[3]?.[3]?.state).toBe(secondOptions?.state);
    spy.mockRestore();
  });

  it("mantiene el hold al recrear el objeto del mismo widget y resetea al cambiar de perfil", () => {
    const widget = relativeDefinition.createDefault("relative-stable-id");
    const frame = makeFrame();
    const oldRow = { ...frame.relative[0]!, id: "old-ahead", name: "OLD" };
    const newRow = { ...frame.relative[0]!, id: "new-ahead", name: "NEW" };
    const farRow = { ...frame.relative[0]!, id: "far-ahead", name: "FAR" };
    const player = frame.relative.find((row) => row.side === "player")!;
    const firstFrame = { ...frame, relative: [farRow, newRow, oldRow, player] };
    const changedFrame = { ...frame, sequence: 2, relative: [farRow, oldRow, newRow, player] };
    let nowMs = 0;
    const runtime = (profileId: string, overlayV2Frame: OverlayFrameV2) => ({
      overlayV2Frame,
      overlayV2Source: source,
      relativeViewModelNowMs: () => nowMs,
      relativeViewModelInstanceKey: `${profileId}:${widget.id}`,
    });
    const view = render(
      <WidgetVisualHost widget={widget} renderMode="harness" runtime={runtime("profile-a", firstFrame)} />,
    );

    nowMs = 1;
    view.rerender(
      <WidgetVisualHost widget={{ ...widget }} renderMode="harness" runtime={runtime("profile-a", changedFrame)} />,
    );
    expect([...view.container.querySelectorAll("[data-relative-row]")].map((row) => row.getAttribute("data-relative-row"))).toEqual([
      "new-ahead", "old-ahead", "player-1",
    ]);

    view.rerender(
      <WidgetVisualHost widget={{ ...widget }} renderMode="harness" runtime={runtime("profile-b", changedFrame)} />,
    );
    expect([...view.container.querySelectorAll("[data-relative-row]")].map((row) => row.getAttribute("data-relative-row"))).toEqual([
      "old-ahead", "new-ahead", "player-1",
    ]);
  });

  it.each(cases)("[$type] usa VM v2 por defecto cuando frame y source están presentes", ({ definition, spyModule, spyName, feature }) => {
    const widget = (definition.createDefault as (id: string) => { id: string; type: string })("v2-case-" + feature);
    const frame = makeFrame();

    const spy = vi.spyOn(spyModule as never, spyName as never);

    render(
      <WidgetVisualHost
        widget={widget as never}
        snapshot={snapshot}
        renderMode="harness"
        runtime={{ overlayV2Frame: frame, overlayV2Source: source } as never}
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

  it("sin frame v2 todavía no ejecuta el builder v2", () => {
    const widget = standingsDefinition.createDefault("no-frame");
    const spy = vi.spyOn(standingsV2, "buildStandingsViewModelV2");
    render(
      <WidgetVisualHost
        widget={widget as never}
        snapshot={snapshot}
        renderMode="harness"
        runtime={{ overlayV2Source: source } as never}
      />,
    );
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    cleanup();
  });

  it("hace visible y terminal un frame inválido sin ejecutar V1 ni el renderer", () => {
    const widget = standingsDefinition.createDefault("invalid-frame");
    const view = render(
      <WidgetVisualHost
        widget={widget}
        snapshot={snapshot}
        renderMode="desktop"
        runtime={{
          overlayV2Failure: { code: "invalid-frame", message: "overlay-frame-v2:invalid-contract:frame" },
        }}
      />,
    );

    expect(view.getByRole("alert").textContent).toContain("invalid-contract:frame");
    expect(view.getByRole("alert").getAttribute("data-diagnostic-code")).toBe("overlay-v2-invalid-frame");
    expect(view.container.querySelector('[data-widget-renderer="standings"]')).toBeNull();
  });

  it("hace visible y terminal la ausencia de frame cuando V2 es autoridad", () => {
    const widget = standingsDefinition.createDefault("missing-frame");
    const view = render(
      <WidgetVisualHost
        widget={widget}
        snapshot={snapshot}
        renderMode="obs"
        runtime={{ overlayV2Source: source }}
      />,
    );

    expect(view.getByRole("alert").textContent).toBe("Overlay V2 frame unavailable");
    expect(view.getByRole("alert").getAttribute("data-diagnostic-code")).toBe("overlay-v2-frame-missing");
  });

  it("mantiene el widget stale renderizado y añade un diagnóstico visible", () => {
    const widget = standingsDefinition.createDefault("stale-frame");
    const view = render(
      <WidgetVisualHost
        widget={widget}
        snapshot={snapshot}
        renderMode="studio"
        runtime={{
          overlayV2Frame: makeFrame(),
          overlayV2Source: { state: "stale", ageMs: 2_500 },
        }}
      />,
    );

    expect(view.getByRole("alert").textContent).toBe("Overlay V2 stale (2500 ms)");
    expect(view.getByRole("alert").getAttribute("data-diagnostic-code")).toBe("overlay-v2-stale");
    expect(view.container.querySelector('[data-widget-renderer="standings"]')).toBeTruthy();
  });

  it("hace visible y terminal el error de source aunque conserve el último frame", () => {
    const widget = standingsDefinition.createDefault("source-error");
    const view = render(
      <WidgetVisualHost
        widget={widget}
        snapshot={snapshot}
        renderMode="desktop"
        runtime={{
          overlayV2Frame: makeFrame(),
          overlayV2Source: { state: "error", reason: "LMU projection stopped" },
        }}
      />,
    );

    expect(view.getByRole("alert").textContent).toBe("LMU projection stopped");
    expect(view.getByRole("alert").getAttribute("data-diagnostic-code")).toBe("overlay-v2-source-error");
    expect(view.container.querySelector('[data-widget-renderer="standings"]')).toBeNull();
  });
});
