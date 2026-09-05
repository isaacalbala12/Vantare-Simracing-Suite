import type { WidgetViewModelBase } from "../../core/widget-definition";

export type RacingFlagsViewModel = WidgetViewModelBase & {
  type: "racing-flags";
  globalFlag?: string;
  sectorFlags: readonly string[];
  message?: string;
  showSectorFlags: boolean;
  hideWhenGreen: boolean;
  hidden: boolean;
};
