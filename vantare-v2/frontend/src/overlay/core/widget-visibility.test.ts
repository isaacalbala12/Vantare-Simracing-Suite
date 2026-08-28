import { describe, expect, it } from "vitest";
import { deltaDefinition } from "../widget-types/delta/delta-definition";
import type { OverlayRuntimeContext } from "./overlay-runtime-context";
import { isWidgetVisibleV3 } from "./widget-visibility";

const readyContext: OverlayRuntimeContext = {
  sourceState: "live",
  sessionType: "practice",
  playerPresent: true,
  playerInPit: false,
  vehicleCount: 1,
};

describe("isWidgetVisibleV3", () => {
  it("returns true when no visibility rules are defined", () => {
    const widget = deltaDefinition.createDefault("delta-main");
    expect(isWidgetVisibleV3(widget, readyContext)).toBe(true);
  });

  it("matches inPit rules against the telemetry snapshot", () => {
    const widget = deltaDefinition.createDefault("delta-main");
    widget.behavior.visibleWhen = { inPit: true };

    expect(isWidgetVisibleV3(widget, readyContext)).toBe(false);
    expect(
      isWidgetVisibleV3(widget, {
        ...readyContext,
        playerInPit: true,
      }),
    ).toBe(true);
  });

  it("matches session type rules against the telemetry snapshot", () => {
    const widget = deltaDefinition.createDefault("delta-main");
    widget.behavior.visibleWhen = { sessionTypes: ["race"] };

    expect(isWidgetVisibleV3(widget, readyContext)).toBe(false);
    expect(
      isWidgetVisibleV3(widget, {
        ...readyContext,
        sessionType: "race",
      }),
    ).toBe(true);
  });

  it("falla cerrado si una regla necesita jugador o sesión ausentes", () => {
    const widget = deltaDefinition.createDefault("delta-main");
    const absent: OverlayRuntimeContext = {
      playerPresent: false,
      vehicleCount: 0,
    };

    widget.behavior.visibleWhen = { inPit: false };
    expect(isWidgetVisibleV3(widget, absent)).toBe(false);

    widget.behavior.visibleWhen = { sessionTypes: ["race"] };
    expect(isWidgetVisibleV3(widget, absent)).toBe(false);
  });
});
