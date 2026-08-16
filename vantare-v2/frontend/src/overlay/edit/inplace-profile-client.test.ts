import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@wailsio/runtime", () => ({
  Events: {
    Emit: vi.fn(),
    On: vi.fn(() => () => {}),
  },
}));
import { deltaDefinition } from "../widget-types/delta/delta-definition";
import type { ProfileDocumentV3 } from "../core/profile-document";
import type { StudioEventTransport, StudioProfileClient } from "../../hub/overlay-studio/state/studio-profile-client";
import { createInPlaceProfileClient } from "./inplace-profile-client";

function buildDocument(): ProfileDocumentV3 {
  return {
    schemaVersion: 3,
    id: "profile-1",
    name: "Test Profile",
    displayMode: "edit",
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general",
        widgets: [deltaDefinition.createDefault("delta-1")],
      },
    },
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

describe("createInPlaceProfileClient", () => {
  let transport: MockTransport;
  let client: StudioProfileClient;

  beforeEach(() => {
    transport = createMockTransport();
    client = createInPlaceProfileClient({
      document: buildDocument(),
      revision: "rev-1",
      transport,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads from memory without emitting a request or round-trip", async () => {
    const loaded = await client.load("whatever.json");
    expect(loaded.document).toEqual(buildDocument());
    expect(loaded.revision).toBe("rev-1");
    expect(transport.emitted).toHaveLength(0);
  });

  it("returns a clone so callers cannot mutate the in-memory document", async () => {
    const loaded = await client.load("whatever.json");
    loaded.document.layouts.general.widgets[0].layout.x = 999;
    const again = await client.load("whatever.json");
    expect(again.document.layouts.general.widgets[0].layout.x).not.toBe(999);
  });

  it("emits overlay:edit-layout:save and never studio:profile:save", async () => {
    const savePromise = client.save({ document: buildDocument(), expectedRevision: "rev-1" });
    expect(transport.emitted).toHaveLength(1);
    expect(transport.emitted[0].name).toBe("overlay:edit-layout:save");
    const payload = transport.emitted[0].payload as { requestId: string; expectedRevision: string };
    expect(payload.expectedRevision).toBe("rev-1");

    transport.emit("studio:profile:saved", {
      requestId: payload.requestId,
      document: buildDocument(),
      revision: "rev-2",
    });
    await expect(savePromise).resolves.toMatchObject({ status: "saved", revision: "rev-2" });
  });

  it("correlates responses by request id and ignores others", async () => {
    const savePromise = client.save({ document: buildDocument(), expectedRevision: "rev-1" });
    const requestId = (transport.emitted[0].payload as { requestId: string }).requestId;

    transport.emit("studio:profile:conflict", { requestId: "other", message: "nope" });
    transport.emit("studio:profile:saved", {
      requestId,
      document: buildDocument(),
      revision: "rev-2",
    });

    await expect(savePromise).resolves.toMatchObject({ status: "saved", revision: "rev-2" });
  });

  it("resolves conflicts and errors through the same channel", async () => {
    const conflictPromise = client.save({ document: buildDocument(), expectedRevision: "rev-1" });
    const conflictId = (transport.emitted[0].payload as { requestId: string }).requestId;
    transport.emit("studio:profile:conflict", { requestId: conflictId, message: "revision mismatch" });
    await expect(conflictPromise).resolves.toEqual({ status: "conflict", message: "revision mismatch" });

    const errorPromise = client.save({ document: buildDocument(), expectedRevision: "rev-1" });
    // emitted[1] es el conflict emitido por el propio test; el segundo save
    // ocupa emitted[2].
    const errorId = (transport.emitted[2].payload as { requestId: string }).requestId;
    transport.emit("studio:profile:error", { requestId: errorId, operation: "save", message: "disk full" });
    await expect(errorPromise).resolves.toEqual({ status: "error", message: "disk full" });
  });

  it("generates a fresh request id per save", async () => {
    client.save({ document: buildDocument(), expectedRevision: "rev-1" });
    const firstId = (transport.emitted[0].payload as { requestId: string }).requestId;
    client.save({ document: buildDocument(), expectedRevision: "rev-1" });
    const secondId = (transport.emitted[1].payload as { requestId: string }).requestId;
    expect(secondId).not.toBe(firstId);
  });

  it("cleans up listeners after response and after timeout", async () => {
    const savePromise = client.save({ document: buildDocument(), expectedRevision: "rev-1" });
    const requestId = (transport.emitted[0].payload as { requestId: string }).requestId;
    transport.emit("studio:profile:saved", { requestId, document: buildDocument(), revision: "rev-2" });
    await savePromise;
    expect(transport.listeners.get("studio:profile:saved")?.size ?? 0).toBe(0);

    vi.useFakeTimers();
    const timedOut = client.save({ document: buildDocument(), expectedRevision: "rev-1" });
    const rejection = expect(timedOut).rejects.toThrow(/timeout/i);
    vi.advanceTimersByTime(10_001);
    await rejection;
    expect(transport.listeners.get("studio:profile:saved")?.size ?? 0).toBe(0);
  });
});
