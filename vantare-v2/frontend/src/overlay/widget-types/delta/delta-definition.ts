import { validateInspectorControls } from "../../core/inspector-control";
import type { WidgetInstanceV3 } from "../../core/profile-document";
import type { WidgetTypeDefinition } from "../../core/widget-definition";
import { getWidgetRequiredFeature } from "../../core/widget-definition";
import type { DeltaViewModel } from "./delta-view-model";

export const DELTA_REFERENCES = ["personal-best", "session-best", "previous-lap"] as const;
export type DeltaReference = (typeof DELTA_REFERENCES)[number];
export type DeltaContent = { reference?: DeltaReference };

const DELTA_DEFAULT_LAYOUT = {
  x: 64,
  y: 64,
  w: 280,
  h: 96,
  zIndex: 0,
  aspectLocked: true,
} as const;

const deltaInspector = {
  content: [{
    kind: "select" as const,
    id: "reference",
    labelKey: "studio.v3.inspector.delta.reference",
    path: "reference",
    options: [
      { value: "personal-best", labelKey: "studio.v3.inspector.delta.personalBest" },
      { value: "session-best", labelKey: "studio.v3.inspector.delta.sessionBest" },
      { value: "previous-lap", labelKey: "studio.v3.inspector.delta.previousLap" },
    ],
    defaultValue: "personal-best",
  }],
} as const;

validateInspectorControls(deltaInspector.content);

export const deltaDefinition: WidgetTypeDefinition<DeltaContent, DeltaViewModel> = {
  type: "delta",
  labelKey: "overlay.widgets.delta",
  capabilities: {
    inspectorSections: ["design", "appearance", "content", "behavior", "layout", "actions"],
    supportsAspectUnlock: false,
    // 140x48 y no 120x48: con supportsAspectUnlock:false el tipo declara que su
    // proporcion no es negociable, y 120x48 daba 2,5 frente a la natural 2,92.
    // El minimo contradecia la proporcion que el propio widget bloquea, y
    // obligaba a conformAspectLockedLayout a recalcular el ancho. 140 es el
    // ancho que corresponde a los 48 de alto, asi que respeta ambos minimos
    // originales como cota inferior.
    minimumSize: { width: 140, height: 48 },
    defaultSize: { width: 280, height: 96 },
    requiredFeature: getWidgetRequiredFeature("delta"),
  },
  inspector: deltaInspector,
  createDefault(id: string): WidgetInstanceV3 {
    return {
      id,
      type: "delta",
      layout: { ...DELTA_DEFAULT_LAYOUT },
      behavior: { enabled: true, updateHz: 30 },
      content: { reference: "personal-best" },
      visual: {
        systemId: "vantare-original",
        systemVersion: 1,
        configVersion: 1,
        baseSettings: {},
        appearanceOverrides: {},
      },
    };
  },
  parseContent(input: unknown): DeltaContent {
    if (input === undefined || input === null) {
      return { reference: "personal-best" };
    }
    if (typeof input !== "object" || Array.isArray(input)) {
      throw new Error("delta content must be an object");
    }
    const value = input as Record<string, unknown>;
    const unknown = Object.keys(value).find((key) => key !== "reference");
    if (unknown) {
      throw new Error(`delta content contains unknown field: ${unknown}`);
    }
    if (value.reference !== undefined && !DELTA_REFERENCES.includes(value.reference as DeltaReference)) {
      throw new Error("delta reference must be personal-best, session-best or previous-lap");
    }
    return { reference: (value.reference as DeltaReference | undefined) ?? "personal-best" };
  },
};
