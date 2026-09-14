import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DesignSystemId, WidgetInstanceV3 } from "./profile-document";
import { DesignSystemResolutionError } from "./design-system-definition";
import { designSystemRegistry } from "./design-system-registry";
import { deltaDefinition } from "../widget-types/delta/delta-definition";
import { WidgetVisualHost } from "./WidgetVisualHost";
import { engineerRadioDefinition } from "../widget-types/engineer-radio/engineer-radio-definition";
import { pedalsTelemetryDefinition } from "../widget-types/pedals-telemetry/pedals-telemetry-definition";
import { raceScheduleDefinition } from "../widget-types/race-schedule/race-schedule-definition";
import type { OverlayFrameV2 } from "../../generated/telemetry";

afterEach(() => cleanup());

function buildWidget(systemId: DesignSystemId): WidgetInstanceV3 {
  const widget = deltaDefinition.createDefault("delta-host");
  widget.visual = {
    ...widget.visual,
    systemId,
  };
  return widget;
}

describe("WidgetVisualHost", () => {
  it("resolves different renderer roots for Original and Crystal", () => {
    const runtime = { overlayV2Frame: playerFrameV2(), overlayV2Source: { state: "live" as const } };
    const original = render(
      <WidgetVisualHost widget={buildWidget("vantare-original")} renderMode="harness" runtime={runtime} />,
    );
    expect(
      original.container.querySelector('[data-widget-system="vantare-original"]'),
    ).toBeTruthy();
    cleanup();

    const crystal = render(
      <WidgetVisualHost widget={buildWidget("vantare-crystal")} renderMode="harness" runtime={runtime} />,
    );
    expect(crystal.container.querySelector('[data-widget-system="vantare-crystal"]')).toBeTruthy();
  });

  it("feeds identical Delta view model values to both systems", () => {
    const frame = {
      ...playerFrameV2(),
      delta: {
        ...playerFrameV2().delta,
        seconds: { v: -0.42, q: "fresh" as const },
        history: { q: "missing" as const },
        available: ["personal-best"],
        reference: "personal-best",
        requested: "personal-best",
      },
    };
    const runtime = { overlayV2Frame: frame, overlayV2Source: { state: "live" as const } };
    const original = render(
      <WidgetVisualHost widget={buildWidget("vantare-original")} renderMode="harness" runtime={runtime} />,
    );
    const originalValue = original.container.querySelector(".vo-delta-value")?.textContent;
    cleanup();

    const crystal = render(
      <WidgetVisualHost widget={buildWidget("vantare-crystal")} renderMode="harness" runtime={runtime} />,
    );
    const crystalValue = crystal.container.querySelector(".vc-delta-bar-value")?.textContent;
    expect(originalValue).toBe("-0.420");
    expect(crystalValue).toBe("-0.42");
    expect(Number(crystalValue)).toBe(Number(originalValue));
  });

  it("reports unsupported visual pairs through diagnostics", () => {
    const onDiagnostic = vi.fn();
    const widget = buildWidget("vantare-crystal");
    vi.spyOn(designSystemRegistry, "resolve").mockImplementation(() => {
      throw new DesignSystemResolutionError(
        "vantare-crystal",
        1,
        "delta",
        "unsupported widget type for design system",
      );
    });

    const view = render(
      <WidgetVisualHost
        widget={widget}
        renderMode="studio"
        onDiagnostic={onDiagnostic}
      />,
    );
    expect(view.getByTestId("widget-host-diagnostic")).toBeTruthy();
    expect(onDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ code: "unsupported-visual-pair", surface: "studio" }),
    );
    vi.restoreAllMocks();
  });

  it("shows diagnostics for invalid content without mutating inputs", () => {
    const widget = buildWidget("vantare-original");
    widget.content = { unexpected: true };
    const view = render(
      <WidgetVisualHost widget={widget} renderMode="harness" />,
    );
    expect(view.getByTestId("widget-host-diagnostic")).toBeTruthy();
    expect(widget.content).toEqual({ unexpected: true });
  });

  it("keeps sibling hosts rendered when one host fails resolution", () => {
    const good = buildWidget("vantare-original");
    const bad = buildWidget("vantare-original");
    bad.content = { bad: true };
    const runtime = { overlayV2Frame: playerFrameV2(), overlayV2Source: { state: "live" as const } };
    const view = render(
      <>
        <WidgetVisualHost widget={bad} renderMode="harness" runtime={runtime} />
        <WidgetVisualHost widget={good} renderMode="harness" runtime={runtime} />
      </>,
    );
    expect(view.getAllByTestId("widget-host-diagnostic").length).toBe(1);
    expect(view.container.querySelector('[data-widget-system="vantare-original"]')).toBeTruthy();
  });

  it("does not change renderer selection across studio desktop and obs modes", () => {
    for (const renderMode of ["studio", "desktop", "obs"] as const) {
      const view = render(
        <WidgetVisualHost
          widget={buildWidget("vantare-original")}
          renderMode={renderMode}
          runtime={{ overlayV2Frame: playerFrameV2(), overlayV2Source: { state: "live" } }}
        />,
      );
      expect(view.container.querySelector('[data-widget-renderer="delta"]')).toBeTruthy();
      cleanup();
    }
  });

  it("shows a labelled Engineer fixture only in Studio and never fabricates runtime data", () => {
    const widget = engineerRadioDefinition.createDefault("engineer-preview");
    const studio = render(
      <WidgetVisualHost widget={widget} renderMode="studio" />,
    );
    expect(studio.container.querySelector('[data-engineer-radio-root][data-preview="true"]')).toBeTruthy();
    expect(studio.getByText("PREVIEW")).toBeTruthy();
    cleanup();

    const desktop = render(
      <WidgetVisualHost widget={widget} renderMode="desktop" />,
    );
    expect(desktop.container.querySelector("[data-engineer-radio-root]")).toBeNull();
  });

  it("recibe race-schedule exclusivamente por el canal auxiliar Calendar", () => {
    const widget = raceScheduleDefinition.createDefault("calendar-auxiliary");
    const view = render(
      <WidgetVisualHost widget={widget} renderMode="desktop" runtime={{
        raceScheduleStatus: "ready",
        raceScheduleEvents: [{
          id: "calendar-1",
          title: "Le Mans Virtual Cup",
          track: "Le Mans",
          startAt: "2026-09-01T18:00:00Z",
          durationMinutes: 60,
          classes: ["Hypercar"],
          status: "upcoming",
        }],
      }} />,
    );
    expect(view.getByText("Le Mans Virtual Cup")).toBeTruthy();
  });

  it("usa Overlay V2 por defecto, sin catálogo de features", () => {
    const widget = pedalsTelemetryDefinition.createDefault("pedals-v2");
    widget.content = { showPosition: false, showClutch: true };
    const frame = playerFrameV2();
    const view = render(
      <WidgetVisualHost widget={widget} renderMode="harness" runtime={{
        overlayV2Frame: frame,
        overlayV2Source: { state: "live" },
      }} />,
    );
    expect(view.container.querySelector(".vo-pedals-telemetry-values strong")?.textContent).toBe("180");
  });
});

