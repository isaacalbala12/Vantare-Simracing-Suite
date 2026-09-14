import type { WidgetViewModelBase } from "../../core/widget-definition";
import type { TrackWeatherContent } from "./track-weather-definition";

export type TrackWeatherViewModel = WidgetViewModelBase & {
  type: "track-weather";
  ambientC?: number;
  trackC?: number;
  rainPercent?: number;
  wetnessPercent?: number;
  windKph?: number;
  windDirection?: string;
  pressureHpa?: number;
  content: TrackWeatherContent;
};
