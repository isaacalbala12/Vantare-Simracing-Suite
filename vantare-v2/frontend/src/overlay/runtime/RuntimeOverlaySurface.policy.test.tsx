import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ProfileDocumentV3, WidgetInstanceV3 } from "../core/profile-document";
import type { WidgetPolicyWire } from "../core/widget-policy";
import { createTelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import { deltaDefinition } from "../widget-types/delta/delta-definition";
import { standingsDefinition } from "../widget-types/standings/standings-definition";
import { engineerRadioDefinition } from "../widget-types/engineer-radio/engineer-radio-definition";
import { RuntimeOverlaySurface } from "./RuntimeOverlaySurface";
import goldenV2Raw from "../../../../internal/telemetry/projection/overlayv2/testdata/overlay_v2_1.golden.json?raw";
import type { OverlayUpdateV2 } from "../../generated/telemetry";

const originalResizeObserver = globalThis.ResizeObserver;

function installViewportResizeObserver(width: number, height: number): void {
  globalThis.ResizeObserver = class {
    private readonly callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }

    observe(target: Element): void {
      this.callback(
        [{ target, contentRect: { width, height } } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }

    disconnect(): void {}
    unobserve(): void {}
  } as unknown as typeof ResizeObserver;
}

afterEach(() => {
  cleanup();
  globalThis.ResizeObserver = originalResizeObserver;
});

const freePolicy: WidgetPolicyWire = {
  revision: 1,
  overlaysBasic: true,
  overlaysAdvanced: false,
  engineerAI: false,
  brandCrystal: "required",
  brandEfficiency: "required",
  brandOriginal: "none",
};

const paidPolicy: WidgetPolicyWire = {
  revision: 2,
  overlaysBasic: true,
  overlaysAdvanced: true,
  engineerAI: false,
  brandCrystal: "optional",
  brandEfficiency: "optional",
  brandOriginal: "none",
};

const engineerPolicy: WidgetPolicyWire = {
  revision: 3,
  overlaysBasic: true,
  overlaysAdvanced: false,
  engineerAI: true,
  brandCrystal: "optional",
  brandEfficiency: "optional",
  brandOriginal: "none",
};

function crystalStandings(id: string, showBrand?: boolean): WidgetInstanceV3 {
  const widget = standingsDefinition.createDefault(id);
  widget.visual = {
    ...widget.visual,
    systemId: "vantare-crystal",
    appearanceOverrides: showBrand === undefined ? {} : { showBrand },
  };
  return widget;
}

function buildMixedDocument(): ProfileDocumentV3 {
  return {
    schemaVersion: 3,
    id: "policy-mixed",
    name: "Policy Mixed",
    displayMode: "racing",
    monitorIndex: 0,
    layoutViewport: { width: 1000, height: 1000 },
    layouts: {
      general: {
        type: "general",
        widgets: [
          crystalStandings("standings-main"),
          deltaDefinition.createDefault("delta-main"),
          engineerRadioDefinition.createDefault("radio-main"),
        ],
      },
    },
  };
}

function frameIds(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[data-testid="runtime-widget-frame"]')].map(
    (node) => (node as HTMLElement).dataset.widgetId ?? "",
  );
}

describe("RuntimeOverlaySurface widget policy", () => {
  it.each(["desktop", "obs"] as const)(
    "free executes only basic widgets and preserves the whole document in %s",
    (renderMode) => {
      installViewportResizeObserver(1600, 900);
      const coordinator = createTelemetryRateCoordinator();
      const document = buildMixedDocument();
      const before = structuredClone(document);

      const view = render(
        <RuntimeOverlaySurface
          document={document}
          telemetry={coordinator}
          renderMode={renderMode}
          widgetPolicy={freePolicy}
        />,
      );

      // Blocked widgets never get a frame: no RuntimeWidgetFrame means no
      // telemetry subscription for them. The document keeps all three.
      expect(frameIds(view.container)).toEqual(["standings-main"]);
      expect(document).toEqual(before);
      expect(document.layouts.general.widgets).toHaveLength(3);
      coordinator.dispose();
    },
  );

  it("paid executes premium but never engineer radio; engineer-only does the opposite", () => {
    installViewportResizeObserver(1600, 900);
    const coordinator = createTelemetryRateCoordinator();

    const paid = render(
      <RuntimeOverlaySurface
        document={buildMixedDocument()}
        telemetry={coordinator}
        renderMode="desktop"
        widgetPolicy={paidPolicy}
      />,
    );
    expect(frameIds(paid.container).sort()).toEqual(["delta-main", "standings-main"]);
    paid.unmount();

    const engineer = render(
      <RuntimeOverlaySurface
        document={buildMixedDocument()}
        telemetry={coordinator}
        renderMode="desktop"
        widgetPolicy={engineerPolicy}
      />,
    );
    expect(frameIds(engineer.container).sort()).toEqual(["radio-main", "standings-main"]);
    coordinator.dispose();
  });

  it("without a snapshot only basic widgets execute (fail-safe startup)", () => {
    installViewportResizeObserver(1600, 900);
    const coordinator = createTelemetryRateCoordinator();
    const view = render(
      <RuntimeOverlaySurface
        document={buildMixedDocument()}
        telemetry={coordinator}
        renderMode="obs"
      />,
    );
    expect(frameIds(view.container)).toEqual(["standings-main"]);
    coordinator.dispose();
  });

  it.each(["desktop", "obs"] as const)(
    "brand follows the native mode in %s: required free, opt-in paid",
    (renderMode) => {
      installViewportResizeObserver(1600, 900);
      const update = JSON.parse(goldenV2Raw) as OverlayUpdateV2;
      const coordinator = createTelemetryRateCoordinator();
      coordinator.setOverlayFrame(update.frame ?? undefined, update.source);

      const free = render(
        <RuntimeOverlaySurface
          document={{
            ...buildMixedDocument(),
            layouts: { general: { type: "general", widgets: [crystalStandings("s-free")] } },
          }}
          telemetry={coordinator}
          renderMode={renderMode}
          widgetPolicy={freePolicy}
        />,
      );
      expect(
        free.container.querySelector("[data-crystal-primitive='brand']"),
      ).toBeTruthy();
      free.unmount();

      const paidHidden = render(
        <RuntimeOverlaySurface
          document={{
            ...buildMixedDocument(),
            layouts: { general: { type: "general", widgets: [crystalStandings("s-paid", false)] } },
          }}
          telemetry={coordinator}
          renderMode={renderMode}
          widgetPolicy={paidPolicy}
        />,
      );
      expect(
        paidHidden.container.querySelector("[data-crystal-primitive='brand']"),
      ).toBeNull();
      paidHidden.unmount();

      const paidShown = render(
        <RuntimeOverlaySurface
          document={{
            ...buildMixedDocument(),
            layouts: { general: { type: "general", widgets: [crystalStandings("s-paid", true)] } },
          }}
          telemetry={coordinator}
          renderMode={renderMode}
          widgetPolicy={paidPolicy}
        />,
      );
      expect(
        paidShown.container.querySelector("[data-crystal-primitive='brand']"),
      ).toBeTruthy();
      coordinator.dispose();
    },
  );
});
