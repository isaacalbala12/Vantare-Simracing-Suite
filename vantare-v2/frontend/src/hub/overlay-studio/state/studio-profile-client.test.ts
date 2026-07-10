import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@wailsio/runtime", () => ({
  Events: {
    Emit: vi.fn(),
    On: vi.fn(() => () => {}),
  },
}));
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import type { ProfileDocumentV3 } from "../../../overlay/core/profile-document";
import {
  createStudioProfileClient,
  type StudioEventTransport,
  type StudioProfileClient,
} from "./studio-profile-client";

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

describe("createStudioProfileClient", () => {
  let transport: MockTransport;
  let client: StudioProfileClient;

  beforeEach(() => {
    vi.useFakeTimers();
    transport = createMockTransport();
    client = createStudioProfileClient(transport);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("correlates load responses by request id", async () => {
    const loadPromise = client.load("profiles/test.json");
    const request = transport.emitted[0];
    expect(request.name).toBe("studio:profile:load");
    const requestId = (request.payload as { requestId: string }).requestId;

    transport.emit("studio:profile:loaded", {
      requestId: "other",
      document: buildDocument(),
      revision: "rev-other",
    });
    transport.emit("studio:profile:loaded", {
      requestId,
      document: buildDocument(),
      revision: "rev-1",
      migratedFrom: 2,
    });

    await expect(loadPromise).resolves.toEqual({
      document: buildDocument(),
      revision: "rev-1",
      migratedFrom: 2,
    });
  });

  it("unsubscribes load listeners after a successful response", async () => {
    const loadPromise = client.load("profiles/test.json");
    const requestId = (transport.emitted[0].payload as { requestId: string }).requestId;
    transport.emit("studio:profile:loaded", {
      requestId,
      document: buildDocument(),
      revision: "rev-1",
    });
    await loadPromise;

    expect(transport.listeners.get("studio:profile:loaded")?.size ?? 0).toBe(0);
    expect(transport.listeners.get("studio:profile:error")?.size ?? 0).toBe(0);
  });

  it("cleans up load listeners after timeout", async () => {
    const loadPromise = client.load("profiles/test.json");
    const rejection = expect(loadPromise).rejects.toThrow(/timeout/i);
    vi.advanceTimersByTime(10_001);
    await rejection;
    expect(transport.listeners.get("studio:profile:loaded")?.size ?? 0).toBe(0);
  });

  it("resolves a saved profile response", async () => {
    const document = buildDocument();
    const savePromise = client.save({ document, expectedRevision: "rev-1" });
    const requestId = (transport.emitted[0].payload as { requestId: string }).requestId;
    transport.emit("studio:profile:saved", { requestId, document, revision: "rev-2" });
    await expect(savePromise).resolves.toMatchObject({
      status: "saved",
      revision: "rev-2",
    });
  });

  it("resolves a save conflict response", async () => {
    const conflictPromise = client.save({ document: buildDocument(), expectedRevision: "rev-2" });
    const conflictRequestId = (transport.emitted[0].payload as { requestId: string }).requestId;
    transport.emit("studio:profile:conflict", {
      requestId: conflictRequestId,
      message: "revision mismatch",
    });
    await expect(conflictPromise).resolves.toEqual({
      status: "conflict",
      message: "revision mismatch",
    });
  });

  it("resolves a save error response", async () => {
    const errorPromise = client.save({ document: buildDocument(), expectedRevision: "rev-2" });
    const errorRequestId = (transport.emitted[0].payload as { requestId: string }).requestId;
    transport.emit("studio:profile:error", {
      requestId: errorRequestId,
      operation: "save",
      message: "disk full",
    });
    await expect(errorPromise).resolves.toEqual({
      status: "error",
      message: "disk full",
    });
  });

  it("unsubscribes save listeners after the terminal response", async () => {
    const savePromise = client.save({ document: buildDocument(), expectedRevision: "rev-1" });
    const requestId = (transport.emitted[0].payload as { requestId: string }).requestId;
    transport.emit("studio:profile:conflict", { requestId, message: "conflict" });
    await savePromise;

    expect(transport.listeners.get("studio:profile:saved")?.size ?? 0).toBe(0);
    expect(transport.listeners.get("studio:profile:conflict")?.size ?? 0).toBe(0);
    expect(transport.listeners.get("studio:profile:error")?.size ?? 0).toBe(0);
  });
});