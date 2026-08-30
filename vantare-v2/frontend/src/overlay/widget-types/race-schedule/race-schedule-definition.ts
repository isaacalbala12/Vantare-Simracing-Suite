import type { WidgetInstanceV3 } from "../../core/profile-document";
import { getWidgetRequiredFeature, type WidgetTypeDefinition } from "../../core/widget-definition";
import { buildRaceScheduleViewModel, type RaceScheduleViewModel } from "./race-schedule-view-model";

export type RaceScheduleContent = { rowCount: number; licenseFilter: string; timeZone: string };

const defaults: RaceScheduleContent = { rowCount: 4, licenseFilter: "all", timeZone: "local" };

export const raceScheduleDefinition: WidgetTypeDefinition<RaceScheduleContent, RaceScheduleViewModel> = {
  type: "race-schedule",
  labelKey: "studio.v3.widgetTypes.raceSchedule",
  capabilities: {
    inspectorSections: ["design", "appearance", "content", "behavior", "layout", "actions"],
    supportsAspectUnlock: true,
    minimumSize: { width: 390, height: 292 },
    defaultSize: { width: 780, height: 583 },
    requiredFeature: getWidgetRequiredFeature("race-schedule"),
  },
  inspector: { content: [] },
  createDefault(id: string): WidgetInstanceV3 {
    return {
      id,
      type: "race-schedule",
      layout: { x: 64, y: 64, w: 780, h: 583, zIndex: 0, aspectLocked: true },
      behavior: { enabled: true, updateHz: 1 },
      content: { ...defaults },
      visual: {
        systemId: "vantare-original",
        systemVersion: 1,
        configVersion: 1,
        baseSettings: {},
        appearanceOverrides: {},
      },
    };
  },
  parseContent(input: unknown): RaceScheduleContent {
    if (input == null) return { ...defaults };
    if (typeof input !== "object" || Array.isArray(input)) {
      throw new Error("race-schedule content must be an object");
    }
    const value = input as Record<string, unknown>;
    return {
      rowCount: typeof value.rowCount === "number" ? Math.max(1, Math.min(4, Math.round(value.rowCount))) : 4,
      licenseFilter: typeof value.licenseFilter === "string" ? value.licenseFilter : "all",
      timeZone: typeof value.timeZone === "string" ? value.timeZone : "local",
    };
  },
  buildViewModel(_snapshot, content) {
    return buildRaceScheduleViewModel([], content);
  },
  buildRuntimeViewModel(_snapshot, content, runtime) {
    return buildRaceScheduleViewModel(
      runtime.raceScheduleEvents ?? [],
      content,
      runtime.raceScheduleStatus,
    );
  },
  buildPreviewViewModel(_snapshot, content, runtime) {
    return buildRaceScheduleViewModel(
      runtime.raceScheduleEvents ?? [],
      content,
      runtime.raceScheduleStatus,
    );
  },
  buildAuxiliaryViewModel(content, runtime) {
    return buildRaceScheduleViewModel(
      runtime.raceScheduleEvents ?? [],
      content,
      runtime.raceScheduleStatus,
    );
  },
};
