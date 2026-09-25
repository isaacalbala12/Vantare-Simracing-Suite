import type { OverlayFrameV2, OverlaySourceStatusV2 } from "../../../generated/telemetry";
import type { WidgetViewModelBase } from "../../core/widget-definition";

export type RadarViewModel = WidgetViewModelBase & {
  type: "radar";
  available: boolean;
  cars: readonly Readonly<{ id: string; x: number; z: number; overlap: boolean }>[];
  leftOverlap: boolean;
  rightOverlap: boolean;
};

export function buildRadarViewModelV2(frame: OverlayFrameV2, source: OverlaySourceStatusV2): RadarViewModel {
  const connected = source.state === "live";
  const available = connected && frame.radar.mode === "xyz";
  const cars = available ? frame.radar.cars : [];
  return {
    type: "radar",
    status: available ? "ready" : connected ? "missing" : source.state === "stale" ? "stale" : "disconnected",
    statusMessage: available ? undefined : source.reason || undefined,
    available,
    cars,
    leftOverlap: cars.some((car) => car.overlap && car.x > 0),
    rightOverlap: cars.some((car) => car.overlap && car.x < 0),
  };
}
