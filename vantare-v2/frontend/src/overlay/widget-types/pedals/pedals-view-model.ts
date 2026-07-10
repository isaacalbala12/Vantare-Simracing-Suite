import type { TelemetrySnapshot } from "../../core/telemetry-snapshot";
import type { WidgetViewModelBase } from "../../core/widget-definition";
import type { PedalsContent } from "./pedals-definition";

export type PedalsViewModel = WidgetViewModelBase & {
  type: "pedals";
  throttle: number;
  brake: number;
  clutch: number;
  throttleText: string;
  brakeText: string;
  clutchText: string;
};

function clampPedal(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function formatPedalPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function buildUnavailableModel(
  status: PedalsViewModel["status"],
  statusMessage?: string,
): PedalsViewModel {
  return {
    type: "pedals",
    status,
    statusMessage,
    throttle: 0,
    brake: 0,
    clutch: 0,
    throttleText: "0%",
    brakeText: "0%",
    clutchText: "0%",
  };
}

export function buildPedalsViewModel(
  snapshot: TelemetrySnapshot,
  _content: PedalsContent,
): PedalsViewModel {
  if (snapshot.status === "disconnected") {
    return buildUnavailableModel("disconnected");
  }
  if (snapshot.status === "stale") {
    return buildUnavailableModel("stale");
  }
  if (snapshot.status === "error") {
    return buildUnavailableModel("error", snapshot.errorMessage);
  }
  if (snapshot.status === "missing") {
    return buildUnavailableModel("missing");
  }

  const throttle = clampPedal(snapshot.player.throttle);
  const brake = clampPedal(snapshot.player.brake);
  const clutch = clampPedal(snapshot.player.clutch);

  return {
    type: "pedals",
    status: "ready",
    throttle,
    brake,
    clutch,
    throttleText: formatPedalPercent(throttle),
    brakeText: formatPedalPercent(brake),
    clutchText: formatPedalPercent(clutch),
  };
}