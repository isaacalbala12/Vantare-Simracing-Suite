import { describe, expect, it } from "vitest";
import type { WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import { translate } from "../../../i18n/i18n";
import { ORBIT_KEYS, orbitStore } from "../../orbit/orbit-store";
import {
  appearanceSummary,
  behaviorSummary,
  designSummary,
  fill,
  inspectorMeta,
  layoutSummary,
  readRightDockClosed,
  widgetLabel,
} from "./studio-orbit-model";

const T: Record<string, string> = {
  "studio.summary.performanceManaged": "política del perfil",
  "studio.summary.pit.any": "siempre",
  "studio.summary.pit.inPit": "solo en boxes",
  "studio.summary.pit.onTrack": "solo en pista",
  "studio.summary.sessions": "{{n}} sesiones",
  "studio.summary.sessionsAll": "todas",
  "studio.summary.appearanceDefault": "por defecto",
  "studio.summary.appearanceChanged": "{{n}} cambios",
  "studio.summary.appearanceChangedOne": "1 cambio",
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

  it.each([["compact", "Signature"], ["broadcast", "Broadcast"]])("muestra el nombre vigente de %s al reabrir un perfil sin modificarlo", (id, name) => {
    const widget = build({ type: "standings" });
    widget.visual = { ...widget.visual, systemId: "vantare-functional", provenance: {
      designId: `standings-functional-${id}`, designName: `Functional ${name} · Preview`,
      origin: "vantare", appliedAt: "2026-09-09T00:00:00Z",
    } };
    const saved = JSON.stringify(widget);
    const es = (key: string) => translate("es", key);
    expect(designSummary(widget, es)).toBe(`Eficiencia · ${name}`);
    expect(inspectorMeta(widget, es)).toBe(`${name} · 280 × 96`);
    expect(JSON.stringify(widget)).toBe(saved);
  });

  it.each(["user", "unknown", "different-widget", "different-system", "different-version"])("conserva el nombre guardado cuando la procedencia es %s", (kind) => {
    const widget = build({ type: kind === "different-widget" ? "delta" : "standings" });
    widget.visual = { ...widget.visual,
      systemId: kind === "different-system" ? "vantare-crystal" : "vantare-functional",
      systemVersion: kind === "different-version" ? 2 : 1,
      provenance: {
        designId: kind === "unknown" ? "unknown" : "standings-functional-compact",
        designName: "Mi estilo", origin: kind === "user" ? "user" : "vantare",
        appliedAt: "2026-09-09T00:00:00Z",
      },
    };
    expect(designSummary(widget, t)).toContain(" · Mi estilo");
    expect(inspectorMeta(widget, t)).toBe("Mi estilo · 280 × 96");
  });

  it("resume el comportamiento con política, boxes y sesiones", () => {
    // El filtro de boxes solo se nombra cuando restringe: en el resumen corto
    // "siempre" gastaba la mitad de la linea para decir "sin filtro".
    expect(behaviorSummary(build(), t)).toBe("política del perfil · todas");
    const restricted = build();
    restricted.behavior = {
      ...restricted.behavior,
      updateHz: 30,
      visibleWhen: { inPit: false, sessionTypes: ["race", "practice"] },
    };
    expect(behaviorSummary(restricted, t)).toBe(
      "política del perfil · solo en pista · 2 sesiones",
    );
  });

  it("resume la apariencia con los overrides del usuario", () => {
    expect(appearanceSummary(build(), t)).toBe("por defecto");
    const touched = build();
    touched.visual = {
      ...touched.visual,
      appearanceOverrides: { classGt3Color: "#fff", classLmp2Color: "#000" },
    };
    expect(appearanceSummary(touched, t)).toBe("2 cambios");
    const one = build();
    one.visual = { ...one.visual, appearanceOverrides: { classGt3Color: "#fff" } };
    expect(appearanceSummary(one, t)).toBe("1 cambio");
  });

  it("resume el layout con posición y tamaño", () => {
    expect(layoutSummary(build(), t)).toBe("820, 96 · 280 × 96");
    // Sin procedencia la cabecera cae al sistema; con ella pinta el diseño y
    // deja de repetir lo que ya dice el acordeón de Diseño.
    expect(inspectorMeta(build(), t)).toBe("Vantare Crystal · 280 × 96");
    const withProvenance = build();
    withProvenance.visual = {
      ...withProvenance.visual,
      provenance: {
        designId: "crystal-bar",
        designName: "Crystal Bar",
        origin: "vantare",
        appliedAt: "2026-01-01T00:00:00Z",
      },
    };
    expect(inspectorMeta(withProvenance, t)).toBe("Crystal Bar · 280 × 96");
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
