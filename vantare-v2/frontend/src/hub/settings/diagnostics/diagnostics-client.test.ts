import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@wailsio/runtime", () => ({
  Events: {
    Emit: vi.fn(),
    On: vi.fn(() => () => {}),
  },
}));

import {
  createDiagnosticsClient,
  type DiagnosticsEventTransport,
} from "./diagnostics-client";
import {
  fixtureCurrentSession,
  fixturePrepared,
} from "./test-fixtures";

type MockTransport = DiagnosticsEventTransport & {
  emitted: Array<{ name: string; payload: unknown }>;
  listeners: Map<string, Set<(payload: unknown) => void>>;
};

function createMockTransport(): MockTransport {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  return {
    emitted: [],
    listeners,
    emit(name, payload) {
      this.emitted.push({ name, payload });
    },
    on(name, listener) {
      const bucket = listeners.get(name) ?? new Set();
      bucket.add(listener);
      listeners.set(name, bucket);
      return () => bucket.delete(listener);
    },
  };
}

function dispatch(transport: MockTransport, name: string, payload: unknown) {
  for (const listener of transport.listeners.get(name) ?? []) {
    listener({ data: [payload] });
  }
}

function rawPrepared() {
  return {
    schemaVersion: fixturePrepared.schemaVersion,
    generatedAtUtc: fixturePrepared.generatedAtUtc,
    payload: fixturePrepared.payload,
    sha256: fixturePrepared.sha256,
    byteSize: fixturePrepared.byteSize,
  };
}

describe("createDiagnosticsClient", () => {
  let transport: MockTransport;
  let sequence: number;

  beforeEach(() => {
    vi.useFakeTimers();
    sequence = 0;
    transport = createMockTransport();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function client(timeoutMs = 10_000) {
    return createDiagnosticsClient(transport, {
      timeoutMs,
      createRequestId: () => `request-${String(++sequence).padStart(4, "0")}`,
    });
  }

  it("correlates concurrent responses and ignores foreign payloads", async () => {
    const diagnostics = client();
    const first = diagnostics.prepare();
    const second = diagnostics.prepare();
    const firstId = (transport.emitted[0].payload as { requestId: string }).requestId;
    const secondId = (transport.emitted[1].payload as { requestId: string }).requestId;

    dispatch(transport, "diagnostics:prepared", {
      requestId: "foreign-request",
      prepared: { path: "C:\\private" },
    });
    dispatch(transport, "diagnostics:prepared", {
      requestId: secondId,
      prepared: rawPrepared(),
    });
    dispatch(transport, "diagnostics:prepared", {
      requestId: firstId,
      prepared: rawPrepared(),
    });

    await expect(first).resolves.toMatchObject({ payload: fixturePrepared.payload });
    await expect(second).resolves.toMatchObject({ payload: fixturePrepared.payload });
  });

  it("cleans all listeners after success", async () => {
    const pending = client().listSessions();
    const requestId = (transport.emitted[0].payload as { requestId: string }).requestId;
    dispatch(transport, "diagnostics:sessions:listed", {
      requestId,
      result: { sessions: [fixtureCurrentSession], truncated: false },
    });
    await pending;

    expect(transport.listeners.get("diagnostics:sessions:listed")?.size ?? 0).toBe(0);
    expect(transport.listeners.get("diagnostics:error")?.size ?? 0).toBe(0);
  });

  it("times out and cleans listeners", async () => {
    const pending = client(50).prepare();
    const rejection = expect(pending).rejects.toMatchObject({
      code: "timeout",
      operation: "prepare",
    });
    await vi.advanceTimersByTimeAsync(51);
    await rejection;

    expect(transport.listeners.get("diagnostics:prepared")?.size ?? 0).toBe(0);
    expect(transport.listeners.get("diagnostics:error")?.size ?? 0).toBe(0);
    expect(transport.emitted).toContainEqual({
      name: "diagnostics:cancel",
      payload: {
        requestId: "request-0001",
        operation: "prepare",
      },
    });
  });

  it("cancels locally and cleans listeners", async () => {
    const controller = new AbortController();
    const pending = client().inspectSession(
      fixtureCurrentSession.handle,
      controller.signal,
    );
    controller.abort();

    await expect(pending).rejects.toMatchObject({
      code: "canceled",
      operation: "sessions.inspect",
    });
    expect(transport.listeners.get("diagnostics:sessions:inspected")?.size ?? 0).toBe(0);
    expect(transport.listeners.get("diagnostics:error")?.size ?? 0).toBe(0);
    expect(transport.emitted).toContainEqual({
      name: "diagnostics:cancel",
      payload: {
        requestId: "request-0001",
        operation: "sessions.inspect",
      },
    });
  });

  it("does not emit cancel for a request that completed successfully", async () => {
    const pending = client().prepare();
    const requestId = (transport.emitted[0].payload as { requestId: string }).requestId;
    dispatch(transport, "diagnostics:prepared", {
      requestId,
      prepared: rawPrepared(),
    });
    await pending;

    expect(transport.emitted.map(({ name }) => name)).toEqual([
      "diagnostics:prepare",
    ]);
  });

  it("does not emit a backend cancel when the signal was already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(client().prepare(controller.signal)).rejects.toMatchObject({
      code: "canceled",
      operation: "prepare",
    });
    expect(transport.emitted).toEqual([]);
  });

  it("maps only a correlated closed backend error", async () => {
    const pending = client().listSessions();
    const requestId = (transport.emitted[0].payload as { requestId: string }).requestId;
    dispatch(transport, "diagnostics:error", {
      requestId: "foreign-request",
      operation: "sessions.list",
      code: "list_failed",
    });
    dispatch(transport, "diagnostics:error", {
      requestId,
      operation: "sessions.list",
      code: "stale_handle",
    });

    await expect(pending).rejects.toEqual(
      expect.objectContaining({
        name: "DiagnosticsClientError",
        code: "stale_handle",
      }),
    );
  });

  it("rejects a matching response that violates the closed contract", async () => {
    const pending = client().prepare();
    const requestId = (transport.emitted[0].payload as { requestId: string }).requestId;
    dispatch(transport, "diagnostics:prepared", {
      requestId,
      prepared: { ...rawPrepared(), root: "C:\\private" },
    });

    await expect(pending).rejects.toEqual(
      expect.objectContaining({
        name: "DiagnosticsClientError",
        code: "contract_error",
      }),
    );
  });

  it("rejects prepared bytes whose SHA-256 does not match the payload", async () => {
    const pending = client().prepare();
    const requestId = (transport.emitted[0].payload as { requestId: string }).requestId;
    dispatch(transport, "diagnostics:prepared", {
      requestId,
      prepared: { ...rawPrepared(), sha256: "00".repeat(32) },
    });

    await expect(pending).rejects.toEqual(
      expect.objectContaining({
        name: "DiagnosticsClientError",
        code: "contract_error",
        operation: "prepare",
      }),
    );
  });
});