function playerFrameV2(): OverlayFrameV2 {
  const missing = { q: "missing" as const };
  return {
    contract: 2,
    algorithm: 1,
    epoch: 1,
    sequence: 1,
    sessionId: "fixture",
    generatedAt: "2026-08-19T12:00:00Z",
    units: { speed: "mps", temperature: "celsius", pressure: "kpa", fuel: "liters" },
    session: { track: missing, phase: missing, flag: missing, remaining: missing, maxLaps: missing },
    player: {
      speed: { v: 50, q: "fresh" }, rpm: { v: 7_200, q: "fresh" }, gear: { v: 4, q: "fresh" },
      throttle: { v: 0.75, q: "fresh" }, brake: { v: 0.125, q: "fresh" }, clutch: { q: "fresh" }, steering: missing,
    },
    standings: [], relative: [],
    delta: { seconds: missing, available: [], history: missing },
    fuel: { remaining: missing, capacity: missing, perLap: missing, estimatedLaps: missing, history: missing, requiredFuel: missing, sessionLaps: missing },
    spotter: { mode: "none", left: missing, right: missing },
    capabilities: { supported: ["controls", "player-instruments"], available: { controls: "fresh", "player-instruments": "fresh" }, modes: { spatial: [], delta: [], standings: "none", gaps: "none" } },
  };
}
