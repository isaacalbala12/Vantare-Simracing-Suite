import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { migrateProfileDocumentToV4, parseProfileDocumentV4, serializeProfileDocumentV4 } from "../../../core/profile-document";
import { prepareWidgetVisualSettings } from "../../../core/widget-visual-settings";
import { writeControlValue } from "../../../core/inspector-control";
import { buildWorkshopWidget } from "../../../authoring/fixtures/authoring-v2-workshop-frame";
import { vantareFunctionalManifest } from "../manifest";
import { LMU_STEERING_WHEELS, normalizeSteeringWheel, parseSteeringWheelSettings } from "./catalog";
import { SteeringWheelArtwork } from "./SteeringWheelArtwork";

afterEach(cleanup);

describe("LMU steering wheels", () => {
  it.each(LMU_STEERING_WHEELS)("draws $name without external assets or invented readouts", ({ id }) => {
    const { container } = render(<svg><SteeringWheelArtwork wheel={id} /></svg>);
    expect(container.querySelector("path[d]")).toBeTruthy();
    expect(container.querySelector("image, use, text, foreignObject")).toBeNull();
  });

  it.each([undefined, null, [], {}, "future-car", "__proto__"])("preserves the generic wheel for invalid or absent settings: %s", (value) => {
    expect(normalizeSteeringWheel(value)).toBe("generic");
    expect(parseSteeringWheelSettings({ steeringWheel: value, brandVisible: false })).toEqual({ steeringWheel: "generic", brandVisible: false });
  });

  it("round-trips a Studio appearance selection through the saved V4 profile and productive parser", () => {
    const widget = buildWorkshopWidget({ widget: "pedals-telemetry", system: "vantare-functional", variant: "default", session: "race" });
    const registration = vantareFunctionalManifest.widgets.find((entry) => entry.widgetType === widget.type)!;
    const control = registration.inspector!.appearance.find((entry) => entry.id === "steering-wheel")!;
    expect(control.kind).toBe("select");
    const originalContent = structuredClone(widget.content);
    widget.visual.appearanceOverrides = writeControlValue(widget.visual.appearanceOverrides, control.path, "ligier-js-p325");
    const saved = migrateProfileDocumentToV4({ schemaVersion: 3, id: "wheels", name: "Wheels", displayMode: "edit", monitorIndex: 0, layouts: { general: { type: "general", widgets: [widget] } } }).document;
    const restored = parseProfileDocumentV4(JSON.parse(serializeProfileDocumentV4(saved))).layouts.general.widgets[0]!;
    expect(prepareWidgetVisualSettings(restored).settings.steeringWheel).toBe("ligier-js-p325");
    expect(restored.content).toEqual(originalContent);
    expect(restored.layout).toEqual(widget.layout);
  });
});
