import type { WidgetViewModelBase } from "../../core/widget-definition";

export type BroadcastTowerRow = {
  /** Canonical vehicle identity on V2 frames; older preview models may omit it. */
  id?: string;
  place: number;
  number: string;
  name: string;
  team: string;
  className: string;
  brandColor?: string;
  gap?: number;
  isPlayer: boolean;
};
export type BroadcastTowerViewModel = WidgetViewModelBase & { type: "broadcast-tower"; sessionLabel: string; lap?: number; totalLaps?: number; trackTempC?: number; sof?: number; flag?: string; rows: readonly BroadcastTowerRow[]; rowCount: number; showWeather: boolean; showSof: boolean; motionIdentity?: string };
