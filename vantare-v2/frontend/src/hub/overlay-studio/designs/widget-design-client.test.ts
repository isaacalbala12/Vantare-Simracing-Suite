import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WidgetDesignV1 } from "../../../overlay/core/widget-design";
import type { StudioEventTransport } from "../state/studio-profile-client";
import { createWidgetDesignClient, type WidgetDesignClient } from "./widget-design-client";

function sampleDesign(overrides: Partial<WidgetDesignV1> = {}): WidgetDesignV1 {
  return {
    id: "design-1",
    name: "My Design",
    widgetType: "delta",
    systemId: "vantare-original",
    systemVersion: 1,
    configVersion: 1,
    visual: { showHeader: true },
    includesContent: false,
    origin: "user",
    ...overrides,
  };
}

type MockTransport = StudioEventTransport & {
  listeners: Map<string, Set<(payload: unknown) => void>>;
  emitted: Array<{ name: string; payload: unknown }>;
};

function createMockTransport(): MockTransport {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  return {
    listeners,
    emitted: [],
    emit(name, payload) {
      this.emitted.push({ name, payload });
      for (const listener of listeners.get(name) ?? []) {
        listener({ data: payload });
      }
    },
    on(name, listener) {
      const bucket = listeners.get(name) ?? new Set();
      bucket.add(listener);
      listeners.set(name, bucket);
      return () => bucket.delete(listener);
    },
  };
}

describe("createWidgetDesignClient", () => {
  let transport: MockTransport;
  let client: WidgetDesignClient;

  beforeEach(() => {
    vi.useFakeTimers();
    transport = createMockTransport();
    client = createWidgetDesignClient(transport);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("correlates list responses by request id", async () => {
    const listPromise = client.list("delta");
    const request = transport.emitted[0];
    expect(request.name).toBe("design:list");
    const requestId = (request.payload as { requestId: string }).requestId;

    transport.emit("design:list:response", {
      requestId: "other",
      designs: [sampleDesign({ id: "wrong" })],
    });
    transport.emit("design:list:response", {
      requestId,
      designs: [sampleDesign()],
    });

    await expect(listPromise).resolves.toEqual([sampleDesign()]);
  });

  it("unsubscribes list listeners after a successful response", async () => {
    const listPromise = client.list();
    const requestId = (transport.emitted[0].payload as { requestId: string }).requestId;
    transport.emit("design:list:response", { requestId, designs: [] });
    await listPromise;

    expect(transport.listeners.get("design:list:response")?.size ?? 0).toBe(0);
    expect(transport.listeners.get("design:error")?.size ?? 0).toBe(0);
  });

  it("cleans up list listeners after timeout", async () => {
    const listPromise = client.list("delta");
    const rejection = expect(listPromise).rejects.toThrow(/timeout/i);
    vi.advanceTimersByTime(10_001);
    await rejection;
    expect(transport.listeners.get("design:list:response")?.size ?? 0).toBe(0);
  });

  it("resolves save with validated design payload", async () => {
    const savePromise = client.save(sampleDesign());
    transport.emit("design:saved", { design: sampleDesign({ name: "Saved" }) });
    await expect(savePromise).resolves.toEqual(sampleDesign({ name: "Saved" }));
  });

  it("rejects save errors from design:error", async () => {
    const savePromise = client.save(sampleDesign());
    transport.emit("design:error", { operation: "save", message: "disk full" });
    await expect(savePromise).rejects.toThrow(/disk full/);
  });

  it("resolves delete when the deleted id matches", async () => {
    const deletePromise = client.delete("design-1");
    transport.emit("design:deleted", { id: "other" });
    transport.emit("design:deleted", { id: "design-1" });
    await expect(deletePromise).resolves.toBeUndefined();
  });

  it("resolves rename when the renamed id matches", async () => {
    const renamePromise = client.rename("design-1", "Renamed");
    transport.emit("design:renamed", { id: "design-1", name: "Renamed" });
    await expect(renamePromise).resolves.toBeUndefined();
  });

  it("unsubscribes save listeners after terminal response", async () => {
    const savePromise = client.save(sampleDesign());
    transport.emit("design:saved", { design: sampleDesign() });
    await savePromise;
    expect(transport.listeners.get("design:saved")?.size ?? 0).toBe(0);
    expect(transport.listeners.get("design:error")?.size ?? 0).toBe(0);
  });
});