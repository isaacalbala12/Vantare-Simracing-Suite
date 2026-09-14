import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTelemetryRateCoordinator as createBaseTelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import { deltaDefinition } from "../widget-types/delta/delta-definition";
import { standingsDefinition } from "../widget-types/standings/standings-definition";
import { relativeDefinition } from "../widget-types/relative/relative-definition";
import * as relativeV2 from "../widget-types/relative/relative-view-model-v2";
import { RuntimeWidgetFrame } from "./RuntimeWidgetFrame";
import goldenV2Raw from "../../../../internal/telemetry/projection/overlayv2/testdata/overlay_v2_1.golden.json?raw";
import type { OverlayUpdateV2 } from "../../generated/telemetry";

function createTelemetryRateCoordinator() {
  const coordinator = createBaseTelemetryRateCoordinator();
  const update = JSON.parse(goldenV2Raw) as OverlayUpdateV2;
  coordinator.setOverlayFrame(update.frame ?? undefined, update.source);
  return coordinator;
}

afterEach(() => cleanup());

describe("RuntimeWidgetFrame", () => {
  it("positions the frame using layout geometry and layout origin", () => {
    const coordinator = createTelemetryRateCoordinator();

    const widget = deltaDefinition.createDefault("delta-frame");
    widget.layout = { x: 120, y: 80, w: 280, h: 96, zIndex: 3, aspectLocked: true };

    const view = render(
      <RuntimeWidgetFrame
        widget={widget}
        profileId="profile-test"
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

    const widget = deltaDefinition.createDefault("delta-obs");
    const view = render(
      <RuntimeWidgetFrame widget={widget} profileId="profile-test" telemetry={coordinator} renderMode="obs" />,
    );
    expect(view.getByTestId("runtime-widget-frame")).toBeTruthy();
    expect(view.container.querySelector('[data-widget-system="vantare-original"]')).toBeTruthy();
    coordinator.dispose();
  });

  it("delimita Relative con la identidad logica perfil y widget", () => {
    const coordinator = createTelemetryRateCoordinator();
    const widget = relativeDefinition.createDefault("relative-runtime");
    const spy = vi.spyOn(relativeV2, "buildRelativeViewModelV2");
    const view = render(
      <RuntimeWidgetFrame widget={widget} profileId="profile-a" telemetry={coordinator} renderMode="desktop" />,
    );
    expect(spy.mock.calls.at(-1)?.[3]?.instanceKey).toBe("profile-a:relative-runtime");

    view.rerender(
      <RuntimeWidgetFrame widget={{ ...widget }} profileId="profile-b" telemetry={coordinator} renderMode="desktop" />,
    );
    expect(spy.mock.calls.at(-1)?.[3]?.instanceKey).toBe("profile-b:relative-runtime");
    coordinator.dispose();
  });

  it("scales widget content proportionally when the persisted frame grows", () => {
    const coordinator = createTelemetryRateCoordinator();
    const widget = deltaDefinition.createDefault("delta-scaled");
    widget.layout = { ...widget.layout, w: 560, h: 192 };

    const view = render(
      <RuntimeWidgetFrame widget={widget} profileId="profile-test" telemetry={coordinator} renderMode="desktop" />,
    );

    const viewport = view.getByTestId("runtime-widget-viewport-delta-scaled") as HTMLElement;
    expect(viewport.style.width).toBe("280px");
    expect(viewport.style.height).toBe("96px");
    expect(viewport.style.transform).toBe("scale(2)");
    coordinator.dispose();
  });

  it("passes the Redline visual selection so widening creates real runtime space", () => {
    const coordinator = createTelemetryRateCoordinator();
    const widget = standingsDefinition.createDefault("standings-redline-wide");
    widget.layout = { ...widget.layout, w: 760 };
    widget.visual = {
      ...widget.visual,
      systemId: "vantare-endurance",
      baseSettings: { templateId: "standings-redline" },
    };

    const view = render(
      <RuntimeWidgetFrame widget={widget} profileId="profile-test" telemetry={coordinator} renderMode="desktop" />,
    );

    const viewport = view.getByTestId("runtime-widget-viewport-standings-redline-wide");
    expect(viewport.style.width).toBe("760px");
    expect(viewport.style.transform).toBe("scale(1)");
    coordinator.dispose();
  });
});
