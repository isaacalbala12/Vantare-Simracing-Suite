import type { WidgetViewModelBase } from "../../core/widget-definition";

export const PEDALS_KNOWN_FLAGS = [
  "green",
  "yellow",
  "blue",
  "red",
  "white",
  "black",
  "checkered",
] as const;

export type PedalsKnownFlag = (typeof PEDALS_KNOWN_FLAGS)[number];
export type PedalsFlag = "unknown" | PedalsKnownFlag;
export type PedalsSessionPhase = "unknown" | "practice" | "qualifying" | "race";

export type PedalsViewModel = WidgetViewModelBase & {
  type: "pedals";
  throttle: number;
  brake: number;
  clutch: number;
  throttleText: string;
  brakeText: string;
  clutchText: string;
  /** Session signal used only for the existing state accent; never inferred from pedal input. */
  flag?: PedalsFlag;
  sessionPhase?: PedalsSessionPhase;
};
