import type { WidgetType } from "../core/profile-document";
import { validateWidgetDesign, type WidgetDesignV1 } from "../core/widget-design";
import { PEDALS_DEFAULT_APPEARANCE } from "../widget-types/pedals/pedals-renderer-helpers";
import { RELATIVE_DEFAULT_APPEARANCE } from "../widget-types/relative/relative-renderer-helpers";

export const OFFICIAL_DESIGNS_SECTION_LABEL = "Diseños de Vantare";

const OFFICIAL_DESIGN_DEFINITIONS: WidgetDesignV1[] = [
  {
    id: "delta-original-base",
    name: "Original Base",
    widgetType: "delta",
    systemId: "vantare-original",
    systemVersion: 1,
    configVersion: 1,
    visual: { showHeader: true },
    includesContent: false,
    origin: "vantare",
  },
  {
    id: "delta-crystal-base",
    name: "Crystal Base",
    widgetType: "delta",
    systemId: "vantare-crystal",
    systemVersion: 1,
    configVersion: 1,
    visual: { showHeader: true },
    includesContent: false,
    origin: "vantare",
  },
  {
    id: "delta-time-attack",
    name: "Time Attack",
    widgetType: "delta",
    systemId: "vantare-original",
    systemVersion: 1,
    configVersion: 1,
    visual: { showHeader: false, accent: "amber" },
    includesContent: false,
    origin: "vantare",
  },
  {
    id: "standings-original-base",
    name: "Original Base",
    widgetType: "standings",
    systemId: "vantare-original",
    systemVersion: 1,
    configVersion: 1,
    visual: { showSessionHeader: true, compactRows: false },
    includesContent: false,
    origin: "vantare",
  },
  {
    id: "standings-crystal-base",
    name: "Crystal Base",
    widgetType: "standings",
    systemId: "vantare-crystal",
    systemVersion: 1,
    configVersion: 1,
    visual: { showSessionHeader: true, compactRows: false },
    includesContent: false,
    origin: "vantare",
  },
  {
    id: "relative-original-base",
    name: "Original Base",
    widgetType: "relative",
    systemId: "vantare-original",
    systemVersion: 1,
    configVersion: 1,
    visual: { ...RELATIVE_DEFAULT_APPEARANCE },
    includesContent: false,
    origin: "vantare",
  },
  {
    id: "relative-crystal-base",
    name: "Crystal Base",
    widgetType: "relative",
    systemId: "vantare-crystal",
    systemVersion: 1,
    configVersion: 1,
    visual: { ...RELATIVE_DEFAULT_APPEARANCE },
    includesContent: false,
    origin: "vantare",
  },
  {
    id: "pedals-original-base",
    name: "Original Base",
    widgetType: "pedals",
    systemId: "vantare-original",
    systemVersion: 1,
    configVersion: 1,
    visual: { ...PEDALS_DEFAULT_APPEARANCE },
    includesContent: false,
    origin: "vantare",
  },
  {
    id: "pedals-crystal-base",
    name: "Crystal Base",
    widgetType: "pedals",
    systemId: "vantare-crystal",
    systemVersion: 1,
    configVersion: 1,
    visual: { ...PEDALS_DEFAULT_APPEARANCE },
    includesContent: false,
    origin: "vantare",
  },
];

const OFFICIAL_DESIGNS: WidgetDesignV1[] = OFFICIAL_DESIGN_DEFINITIONS.map((design) =>
  validateWidgetDesign(design),
);

const OFFICIAL_BY_ID = new Map(OFFICIAL_DESIGNS.map((design) => [design.id, design]));

export function listOfficialDesigns(widgetType?: WidgetType): WidgetDesignV1[] {
  if (!widgetType) {
    return [...OFFICIAL_DESIGNS];
  }
  return OFFICIAL_DESIGNS.filter((design) => design.widgetType === widgetType);
}

export function getOfficialDesign(id: string): WidgetDesignV1 | undefined {
  return OFFICIAL_BY_ID.get(id);
}