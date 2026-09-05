import type { WidgetViewModelBase } from "../../core/widget-definition";

export type HeadToHeadEntry = { place: number; number: string; name: string; team: string; className: string; isPlayer: boolean };
export type HeadToHeadViewModel = WidgetViewModelBase & { type: "head-to-head"; player?: HeadToHeadEntry; opponent?: HeadToHeadEntry; ahead?: HeadToHeadEntry; behind?: HeadToHeadEntry; gapSeconds?: number; sectorComparisons: readonly string[]; target: "ahead" | "behind"; showSectors: boolean };
