import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import goldenV0 from "../../../../pkg/config/testdata/profile-v3-core-widgets-from-v0.golden.json";
import goldenV2 from "../../../../pkg/config/testdata/profile-v3-core-widgets-from-v2.golden.json";
import { buildMockTelemetry } from "./mock-scenarios";
import { designSystemRegistry } from "./design-system-registry";
import { parseProfileDocumentV3 } from "./profile-document";
import { widgetTypeRegistry } from "./widget-registry";
import { WidgetVisualHost } from "./WidgetVisualHost";

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
        <WidgetVisualHost widget={widget} snapshot={snapshot} renderMode="harness" />,
      );
      expect(
        view.container.querySelector(`[data-widget-renderer="${widget.type}"]`),
      ).toBeTruthy();
      cleanup();
    }
  });
});