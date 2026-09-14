import type { WidgetViewModelBase } from "../../core/widget-definition";

export type DeltaTone = "gaining" | "neutral" | "losing";

export type DeltaViewModel = WidgetViewModelBase & {
  type: "delta";
  tone: DeltaTone;
  deltaText: string;
  lastLapText: string;
  bestLapText: string;
  progress: number;
  lapText?: string;
  predictedLapText?: string;
  splitText?: string;
};
