import { afterEach, describe, expect, it, vi } from "vitest";
import { generateAnimatedTelemetry } from "../widgets/mock-telemetry";
import { createTelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import { createWailsTelemetryAdapter } from "./wails-telemetry-adapter";

describe("createWailsTelemetryAdapter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("registers one transport subscription and start/stop are idempotent", () => {
    const handlers = new Map<string, (data: unknown) => void>();
    const subscribe = vi.fn((event: string, handler: (data: unknown) => void) => {
      handlers.set(event, handler);
      return () => handlers.delete(event);
    });
    const coordinator = createTelemetryRateCoordinator({ now: () => 1_000 });
    const adapter = createWailsTelemetryAdapter({ coordinator, subscribe });

    adapter.start();
    adapter.start();
    expect(subscribe).toHaveBeenCalledTimes(1);

    adapter.stop();
    adapter.stop();
    expect(coordinator.getSnapshot(15).status).toBe("disconnected");
    coordinator.dispose();
  });

  it("publishes ready snapshots and recovers after parse errors", () => {
    let now = 1_000;
    const coordinator = createTelemetryRateCoordinator({ now: () => now });
    const listener = vi.fn();
    coordinator.subscribe(15, listener);

    let handler: ((data: unknown) => void) | undefined;
    const adapter = createWailsTelemetryAdapter({
      coordinator,
      subscribe: (_event, onData) => {
        handler = onData;
        return () => {
          handler = undefined;
        };
      },
      now: () => now,
      staleAfterMs: 10_000,
    });

    adapter.start();
    handler?.(generateAnimatedTelemetry(500));
    expect(coordinator.getSnapshot(15).status).toBe("ready");
    expect(listener).not.toHaveBeenCalled();

    handler?.("not-json");
    expect(coordinator.getSnapshot(15).status).toBe("error");

    handler?.(generateAnimatedTelemetry(1_000));
    expect(coordinator.getSnapshot(15).status).toBe("ready");

    adapter.stop();
    coordinator.dispose();
  });

  it("publishes stale after the injected threshold elapses", () => {
    vi.useFakeTimers();
    let now = 1_000;
    const coordinator = createTelemetryRateCoordinator({ now: () => now });
    let handler: ((data: unknown) => void) | undefined;
    const adapter = createWailsTelemetryAdapter({
      coordinator,
      subscribe: (_event, onData) => {
        handler = onData;
        return () => undefined;
      },
      now: () => now,
      staleAfterMs: 1_000,
    });

    adapter.start();
    handler?.(generateAnimatedTelemetry(250));
    expect(coordinator.getSnapshot(15).status).toBe("ready");

    now = 2_500;
    vi.advanceTimersByTime(600);
    expect(coordinator.getSnapshot(15).status).toBe("stale");

    adapter.stop();
    coordinator.dispose();
  });
});