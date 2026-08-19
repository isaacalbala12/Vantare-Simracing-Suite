import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createStrategyCatalogClient,
  StrategyCatalogError,
  type StrategyCatalogEventTransport,
} from "./strategy-catalog-client";

type MockTransport = StrategyCatalogEventTransport & {
  emitted: Array<{ name: string; payload: unknown }>;
  listeners: Map<string, Set<(payload: unknown) => void>>;
};

function createTransport(): MockTransport {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  return {
    emitted: [],
    listeners,
    emit(name, payload) { this.emitted.push({ name, payload }); },
    on(name, listener) {
      const bucket = listeners.get(name) ?? new Set();
      bucket.add(listener);
      listeners.set(name, bucket);
      return () => bucket.delete(listener);
    },
  };
}

function emit(transport: MockTransport, name: string, payload: unknown): void {
  for (const listener of transport.listeners.get(name) ?? []) {
    listener({ data: [payload] });
  }
}

function result(status: "ready" | "recovered" | "stale" | "offline" = "ready") {
  return {
    version: "strategy.official-catalog.result.v1",
    requestId: "catalog-1",
    ok: true,
    result: {
      status,
      ...(status === "stale" || status === "offline"
        ? { warning: "Se muestra el último catálogo verificado." }
        : {}),
      catalog: {
        sequence: 7,
        publishedAt: "2026-08-10T09:00:00Z",
        keyId: "vantare-2026-01",
        trustVersion: 3,
        entries: [{
          id: "spa-hypercar",
          title: "6h Spa · Hypercar",
          summary: "Plan oficial para carrera seca.",
          compatibility: {
            simulator: "Le Mans Ultimate",
            circuit: "Spa-Francorchamps",
            car: "Hypercar",
            event: "6 horas",
          },
          package: "AQID/w==",
        }],
      },
    },
  };
}

