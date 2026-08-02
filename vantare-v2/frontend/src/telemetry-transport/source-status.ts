export const telemetrySourceStatusEvent = "telemetry-core:source-status";
export const telemetrySourceStatusRequestEvent = "telemetry-core:source-status:get";

export type TelemetrySourceStatus = Readonly<{
  kind: string;
  name: string;
  live: boolean;
  available: boolean;
  state?: string;
  reconnectAttempt?: number;
}>;
