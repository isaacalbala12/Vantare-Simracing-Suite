import type { CoreWidgetType } from "../core/profile-document";
import { validateWidgetDesign, type WidgetDesignV1 } from "../core/widget-design";

export const OFFICIAL_DESIGNS_SECTION_LABEL = "Diseños de Vantare";

const OFFICIAL_DELTA_DESIGNS: WidgetDesignV1[] = [
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
];

const OFFICIAL_DESIGNS: WidgetDesignV1[] = OFFICIAL_DELTA_DESIGNS.map((design) =>
  validateWidgetDesign(design),
);

const OFFICIAL_BY_ID = new Map(OFFICIAL_DESIGNS.map((design) => [design.id, design]));

export function listOfficialDesigns(widgetType?: CoreWidgetType): WidgetDesignV1[] {
  if (!widgetType) {
    return [...OFFICIAL_DESIGNS];
  }
  return OFFICIAL_DESIGNS.filter((design) => design.widgetType === widgetType);
}

export function getOfficialDesign(id: string): WidgetDesignV1 | undefined {
  return OFFICIAL_BY_ID.get(id);
}