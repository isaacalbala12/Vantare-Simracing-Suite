import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildWorkshopFrameV2, buildWorkshopWidget } from "../authoring/fixtures/authoring-v2-workshop-frame";
import { getOfficialDesign } from "../design-systems/official-designs";
import { pedalsTelemetryCompactDefinition } from "../widget-types/pedals-telemetry-compact/pedals-telemetry-compact-definition";
import {
  migrateProfileDocumentToV4, parseProfileDocumentV3, parseProfileDocumentV4,
  serializeProfileDocumentV4, type ProfileDocumentV3,
} from "./profile-document";
import { WidgetVisualHost } from "./WidgetVisualHost";
import { prepareWidgetVisualSettings } from "./widget-visual-settings";

afterEach(cleanup);

const LEGACY_DESIGNS = [
  ["vantare-original", "pedals-telemetry-compact-original"],
  ["vantare-crystal", "pedals-telemetry-compact-crystal"],
  ["vantare-iracing", "pedals-advanced-iracing"],
] as const;

function savedProfile(system: typeof LEGACY_DESIGNS[number][0], designId: string): ProfileDocumentV3 {
  const compact = pedalsTelemetryCompactDefinition.createDefault("my-pedals-compact");
  compact.name = "Mi widget guardado";
  compact.content = { showSpeed: false, showRpm: false, showClutch: false };
  compact.layout = { x: 780, y: 480, w: 310, h: 108, zIndex: 4, aspectLocked: true };
  compact.behavior.visibleWhen = { inPit: false, sessionTypes: ["race"] };
  compact.visual.systemId = system;
  compact.visual.appearanceOverrides = { brandVisible: false };
  compact.visual.provenance = { designId, designName: "Diseño guardado", origin: "vantare", appliedAt: "2026-08-01T12:00:00Z" };
  compact.visual.systemMemories = { "vantare-crystal": {
    systemVersion: 1, configVersion: 1, baseSettings: {}, appearanceOverrides: { accentColor: "#abcdef" },
  } };
  const current = buildWorkshopWidget({ widget: "pedals-telemetry", system: "vantare-functional", variant: "default", session: "race", steeringWheel: "ligier-js-p325" });
  return {
    schemaVersion: 3, id: "mixed-pedals", name: "My saved pedals", displayMode: "edit", monitorIndex: 0,
    layouts: { general: { type: "general", widgets: [compact, current] } },
  };
}

describe("retired pedals profile compatibility", () => {
  it.each(LEGACY_DESIGNS)("preserves a mixed profile and %s provenance across V3/V4 saves", (system, designId) => {
    const original = savedProfile(system, designId);
    const originalJson = JSON.stringify(original);
    expect(parseProfileDocumentV3(JSON.parse(originalJson))).toEqual(original);
    const migrated = migrateProfileDocumentToV4(original).document;
    migrated.performance = { mode: "custom", level: 3, overrides: { "my-pedals-compact": { hz: 40, effects: "flat" } } };
    const restored = parseProfileDocumentV4(JSON.parse(serializeProfileDocumentV4(migrated)));
    expect(restored).toEqual(migrated);
    expect(JSON.stringify(original)).toBe(originalJson);
    const [oldWidget, current] = restored.layouts.general.widgets;
    expect(oldWidget).toEqual({ ...original.layouts.general.widgets[0], behavior: { enabled: true, visibleWhen: { inPit: false, sessionTypes: ["race"] } } });
    expect(current?.type).toBe("pedals-telemetry");
    expect(current?.visual.appearanceOverrides.steeringWheel).toBe("ligier-js-p325");
    expect(getOfficialDesign(designId)?.widgetType).toBe("pedals-telemetry-compact");
  });

  it.each(LEGACY_DESIGNS)("still renders the saved %s compact on Studio, Desktop and OBS", (system, designId) => {
    const [compact, current] = parseProfileDocumentV3(savedProfile(system, designId)).layouts.general.widgets;
    const runtime = buildWorkshopFrameV2({ widget: "pedals-telemetry", system: "vantare-functional", variant: "default", state: "ready", session: "race", location: "track" });
    expect(prepareWidgetVisualSettings(current!).settings.steeringWheel).toBe("ligier-js-p325");
    for (const renderMode of ["studio", "desktop", "obs"] as const) {
      const { container } = render(<>
        <WidgetVisualHost widget={compact!} runtime={runtime} renderMode={renderMode} />
        <WidgetVisualHost widget={current!} runtime={runtime} renderMode={renderMode} />
      </>);
      const legacy = container.querySelector('[data-widget-renderer="pedals-telemetry-compact"]');
      expect(legacy?.getAttribute("data-widget-system")).toBe(system);
      expect(legacy?.querySelector('[data-pedal="clutch"]')).toBeNull();
      expect(legacy?.textContent?.toUpperCase()).not.toMatch(/KM\/H|RPM/);
      expect(container.querySelector('[data-steering-wheel="ligier-js-p325"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="widget-host-diagnostic"]')).toBeNull();
      cleanup();
    }
  });
});