describe("createStrategyCatalogClient", () => {
  let transport: MockTransport;

  beforeEach(() => {
    vi.useFakeTimers();
    transport = createTransport();
  });

  afterEach(() => vi.useRealTimers());

  it("sends load and refresh commands and correlates a Wails-array result", async () => {
    const client = createStrategyCatalogClient(transport);
    const loading = client.load("catalog-1");

    expect(transport.emitted[0]).toEqual({
      name: "strategy:catalog:command",
      payload: {
        version: "strategy.official-catalog.command.v1",
        requestId: "catalog-1",
        operation: "load",
      },
    });
    emit(transport, "strategy:catalog:result", result());
    await expect(loading).resolves.toMatchObject({
      status: "ready",
      catalog: { sequence: 7, entries: [{ id: "spa-hypercar" }] },
    });

    const refreshing = client.refresh("catalog-2");
    expect(transport.emitted[1]).toMatchObject({ payload: { operation: "refresh", requestId: "catalog-2" } });
    emit(transport, "strategy:catalog:result", { ...result("offline"), requestId: "catalog-2" });
    await expect(refreshing).resolves.toMatchObject({ status: "offline" });
  });

  it("ignores a result for another request", async () => {
    const client = createStrategyCatalogClient(transport);
    const pending = client.load("catalog-1");
    emit(transport, "strategy:catalog:result", { ...result(), requestId: "other" });
    emit(transport, "strategy:catalog:result", result("recovered"));
    await expect(pending).resolves.toMatchObject({ status: "recovered" });
  });

  it.each([undefined, "", 42])(
    "ignores an uncorrelated requestId %s while two requests are pending",
    async (uncorrelated) => {
      const client = createStrategyCatalogClient(transport);
      const firstResolved = vi.fn();
      const secondResolved = vi.fn();
      const first = client.load("catalog-1").then(firstResolved);
      const second = client.refresh("catalog-2").then(secondResolved);

      const payload = { ...result(), requestId: uncorrelated };
      emit(transport, "strategy:catalog:result", payload);
      emit(transport, "strategy:catalog:error", {
        version: "strategy.official-catalog.result.v1",
        requestId: uncorrelated,
        ok: false,
        errorCode: "catalog_unavailable",
        message: "No disponible.",
      });
      await Promise.resolve();
      expect(firstResolved).not.toHaveBeenCalled();
      expect(secondResolved).not.toHaveBeenCalled();

      emit(transport, "strategy:catalog:result", result());
      emit(transport, "strategy:catalog:result", { ...result("offline"), requestId: "catalog-2" });
      await Promise.all([first, second]);
      expect(firstResolved).toHaveBeenCalledOnce();
      expect(secondResolved).toHaveBeenCalledOnce();
    },
  );

  it.each(["ready", "recovered", "stale", "offline"] as const)(
    "accepts the %s status without changing verified entries",
    async (status) => {
      const client = createStrategyCatalogClient(transport);
      const pending = client.load("catalog-1");
      emit(transport, "strategy:catalog:result", result(status));
      const received = await pending;
      expect(received.status).toBe(status);
      expect(Array.from(received.catalog.entries[0].packageBytes)).toEqual([1, 2, 3, 255]);
    },
  );

  it.each([
    ["version", { version: "strategy.official-catalog.result.v2" }],
    ["ok", { ok: "true" }],
    ["status", { result: { ...result().result, status: "cached" } }],
    ["sequence", { result: { ...result().result, catalog: { ...result().result.catalog, sequence: 0 } } }],
    ["trustVersion", { result: { ...result().result, catalog: { ...result().result.catalog, trustVersion: Number.MAX_SAFE_INTEGER + 1 } } }],
    ["entries", { result: { ...result().result, catalog: { ...result().result.catalog, entries: {} } } }],
    ["compatibility", { result: { ...result().result, catalog: { ...result().result.catalog, entries: [{ ...result().result.catalog.entries[0], compatibility: { simulator: "LMU" } }] } } }],
    ["base64", { result: { ...result().result, catalog: { ...result().result.catalog, entries: [{ ...result().result.catalog.entries[0], package: "AQID/w" }] } } }],
    ["empty base64", { result: { ...result().result, catalog: { ...result().result.catalog, entries: [{ ...result().result.catalog.entries[0], package: "" }] } } }],
    ["warning", { result: { ...result("offline").result, warning: "" } }],
    ["unexpected warning", { result: { ...result().result, warning: "No corresponde a ready." } }],
  ])("rejects malformed %s instead of filling defaults", async (_field, override) => {
    const client = createStrategyCatalogClient(transport);
    const pending = client.load("catalog-1");
    emit(transport, "strategy:catalog:result", { ...result(), ...override });
    await expect(pending).rejects.toThrow(/catalog/i);
  });

  it.each([
    ["result envelope", { extra: true }],
    ["result body", { result: { ...result().result, extra: true } }],
    ["catalog", { result: { ...result().result, catalog: { ...result().result.catalog, extra: true } } }],
    ["entry", { result: { ...result().result, catalog: { ...result().result.catalog, entries: [{ ...result().result.catalog.entries[0], extra: true }] } } }],
    ["compatibility", { result: { ...result().result, catalog: { ...result().result.catalog, entries: [{ ...result().result.catalog.entries[0], compatibility: { ...result().result.catalog.entries[0].compatibility, extra: true } }] } } }],
  ])("rejects unknown fields in the %s", async (_level, override) => {
    const client = createStrategyCatalogClient(transport);
    const pending = client.load("catalog-1");
    emit(transport, "strategy:catalog:result", { ...result(), ...override });
    await expect(pending).rejects.toThrow(/catalog/i);
  });

  it("rejects unknown fields in a public error envelope", async () => {
    const client = createStrategyCatalogClient(transport);
    const pending = client.load("catalog-1");
    emit(transport, "strategy:catalog:error", {
      version: "strategy.official-catalog.result.v1",
      requestId: "catalog-1",
      ok: false,
      errorCode: "catalog_unavailable",
      message: "No disponible.",
      extra: true,
    });
    await expect(pending).rejects.toThrow(/catalog/i);
  });

  it("rejects more than 128 entries and unsafe or unordered IDs", async () => {
    const baseEntry = result().result.catalog.entries[0];
    const invalidEntries = [
      Array.from({ length: 129 }, (_, index) => ({ ...baseEntry, id: `entry-${String(index).padStart(3, "0")}` })),
      [{ ...baseEntry, id: "second" }, { ...baseEntry, id: "first" }],
      [{ ...baseEntry, id: "unsafe id" }],
    ];
    for (const entries of invalidEntries) {
      const client = createStrategyCatalogClient(transport);
      const pending = client.load("catalog-1");
      emit(transport, "strategy:catalog:result", {
        ...result(),
        result: { ...result().result, catalog: { ...result().result.catalog, entries } },
      });
      await expect(pending).rejects.toThrow(/catalog/i);
    }
  });

  it.each([
    ["title", "é".repeat(81)],
    ["summary", "é".repeat(513)],
  ])("enforces the Go UTF-8 byte limit for %s", async (field, value) => {
    const entry = { ...result().result.catalog.entries[0], [field]: value };
    const client = createStrategyCatalogClient(transport);
    const pending = client.load("catalog-1");
    emit(transport, "strategy:catalog:result", {
      ...result(),
      result: { ...result().result, catalog: { ...result().result.catalog, entries: [entry] } },
    });
    await expect(pending).rejects.toThrow(/catalog/i);
  });

  it("enforces compatibility UTF-8 limits and the 4 MiB package ceiling", async () => {
    const baseEntry = result().result.catalog.entries[0];
    const invalidEntries = [
      { ...baseEntry, compatibility: { ...baseEntry.compatibility, simulator: "é".repeat(65) } },
      { ...baseEntry, package: globalThis.btoa("A".repeat(4 * 1024 * 1024 + 1)) },
    ];
    for (const entry of invalidEntries) {
      const client = createStrategyCatalogClient(transport);
      const pending = client.load("catalog-1");
      emit(transport, "strategy:catalog:result", {
        ...result(),
        result: { ...result().result, catalog: { ...result().result.catalog, entries: [entry] } },
      });
      await expect(pending).rejects.toThrow(/catalog/i);
    }
  });

  it("accepts a canonical package exactly at the 4 MiB ceiling", async () => {
    const packageBytes = "AAAA".repeat(Math.floor((4 * 1024 * 1024) / 3)) + "AA==";
    const entry = { ...result().result.catalog.entries[0], package: packageBytes };
    const client = createStrategyCatalogClient(transport);
    const pending = client.load("catalog-1");
    emit(transport, "strategy:catalog:result", {
      ...result(),
      result: { ...result().result, catalog: { ...result().result.catalog, entries: [entry] } },
    });
    await expect(pending).resolves.toMatchObject({
      catalog: { entries: [{ packageBytes: { byteLength: 4 * 1024 * 1024 } }] },
    });
  });

  it("rejects more than 16 MiB of decoded packages before decoding the fifth package", async () => {
    const packageBytes = "AAAA".repeat(Math.floor((4 * 1024 * 1024) / 3)) + "AA==";
    const baseEntry = result().result.catalog.entries[0];
    const entries = Array.from({ length: 5 }, (_, index) => ({
      ...baseEntry,
      id: `entry-${index}`,
      package: packageBytes,
    }));
    const atob = vi.spyOn(globalThis, "atob");
    const client = createStrategyCatalogClient(transport);
    const pending = client.load("catalog-1");
    emit(transport, "strategy:catalog:result", {
      ...result(),
      result: { ...result().result, catalog: { ...result().result.catalog, entries } },
    });

    await expect(pending).rejects.toThrow(/catalog/i);
    expect(atob).toHaveBeenCalledTimes(4);
  });

  it("exposes a correlated public error and no internal assumptions", async () => {
    const client = createStrategyCatalogClient(transport);
    const pending = client.refresh("catalog-1");
    emit(transport, "strategy:catalog:error", {
      version: "strategy.official-catalog.result.v1",
      requestId: "catalog-1",
      ok: false,
      errorCode: "catalog_unavailable",
      message: "No hay un catálogo oficial verificado disponible.",
    });
    await expect(pending).rejects.toMatchObject({
      name: "StrategyCatalogError",
      code: "catalog_unavailable",
      message: "No hay un catálogo oficial verificado disponible.",
    } satisfies Partial<StrategyCatalogError>);
  });

  it("times out and removes listeners", async () => {
    const client = createStrategyCatalogClient(transport, 100);
    const pending = client.load("catalog-1");
    const rejection = expect(pending).rejects.toThrow(/timeout/i);
    await vi.advanceTimersByTimeAsync(101);
    await rejection;
    expect(transport.listeners.get("strategy:catalog:result")?.size ?? 0).toBe(0);
    expect(transport.listeners.get("strategy:catalog:error")?.size ?? 0).toBe(0);
  });

  it("uses a 20 second default timeout so the 15 second backend can answer", async () => {
    const client = createStrategyCatalogClient(transport);
    const pending = client.load("catalog-1");
    const settled = vi.fn();
    void pending.catch(settled);
    await vi.advanceTimersByTimeAsync(19_999);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).rejects.toThrow(/timeout/i);
  });

  it("cancels one request and ignores its late result", async () => {
    const client = createStrategyCatalogClient(transport);
    const pending = client.load("catalog-1");
    expect(client.cancel("catalog-1")).toBe(true);
    await expect(pending).rejects.toThrow(/cancel/i);
    emit(transport, "strategy:catalog:result", result());
    expect(client.cancel("catalog-1")).toBe(false);
  });

  it("fails cleanly when the Wails transport is unavailable", async () => {
    transport.emit = () => { throw new Error("Wails unavailable"); };
    const client = createStrategyCatalogClient(transport);
    await expect(client.refresh("catalog-1")).rejects.toThrow(/Wails unavailable/i);
    expect(transport.listeners.get("strategy:catalog:result")?.size ?? 0).toBe(0);
  });

  it("cancels on dispose, ignores late results and refuses future work", async () => {
    const client = createStrategyCatalogClient(transport);
    const pending = client.load("catalog-1");
    client.dispose();
    await expect(pending).rejects.toThrow(/disposed/i);
    emit(transport, "strategy:catalog:result", result());
    await expect(client.refresh("catalog-2")).rejects.toThrow(/disposed/i);
    expect(transport.listeners.get("strategy:catalog:result")?.size ?? 0).toBe(0);
  });
});
