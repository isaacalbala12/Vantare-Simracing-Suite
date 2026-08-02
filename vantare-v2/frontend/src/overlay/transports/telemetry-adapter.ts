import type { TelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";

// Lifecycle boundary shared by the authoritative Wails and SSE projection
// transports. It contains no decoding or source-selection policy.
export type TelemetryAdapter = {
  coordinator: TelemetryRateCoordinator;
  start(): void;
  stop(): void;
};
