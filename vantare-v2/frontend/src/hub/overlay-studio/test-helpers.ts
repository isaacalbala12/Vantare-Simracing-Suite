import { expect } from "vitest";
import { buildMockTelemetry } from "../../overlay/core/mock-scenarios";
import { createTelemetryRateCoordinator } from "../../overlay/core/telemetry-rate-coordinator";

export function createTestTelemetryCoordinator() {
  const coordinator = createTelemetryRateCoordinator();
  coordinator.publish(
    buildMockTelemetry({ session: "race", location: "track", state: "ready" }),
  );
  return coordinator;
}

export function expectDisabled(element: Element): void {
  expect((element as HTMLButtonElement).disabled).toBe(true);
}

export function expectEnabled(element: Element): void {
  expect((element as HTMLButtonElement).disabled).toBe(false);
}