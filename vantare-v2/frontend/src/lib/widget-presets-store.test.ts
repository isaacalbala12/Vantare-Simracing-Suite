import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { listPresets } from "./widget-presets-store";
import type { WidgetPreset } from "./widget-presets";

type EventHandler = (event: { data?: unknown }) => void;

const handlers = new Map<string, EventHandler[]>();
const emitted: { name: string; data: unknown }[] = [];

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: vi.fn((name: string, handler: EventHandler) => {
      if (!handlers.has(name)) {
        handlers.set(name, []);
      }
      handlers.get(name)!.push(handler);
      return () => {
        const list = handlers.get(name) ?? [];
        const idx = list.indexOf(handler);
        if (idx >= 0) {
          list.splice(idx, 1);
        }
      };
    }),
    Emit: vi.fn((name: string, data: unknown) => {
      emitted.push({ name, data });
      for (const handler of handlers.get(name) ?? []) {
        handler({ data });
      }
    }),
  },
}));

function emitResponse(requestId: string, presets: WidgetPreset[]) {
  for (const handler of handlers.get("preset:list:response") ?? []) {
    handler({ data: { requestId, presets } });
  }
}

describe("listPresets", () => {
  beforeEach(() => {
    handlers.clear();
    emitted.length = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves only responses whose requestId matches the request", async () => {
    const promiseRelative = listPresets("relative");
    const promiseDelta = listPresets("delta");

    const reqRelative = emitted.find(
      (e) => e.name === "preset:list" && (e.data as { widgetType?: string }).widgetType === "relative",
    )?.data as { requestId?: string } | undefined;
    const reqDelta = emitted.find(
      (e) => e.name === "preset:list" && (e.data as { widgetType?: string }).widgetType === "delta",
    )?.data as { requestId?: string } | undefined;

    expect(reqRelative?.requestId).toBeDefined();
    expect(reqDelta?.requestId).toBeDefined();
    expect(reqRelative?.requestId).not.toBe(reqDelta?.requestId);

    // Emit a response targeted at the relative request, but with delta-shaped presets.
    emitResponse(reqRelative!.requestId!, [
      { id: "d1", name: "D1", widgetType: "delta", appearance: {}, createdAt: "", updatedAt: "" },
    ]);

    const relativePresets = await promiseRelative;
    expect(relativePresets).toHaveLength(1);
    expect(relativePresets[0].widgetType).toBe("delta");

    // The delta request must still be pending until its own response arrives.
    emitResponse(reqDelta!.requestId!, [
      { id: "r1", name: "R1", widgetType: "relative", appearance: {}, createdAt: "", updatedAt: "" },
    ]);

    const deltaPresets = await promiseDelta;
    expect(deltaPresets).toHaveLength(1);
    expect(deltaPresets[0].widgetType).toBe("relative");
  });

  it("rejects when the backend response times out", async () => {
    const promise = listPresets("relative");

    vi.advanceTimersByTime(10001);

    await expect(promise).rejects.toThrow("Timeout waiting for preset list response");
  });
});
