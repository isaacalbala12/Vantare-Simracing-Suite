import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import goldenV0 from "../../../../pkg/config/testdata/profile-v3-core-widgets-from-v0.golden.json";
import goldenV2 from "../../../../pkg/config/testdata/profile-v3-core-widgets-from-v2.golden.json";
import huellaCompleto from "../../../../testdata/bench/huella-completo.json";
import huellaEndurance3 from "../../../../testdata/bench/huella-endurance-3.json";
import { buildMockTelemetry } from "./mock-scenarios";
import { designSystemRegistry } from "./design-system-registry";
import { ALL_WIDGET_TYPES, parseProfileDocumentV3 } from "./profile-document";
import { widgetTypeRegistry } from "./widget-registry";
import { WidgetVisualHost } from "./WidgetVisualHost";
import { buildAuthoringV2ScenarioRuntime } from "../authoring/fixtures/authoring-v2-scenario-fixture";

afterEach(() => cleanup());

describe("profile v3 contract fixtures", () => {
  it.each([
    ["v0 golden", goldenV0],
    ["v2 golden", goldenV2],
  ])("parses %s", (_label, golden) => {
    const parsed = parseProfileDocumentV3(golden);
    expect(parsed.schemaVersion).toBe(3);
    expect(parsed.layouts.general).toBeDefined();
  });

  it("parses v2 golden four core widgets", () => {
    const parsed = parseProfileDocumentV3(goldenV2);
    expect(parsed.layouts.general.widgets.map((widget) => widget.type)).toEqual([
      "delta",
      "standings",
      "relative",
      "pedals",
    ]);
    expect(parsed.layouts.general.widgets[0].visual.systemId).toMatch(/^vantare-/);
  });

  it("renders every v2 golden widget through real definitions", () => {
    const parsed = parseProfileDocumentV3(goldenV2);
    const snapshot = buildMockTelemetry({ session: "race", location: "track", state: "ready" });

    for (const widget of parsed.layouts.general.widgets) {
      const definition = widgetTypeRegistry.get(widget.type);
      expect(() => definition.parseContent(widget.content)).not.toThrow();

      const registration = designSystemRegistry.resolve(
        widget.visual.systemId,
        widget.visual.systemVersion,
        widget.type,
      );
      expect(() => registration.parseSettings(widget.visual.baseSettings)).not.toThrow();
      expect(() =>
        definition.buildViewModel(snapshot, definition.parseContent(widget.content)),
      ).not.toThrow();

      const view = render(
        <WidgetVisualHost
          widget={widget}
          renderMode="harness"
          runtime={buildAuthoringV2ScenarioRuntime({
            session: "race",
            location: "track",
            state: "ready",
            widget: widget.type,
            system: widget.visual.systemId,
            variant: "default",
          })}
        />,
      );
      expect(
        view.container.querySelector(`[data-widget-renderer="${widget.type}"]`),
      ).toBeTruthy();
      cleanup();
    }
  });

  it.each([
    ["Endurance 3", huellaEndurance3, ["standings", "relative", "delta"]],
    ["catálogo completo", huellaCompleto, ALL_WIDGET_TYPES],
  ])("validates benchmark profile %s with real widget contracts", (_label, fixture, expectedTypes) => {
    const parsed = parseProfileDocumentV3(fixture);
    expect(parsed.layouts.general.widgets.map((widget) => widget.type)).toEqual(expectedTypes);

    for (const widget of parsed.layouts.general.widgets) {
      const definition = widgetTypeRegistry.get(widget.type);
      expect(() => definition.parseContent(widget.content)).not.toThrow();
      expect(() =>
        designSystemRegistry
          .resolve(widget.visual.systemId, widget.visual.systemVersion, widget.type)
          .parseSettings(widget.visual.baseSettings),
      ).not.toThrow();
    }
  });
});
