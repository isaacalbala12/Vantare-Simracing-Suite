import type { WidgetInstanceV3 } from "../../core/profile-document";
import type { WidgetTypeDefinition } from "../../core/widget-definition";
import { getWidgetRequiredFeature } from "../../core/widget-definition";
import { RelativeContentInspector } from "./RelativeContentInspector";
import {
  createDefaultRelativeContent,
  getEnabledRelativeColumns,
  parseRelativeContent,
  type RelativeContent,
} from "./relative-content";
import {
  computeRelativeConfiguredRowCount,
  computeRelativeIntrinsicHeight,
  computeRelativeIntrinsicWidth,
} from "./relative-renderer-helpers";
import { buildRelativeViewModel, type RelativeViewModel } from "./relative-view-model";

const RELATIVE_DEFAULT_LAYOUT = {
  x: 64,
  y: 64,
  w: 430,
  h: 300,
  zIndex: 0,
  aspectLocked: true,
} as const;

export const relativeDefinition: WidgetTypeDefinition<RelativeContent, RelativeViewModel> = {
  type: "relative",
  labelKey: "overlay.widgets.relative",
  capabilities: {
    inspectorSections: ["design", "appearance", "content", "behavior", "layout", "actions"],
    supportsAspectUnlock: true,
    minimumSize: { width: 200, height: 120 },
    defaultSize: { width: 430, height: 300 },
    requiredFeature: getWidgetRequiredFeature("relative"),
  },
  inspector: {
    content: [],
    CustomContentInspector: RelativeContentInspector,
  },
  createDefault(id: string): WidgetInstanceV3 {
    const content = createDefaultRelativeContent();
    const columns = getEnabledRelativeColumns(content);
    const rowCount = computeRelativeConfiguredRowCount(content);
    const intrinsicLayout = {
      ...RELATIVE_DEFAULT_LAYOUT,
      w: computeRelativeIntrinsicWidth(columns),
      h: computeRelativeIntrinsicHeight(content.rowHeightMode, rowCount),
    };
    return {
      id,
      type: "relative",
      layout: intrinsicLayout,
      behavior: { enabled: true, updateHz: 15 },
      content,
      visual: {
        systemId: "vantare-original",
        systemVersion: 1,
        configVersion: 1,
        baseSettings: {},
        appearanceOverrides: {},
      },
    };
  },
  parseContent: parseRelativeContent,
  buildViewModel: buildRelativeViewModel,
};