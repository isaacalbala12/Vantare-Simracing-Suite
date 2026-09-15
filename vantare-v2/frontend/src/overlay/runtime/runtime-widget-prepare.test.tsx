import { cleanup, render, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import { deltaDefinition } from "../widget-types/delta/delta-definition";
import { standingsDefinition } from "../widget-types/standings/standings-definition";
import { prepareWidgetVisualSettings } from "../core/widget-visual-settings";
import { RuntimeWidgetFrame } from "./RuntimeWidgetFrame";
import goldenV2Raw from "../../../../internal/telemetry/projection/overlayv2/testdata/overlay_v2_1.golden.json?raw";
import type { OverlayUpdateV2 } from "../../generated/telemetry";

// perf/round2 (F03): la preparacion estatica (parseContent + migracion/merge/
// parseSettings) depende solo de `widget`. Las notificaciones de telemetria no
// deben reejecutarla; este test cuenta las llamadas reales por notificacion.

vi.mock("../core/widget-visual-settings", async (importActual) => {
  const actual = await importActual<typeof import("../core/widget-visual-settings")>();
  return {
    ...actual,
    prepareWidgetVisualSettings: vi.fn(actual.prepareWidgetVisualSettings),
  };
});

const prepMock = vi.mocked(prepareWidgetVisualSettings);

function createManualCoordinator() {
  let onFrame: () => void = () => undefined;
  let nowValue = 0;
  const coordinator = createTelemetryRateCoordinator({
    now: () => nowValue,
    createScheduler: () => ({
      start: (callback) => {
        onFrame = callback;
      },
      stop: () => undefined,
    }),
  });
  return {
    coordinator,
    tick: () => onFrame(),
    advance: (ms: number) => {
      nowValue += ms;
    },
  };
}

const update = JSON.parse(goldenV2Raw) as OverlayUpdateV2;

function publishFrame(coordinator: ReturnType<typeof createManualCoordinator>["coordinator"], sequence: number) {
  coordinator.setOverlayFrame(
    update.frame ? { ...update.frame, sequence } : undefined,
    update.source,
  );
}

beforeEach(() => {
  prepMock.mockClear();
});
afterEach(() => cleanup());

describe("RuntimeWidgetFrame static preparation", () => {
  it("prepares content and visual settings once while telemetry notifications re-render", () => {
    const { coordinator, tick, advance } = createManualCoordinator();
    coordinator.setOverlayFrame(update.frame ?? undefined, update.source);
    const parseContentSpy = vi.spyOn(deltaDefinition, "parseContent");

    const widget = deltaDefinition.createDefault("delta-prep-once");
    render(
      <RuntimeWidgetFrame
        widget={widget}
        profileId="profile-test"
        telemetry={coordinator}
        renderMode="desktop"
      />,
    );
    expect(prepMock).toHaveBeenCalledTimes(1);
    expect(parseContentSpy).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 10; i += 1) {
      act(() => {
        publishFrame(coordinator, (update.frame?.sequence ?? 0) + i + 1);
        advance(1_000);
        tick();
      });
    }
    expect(prepMock).toHaveBeenCalledTimes(1);
    expect(parseContentSpy).toHaveBeenCalledTimes(1);
    coordinator.dispose();
  });

  it("recomputes preparation when the widget config object changes", () => {
    const { coordinator } = createManualCoordinator();
    coordinator.setOverlayFrame(update.frame ?? undefined, update.source);
    const widget = deltaDefinition.createDefault("delta-prep-change");
    const view = render(
      <RuntimeWidgetFrame
        widget={widget}
        profileId="profile-test"
        telemetry={coordinator}
        renderMode="desktop"
      />,
    );
    expect(prepMock).toHaveBeenCalledTimes(1);

    const edited = { ...widget, content: { reference: "session-best" } };
    view.rerender(
      <RuntimeWidgetFrame
        widget={edited}
        profileId="profile-test"
        telemetry={coordinator}
        renderMode="desktop"
      />,
    );
    expect(prepMock).toHaveBeenCalledTimes(2);
    coordinator.dispose();
  });

  it("invalidates for every widget input and recovers from invalid settings", () => {
    const { coordinator } = createManualCoordinator();
    coordinator.setOverlayFrame(update.frame ?? undefined, update.source);
    const widget = deltaDefinition.createDefault("delta-prep-inputs");
    const view = render(
      <RuntimeWidgetFrame widget={widget} profileId="profile-test" telemetry={coordinator} renderMode="desktop" />,
    );
    expect(prepMock).toHaveBeenCalledTimes(1);

    const variants = [
      standingsDefinition.createDefault("standings-prep-type"),
      { ...widget, content: { reference: "session-best" } },
      { ...widget, visual: { ...widget.visual, systemId: "vantare-crystal" as const } },
      { ...widget, visual: { ...widget.visual, systemVersion: widget.visual.systemVersion + 1 } },
      { ...widget, visual: { ...widget.visual, configVersion: widget.visual.configVersion + 1 } },
      { ...widget, visual: { ...widget.visual, baseSettings: { ...widget.visual.baseSettings, accentColor: "#fff" } } },
      { ...widget, visual: { ...widget.visual, appearanceOverrides: { accentColor: "#0ff" } } },
      { ...widget, layout: { ...widget.layout, x: widget.layout.x + 1 } },
    ];
    for (const variant of variants) {
      view.rerender(
        <RuntimeWidgetFrame widget={variant} profileId="profile-test" telemetry={coordinator} renderMode="desktop" />,
      );
    }
    expect(prepMock).toHaveBeenCalledTimes(variants.length + 1);

    const diagnostics: string[] = [];
    const invalid = { ...widget, visual: { ...widget.visual, systemId: "not-real" as typeof widget.visual.systemId } };
    view.rerender(
      <RuntimeWidgetFrame
        widget={invalid}
        profileId="profile-test"
        telemetry={coordinator}
        renderMode="desktop"
        onDiagnostic={(diagnostic) => diagnostics.push(diagnostic.code)}
      />,
    );
    expect(diagnostics).toContain("unsupported-visual-pair");
    view.rerender(
      <RuntimeWidgetFrame
        widget={widget}
        profileId="profile-test"
        telemetry={coordinator}
        renderMode="desktop"
      />,
    );
    expect(prepMock).toHaveBeenCalledTimes(variants.length + 3);
    expect(view.container.querySelector("[data-testid='widget-host-diagnostic']")).toBeNull();

    const second = standingsDefinition.createDefault("standings-prep-inputs");
    view.rerender(
      <RuntimeWidgetFrame widget={second} profileId="profile-test" telemetry={coordinator} renderMode="desktop" />,
    );
    expect(prepMock).toHaveBeenCalledTimes(variants.length + 4);
    coordinator.dispose();
  });
});
