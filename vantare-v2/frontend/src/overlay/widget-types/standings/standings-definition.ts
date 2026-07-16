import type { WidgetInstanceV3 } from "../../core/profile-document";
import type { WidgetTypeDefinition } from "../../core/widget-definition";
import { getWidgetRequiredFeature } from "../../core/widget-definition";
import { StandingsContentInspector } from "./StandingsContentInspector";
import {
  createDefaultStandingsContent,
  parseStandingsContent,
  type StandingsContent,
} from "./standings-content";
import { buildStandingsViewModel, type StandingsViewModel } from "./standings-view-model";

const STANDINGS_DEFAULT_LAYOUT = {
  x: 64,
  y: 64,
  w: 520,
  h: 560,
  zIndex: 0,
  aspectLocked: true,
} as const;

export const standingsDefinition: WidgetTypeDefinition<StandingsContent, StandingsViewModel> = {
  type: "standings",
  labelKey: "overlay.widgets.standings",
  capabilities: {
    inspectorSections: ["design", "appearance", "content", "behavior", "layout", "actions"],
    supportsAspectUnlock: true,
    minimumSize: { width: 280, height: 240 },
    defaultSize: { width: 520, height: 560 },
    requiredFeature: getWidgetRequiredFeature("standings"),
  },
  inspector: {
    content: [],
    CustomContentInspector: StandingsContentInspector,
  },
  createDefault(id: string): WidgetInstanceV3 {
    return {
      id,
      type: "standings",
      layout: { ...STANDINGS_DEFAULT_LAYOUT },
      behavior: { enabled: true, updateHz: 15 },
      content: createDefaultStandingsContent(),
      visual: {
        systemId: "vantare-original",
        systemVersion: 1,
        configVersion: 1,
        baseSettings: {},
        appearanceOverrides: {},
      },
    };
  },
  parseContent: parseStandingsContent,
  buildViewModel: buildStandingsViewModel,
};