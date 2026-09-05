import type { WidgetViewModelBase } from "../../core/widget-definition";

export type PedalsViewModel = WidgetViewModelBase & {
  type: "pedals";
  throttle: number;
  brake: number;
  clutch: number;
  throttleText: string;
  brakeText: string;
  clutchText: string;
};
