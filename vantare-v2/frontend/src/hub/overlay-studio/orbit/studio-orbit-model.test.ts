import { describe, expect, it } from "vitest";
import type { WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import { ORBIT_KEYS, orbitStore } from "../../orbit/orbit-store";
import {
  behaviorSummary,
  designSummary,
  fill,
  inspectorMeta,
  layoutSummary,
  readRightDockClosed,
  widgetLabel,
} from "./studio-orbit-model";

const T: Record<string, string> = {
  "studio.summary.fps": "{{n}} fps",
  "studio.summary.pit.any": "siempre",
  "studio.summary.pit.inPit": "solo en boxes",
  "studio.summary.pit.onTrack": "solo en pista",
  "studio.summary.sessions": "{{n}} sesiones",
  "studio.summary.sessionsAll": "todas las sesiones",
  "studio.summary.layout": "{{x}}, {{y}} · {{w}} × {{h}}",
  "studio.inspector.meta": "{{design}} · {{w}} × {{h}}",
  "studio.system.vantare-crystal": "Vantare Crystal",
};

const t = (key: string) => T[key] ?? key;

function build(overrides: Partial<WidgetInstanceV3> = {}): WidgetInstanceV3 {
  const base = deltaDefinition.createDefault("delta-main");
  return {
    ...base,
    name: "Delta",
    layout: { ...base.layout, x: 820, y: 96, w: 280, h: 96 },
    visual: { ...base.visual, systemId: "vantare-crystal" },
    behavior: { ...base.behavior, updateHz: 15 },
    ...overrides,
  };
}

describe("studio-orbit-model", () => {
  it("interpola solo las claves conocidas", () => {
    expect(fill("{{a}} y {{b}}", { a: 1 })).toBe("1 y {{b}}");
  });

  it("usa el id cuando el widget no tiene nombre", () => {
    expect(widgetLabel(build({ name: "  " }))).toBe("delta-main");
  });

  it("resume el diseño con el sistema y la procedencia", () => {
    const widget = build();
    expect(designSummary(widget, t)).toBe("Vantare Crystal");
    const withProvenance = build({
      visual: {
        ...widget.visual,
        provenance: {
          designId: "crystal-bar",
          designName: "Crystal Bar",
          origin: "vantare",
          appliedAt: "2026-01-01T00:00:00Z",
        },
      },
    });
    expect(designSummary(withProvenance, t)).toBe("Vantare Crystal · Crystal Bar");
  });

  it("resume el comportamiento con fps, boxes y sesiones", () => {
    expect(behaviorSummary(build(), t)).toBe("15 fps · siempre · todas las sesiones");
    const restricted = build();
    restricted.behavior = {
      ...restricted.behavior,
      updateHz: 30,
      visibleWhen: { inPit: false, sessionTypes: ["race", "practice"] },
    };
    expect(behaviorSummary(restricted, t)).toBe("30 fps · solo en pista · 2 sesiones");
  });

  it("resume el layout con posición y tamaño", () => {
    expect(layoutSummary(build(), t)).toBe("820, 96 · 280 × 96");
    expect(inspectorMeta(build(), t)).toBe("Vantare Crystal · 280 × 96");
  });

  it("lee el plegado del inspector de la URL y de la preferencia", () => {
    window.localStorage.clear();
    expect(readRightDockClosed("?rightDock=closed")).toBe(true);
    expect(orbitStore.get(ORBIT_KEYS.rightDock)).toBe("closed");
    expect(readRightDockClosed("")).toBe(true);
    expect(readRightDockClosed("?rightDock=open")).toBe(false);
    expect(readRightDockClosed("")).toBe(false);
  });
});
