import { describe, expect, it, test, vi } from "vitest";
import { eventName, type ProductID } from "./contracts";
import { createProjectionTransportStore } from "./store";

const product: ProductID = "engineer";
const capturedAt = "2026-07-30T00:00:00Z";

describe("projection transport store", () => {
  test.skip("ISA-371 D-07: acepta una revisión de status mayor no contigua", () => {
    const store = readyStore();
    expect(() =>
      store.ingest(eventName(product, "status"), status(4, "degraded")),
    ).not.toThrow();
    expect(store.getSnapshot().status?.statusRevision).toBe(4);
  });

  it("applies a verified-shape merge patch after a full", () => {
    const store = readyStore();
    store.ingest(
      eventName(product, "projection"),
      projection("full", 1, 1, { player: { speed: 10, gear: 2 } }),
    );
    store.ingest(
      eventName(product, "projection"),
      projection("delta", 1, 2, { player: { speed: 11, gear: null } }),
    );
    expect(store.getSnapshot().snapshot?.payload).toEqual({
      player: { speed: 11 },
    });
  });

  it("requires a full for first delivery and after an epoch change", () => {
    const store = readyStore();
    expect(() =>
      store.ingest(
        eventName(product, "projection"),
        projection("delta", 1, 1, { value: 1 }),
      ),
    ).toThrow("delta-without-base");
    store.ingest(
      eventName(product, "projection"),
      projection("full", 1, 1, { value: 1 }),
    );
    expect(() =>
      store.ingest(
        eventName(product, "projection"),
        projection("delta", 2, 1, { value: 2 }),
      ),
    ).toThrow("snapshot-regression");
  });

  it("accepts a full gap as explicit resync and rejects regressions", () => {
    const store = readyStore();
    store.ingest(
      eventName(product, "projection"),
      projection("full", 1, 1, { value: 1 }),
    );
    store.ingest(
      eventName(product, "projection"),
      projection("full", 1, 4, { value: 4 }),
    );
    expect(store.getSnapshot().diagnostics.at(-1)?.code).toBe(
      "snapshot-resync",
    );
    expect(() =>
      store.ingest(
        eventName(product, "projection"),
        projection("full", 1, 3, { value: 3 }),
      ),
    ).toThrow("snapshot-regression");
  });

  it("never exposes a status with a snapshot from another revision", () => {
    const store = readyStore();
    store.ingest(
      eventName(product, "projection"),
      projection("full", 1, 1, { value: 1 }),
    );
    store.ingest(eventName(product, "status"), status(2, "degraded"));
    expect(store.getSnapshot().snapshot).toBeUndefined();
    expect(() =>
      store.ingest(
        eventName(product, "projection"),
        { ...projection("full", 1, 2, { value: 2 }), statusRevision: 1 },
      ),
    ).toThrow("status-gap");
    expect(() =>
      store.ingest(eventName(product, "status"), status(4, "degraded")),
    ).toThrow("status-gap");
    store.ingest(
      eventName(product, "projection"),
      { ...projection("full", 1, 2, { value: 2 }), statusRevision: 2 },
    );
    expect(store.getSnapshot().snapshot?.sequence).toBe(2);
  });

  it("keeps the hidden cursor when status advances", () => {
    const store = readyStore();
    store.ingest(
      eventName(product, "projection"),
      projection("full", 2, 5, { value: 5 }),
    );
    store.ingest(eventName(product, "status"), status(2, "degraded"));
    expect(store.getSnapshot().snapshot).toBeUndefined();
    expect(() =>
      store.ingest(eventName(product, "projection"), {
        ...projection("full", 1, 1, { value: 1 }),
        statusRevision: 2,
      }),
    ).toThrow("snapshot-regression");
  });

  it("reexposes an identical cursor under the new coherent status revision", () => {
    const store = readyStore();
    store.ingest(
      eventName(product, "projection"),
      projection("full", 1, 1, { value: 1 }),
    );
    store.ingest(eventName(product, "status"), status(2, "degraded"));
    expect(store.getSnapshot().snapshot).toBeUndefined();
    store.ingest(eventName(product, "projection"), {
      ...projection("full", 1, 1, { value: 1 }),
      statusRevision: 2,
    });
    expect(store.getSnapshot().snapshot).toEqual(
      expect.objectContaining({
        epoch: 1,
        sequence: 1,
        statusRevision: 2,
        payload: { value: 1 },
      }),
    );
  });

  it("does not reframe one cursor with a different capture time", () => {
    const store = readyStore();
    store.ingest(
      eventName(product, "projection"),
      projection("full", 1, 1, { value: 1 }),
    );
    store.ingest(eventName(product, "status"), status(2, "degraded"));
    expect(() =>
      store.ingest(eventName(product, "projection"), {
        ...projection("full", 1, 1, { value: 1 }),
        capturedAt: "2026-07-30T00:00:01Z",
        statusRevision: 2,
      }),
    ).toThrow("snapshot-regression");
  });

  it("keeps facts on an independent exact cursor and exposes gaps", () => {
    const store = readyStore();
    store.ingest(eventName(product, "fact"), fact(1));
    expect(store.getSnapshot().facts).toHaveLength(1);
    expect(() => store.ingest(eventName(product, "fact"), fact(3))).toThrow(
      "fact-gap",
    );
    expect(store.getSnapshot().needsFactResync).toBe(true);
    store.resetFacts(2);
    store.ingest(eventName(product, "fact"), fact(3));
    expect(store.getSnapshot().facts[0]?.factSequence).toBe(3);
  });

  it("replays retained status/full idempotently after reconnect", () => {
    const store = readyStore();
    const full = projection("full", 1, 1, { value: 1 });
    store.ingest(eventName(product, "projection"), full);
    store.reconnect();
    store.ingest(eventName(product, "status"), status(1));
    store.ingest(eventName(product, "projection"), full);
    expect(store.getSnapshot().snapshot?.sequence).toBe(1);
    expect(store.getSnapshot().diagnostics.at(-1)?.code).toBe("reconnect");
  });

  it("accepts semantic reconnect duplicates with reordered payload keys", () => {
    const store = readyStore();
    store.ingest(
      eventName(product, "projection"),
      projection("full", 1, 1, { first: 1, second: 2 }),
    );
    store.ingest(
      eventName(product, "projection"),
      projection("full", 1, 1, { second: 2, first: 1 }),
    );
    expect(store.getSnapshot().snapshot?.sequence).toBe(1);
  });

  it("shares teardown across listeners and rejects later events", () => {
    const store = readyStore();
    const first = vi.fn();
    const second = vi.fn();
    store.subscribe(first);
    const unsubscribe = store.subscribe(second);
    unsubscribe();
    store.ingest(
      eventName(product, "projection"),
      projection("full", 1, 1, { value: 1 }),
    );
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    store.dispose();
    expect(() => store.subscribe(vi.fn())).toThrow("disposed");
    expect(() =>
      store.ingest(
        eventName(product, "projection"),
        projection("full", 1, 2, { value: 2 }),
      ),
    ).toThrow("disposed");
  });

  it("returns a stable immutable snapshot until an event is accepted", () => {
    const store = readyStore();
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);
    expect(() => {
      (first.status!.payload as { state: string }).state = "error";
    }).toThrow();
    store.ingest(
      eventName(product, "projection"),
      projection("full", 1, 1, { value: 1 }),
    );
    expect(store.getSnapshot()).not.toBe(first);
  });
});

function readyStore() {
  const store = createProjectionTransportStore(product);
  store.ingest(eventName(product, "status"), status(1));
  return store;
}

function status(
  statusRevision: number,
  state: "live" | "degraded" = "live",
) {
  return {
    product,
    statusRevision,
    capturedAt,
    payload: { state, reconnectAttempt: 0 },
  };
}

function projection(
  kind: "full" | "delta",
  epoch: number,
  sequence: number,
  payload: Record<string, unknown>,
) {
  return {
    product,
    projectionVersion: 1,
    epoch,
    sequence,
    kind,
    capturedAt,
    statusRevision: 1,
    payload,
  };
}

function fact(factSequence: number) {
  return {
    product,
    projectionVersion: 1,
    epoch: 1,
    sequence: 1,
    factSequence,
    capturedAt,
    statusRevision: 1,
    payload: { kind: "lap.completed" },
  };
}
