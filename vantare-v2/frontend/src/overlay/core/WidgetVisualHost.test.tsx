import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMockTelemetry } from "./mock-scenarios";
import type { DesignSystemId, WidgetInstanceV3 } from "./profile-document";
import { DesignSystemResolutionError } from "./design-system-definition";
import { designSystemRegistry } from "./design-system-registry";
import { deltaDefinition } from "../widget-types/delta/delta-definition";
import { WidgetVisualHost } from "./WidgetVisualHost";

afterEach(() => cleanup());

const snapshot = buildMockTelemetry({ session: "race", location: "track", state: "ready" });

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
    const original = render(
      <WidgetVisualHost widget={buildWidget("vantare-original")} snapshot={snapshot} renderMode="harness" />,
    );
    expect(
      original.container.querySelector('[data-widget-system="vantare-original"]'),
    ).toBeTruthy();
    cleanup();

    const crystal = render(
      <WidgetVisualHost widget={buildWidget("vantare-crystal")} snapshot={snapshot} renderMode="harness" />,
    );
    expect(crystal.container.querySelector('[data-widget-system="vantare-crystal"]')).toBeTruthy();
  });

  it("feeds identical Delta view model values to both systems", () => {
    const original = render(
      <WidgetVisualHost widget={buildWidget("vantare-original")} snapshot={snapshot} renderMode="harness" />,
    );
    const originalValue = original.container.querySelector(".vo-delta-value")?.textContent;
    cleanup();

    const crystal = render(
      <WidgetVisualHost widget={buildWidget("vantare-crystal")} snapshot={snapshot} renderMode="harness" />,
    );
    const crystalValue = crystal.container.querySelector(".vc-delta-bar-value")?.textContent;
    expect(originalValue).toBe("-0.150");
    expect(crystalValue).toBe("-0.15");
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
        snapshot={snapshot}
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
      <WidgetVisualHost widget={widget} snapshot={snapshot} renderMode="harness" />,
    );
    expect(view.getByTestId("widget-host-diagnostic")).toBeTruthy();
    expect(widget.content).toEqual({ unexpected: true });
  });

  it("keeps sibling hosts rendered when one host fails resolution", () => {
    const good = buildWidget("vantare-original");
    const bad = buildWidget("vantare-original");
    bad.content = { bad: true };
    const view = render(
      <>
        <WidgetVisualHost widget={bad} snapshot={snapshot} renderMode="harness" />
        <WidgetVisualHost widget={good} snapshot={snapshot} renderMode="harness" />
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
          snapshot={snapshot}
          renderMode={renderMode}
        />,
      );
      expect(view.container.querySelector('[data-widget-renderer="delta"]')).toBeTruthy();
      cleanup();
    }
  });
});
