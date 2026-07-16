import { afterEach, describe, expect, it, vi } from "vitest";
import { generateAnimatedTelemetry } from "../widgets/mock-telemetry";
import { createTelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import { createSseTelemetryAdapter, type EventSourceLike } from "./sse-telemetry-adapter";

class MockEventSource implements EventSourceLike {
  private listeners = new Map<string, Array<(event: { data: unknown }) => void>>();

  constructor(readonly url: string) {}

  addEventListener(type: string, listener: (event: { data: unknown }) => void): void {
    const bucket = this.listeners.get(type) ?? [];
    bucket.push(listener);
    this.listeners.set(type, bucket);
  }

  emit(type: string, data: unknown) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data });
    }
  }

  close() {
    this.listeners.clear();
  }
}

describe("createSseTelemetryAdapter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates one EventSource and cleans up on stop", () => {
    const created: MockEventSource[] = [];
    const coordinator = createTelemetryRateCoordinator({ now: () => 1_000 });
    const adapter = createSseTelemetryAdapter({
      coordinator,
      url: "/telemetry/stream",
      createEventSource: (url) => {
        const source = new MockEventSource(url);
        created.push(source);
        return source;
      },
    });

    adapter.start();
    adapter.start();
    expect(created).toHaveLength(1);
    expect(created[0]?.url).toBe("/telemetry/stream");

    adapter.stop();
    expect(created[0]?.listeners.size).toBe(0);
    expect(coordinator.getSnapshot(15).status).toBe("disconnected");
    coordinator.dispose();
  });

  it("publishes disconnected on transport error and ready on telemetry events", () => {
    let now = 1_000;
    const coordinator = createTelemetryRateCoordinator({ now: () => now });
    const listener = vi.fn();
    coordinator.subscribe(30, listener);

    let source: MockEventSource | null = null;
    const adapter = createSseTelemetryAdapter({
      coordinator,
      url: "/telemetry/stream",
      createEventSource: (url) => {
        source = new MockEventSource(url);
        return source;
      },
      now: () => now,
    });

    adapter.start();
    source?.emit("telemetry", generateAnimatedTelemetry(900));
    expect(coordinator.getSnapshot(30).status).toBe("ready");

    source?.emit("error", null);
    expect(coordinator.getSnapshot(30).status).toBe("disconnected");
    expect(listener).toHaveBeenCalled();

    source?.emit("telemetry", generateAnimatedTelemetry(1_200));
    expect(coordinator.getSnapshot(30).status).toBe("ready");

    adapter.stop();
    coordinator.dispose();
  });
});