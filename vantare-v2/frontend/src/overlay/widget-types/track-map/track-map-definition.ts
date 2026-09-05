import type { WidgetInstanceV3 } from "../../core/profile-document";
import { getWidgetRequiredFeature, type WidgetTypeDefinition } from "../../core/widget-definition";
import {
  createDefaultTrackMapContent,
  parseTrackMapContent,
  type TrackMapContent,
} from "./track-map-content";
import {
  buildTrackMapPreviewViewModel,
  type TrackMapViewModel,
} from "./track-map-view-model";

export const trackMapDefinition: WidgetTypeDefinition<TrackMapContent, TrackMapViewModel> = {
  type: "track-map",
  labelKey: "studio.v3.widgetTypes.trackMap",
  capabilities: {
    inspectorSections: ["design", "appearance", "content", "behavior", "layout", "actions"],
    supportsAspectUnlock: true,
    minimumSize: { width: 160, height: 110 },
    defaultSize: { width: 320, height: 220 },
    requiredFeature: getWidgetRequiredFeature("track-map"),
  },
  inspector: { content: [] },
  createDefault(id: string): WidgetInstanceV3 {
    return {
      id,
      type: "track-map",
      layout: { x: 64, y: 64, w: 320, h: 220, zIndex: 0, aspectLocked: true },
      // The outline is static: it only changes when the session changes circuit.
      behavior: { enabled: true, updateHz: 2 },
      content: createDefaultTrackMapContent(),
      visual: {
        systemId: "vantare-endurance",
        systemVersion: 1,
        configVersion: 1,
        baseSettings: {},
        appearanceOverrides: {},
      },
    };
  },
  parseContent: parseTrackMapContent,
  buildPreviewViewModel: buildTrackMapPreviewViewModel,
};
