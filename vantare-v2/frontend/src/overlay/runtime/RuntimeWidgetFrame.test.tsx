import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildMockTelemetry } from "../core/mock-scenarios";
import { createTelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import { deltaDefinition } from "../widget-types/delta/delta-definition";
import { RuntimeWidgetFrame } from "./RuntimeWidgetFrame";

afterEach(() => cleanup());

describe("RuntimeWidgetFrame", () => {
  it("positions the frame using layout geometry and layout origin", () => {
    const coordinator = createTelemetryRateCoordinator();
    coordinator.publish(buildMockTelemetry({ session: "race", location: "track", state: "ready" }));

    const widget = deltaDefinition.createDefault("delta-frame");
    widget.layout = { x: 120, y: 80, w: 280, h: 96, zIndex: 3, aspectLocked: true };

    const view = render(
      <RuntimeWidgetFrame
        widget={widget}
        telemetry={coordinator}
        renderMode="desktop"
        layoutOrigin={{ x: 20, y: 10 }}
      />,
    );

    const frame = view.getByTestId("runtime-widget-frame") as HTMLElement;
    expect(frame.style.left).toBe("100px");
    expect(frame.style.top).toBe("70px");
    expect(frame.style.width).toBe("280px");
    expect(frame.style.height).toBe("96px");
    expect(frame.style.zIndex).toBe("3");
    expect(view.container.querySelector('[data-widget-renderer="delta"]')).toBeTruthy();
    coordinator.dispose();
  });

  it("uses the supplied render mode for WidgetVisualHost", () => {
    const coordinator = createTelemetryRateCoordinator();
    coordinator.publish(buildMockTelemetry({ session: "race", location: "track", state: "ready" }));

    const widget = deltaDefinition.createDefault("delta-obs");
    const view = render(
      <RuntimeWidgetFrame widget={widget} telemetry={coordinator} renderMode="obs" />,
    );
    expect(view.getByTestId("runtime-widget-frame")).toBeTruthy();
    expect(view.container.querySelector('[data-widget-system="vantare-original"]')).toBeTruthy();
    coordinator.dispose();
  });

  it("scales widget content proportionally when the persisted frame grows", () => {
    const coordinator = createTelemetryRateCoordinator();
    const widget = deltaDefinition.createDefault("delta-scaled");
    widget.layout = { ...widget.layout, w: 560, h: 192 };

    const view = render(
      <RuntimeWidgetFrame widget={widget} telemetry={coordinator} renderMode="desktop" />,
    );

    const viewport = view.getByTestId("runtime-widget-viewport-delta-scaled") as HTMLElement;
    expect(viewport.style.width).toBe("280px");
    expect(viewport.style.height).toBe("96px");
    expect(viewport.style.transform).toBe("scale(2)");
    coordinator.dispose();
  });
});
