import type { WidgetViewModelBase } from "../../core/widget-definition";
import type { DeltaReference } from "./delta-content";

export type DeltaTone = "gaining" | "neutral" | "losing";

export type DeltaViewModel = WidgetViewModelBase & {
  type: "delta";
  tone: DeltaTone;
  deltaText: string;
  lastLapText: string;
  bestLapText: string;
  progress: number;
  /** Completed lap count when the source exposes it; used for event inference. */
  completedLap?: number;
  /** Effective reference resolved by the Overlay v2 builder. */
  reference?: DeltaReference;
  /** The widget request, retained to disclose fallback or unavailable reference. */
  requestedReference?: DeltaReference;
  /** Session/epoch continuity key; prevents notices across session resets. */
  sessionIdentity?: string;
  lapText?: string;
  predictedLapText?: string;
  splitText?: string;
};
