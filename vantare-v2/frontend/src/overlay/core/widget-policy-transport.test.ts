import { describe, expect, it, vi } from "vitest";
import { createWidgetPolicyStore } from "./widget-policy-store";
import {
  createSseWidgetPolicyAdapter,
  createWailsWidgetPolicyAdapter,
  WIDGET_POLICY_CHANGED_EVENT,
  WIDGET_POLICY_GET_EVENT,
  WIDGET_POLICY_SNAPSHOT_EVENT,
  WIDGET_POLICY_STREAM_URL,
} from "./widget-policy-transport";
import type { WidgetPolicyWire } from "./widget-policy";

const freeWire: WidgetPolicyWire = {
  revision: 1,
  overlaysBasic: true,
  overlaysAdvanced: false,
  engineerAI: false,
  brandCrystal: "required",
  brandEfficiency: "required",
  brandOriginal: "none",
};

const paidWire: WidgetPolicyWire = {
  revision: 2,
  overlaysBasic: true,
  overlaysAdvanced: true,
  engineerAI: false,
  brandCrystal: "optional",
  brandEfficiency: "optional",
  brandOriginal: "none",
};

describe("createWailsWidgetPolicyAdapter", () => {
  function harness() {
    const store = createWidgetPolicyStore();
    const listeners = new Map<string, (data: unknown) => void>();
    const emitted: Array<{ event: string; payload?: unknown }> = [];
    const adapter = createWailsWidgetPolicyAdapter({
      store,
      subscribe: (event, listener) => {
        listeners.set(event, listener);
        return () => {
          listeners.delete(event);
        };
      },
      emit: (event, payload) => {
        emitted.push({ event, payload });
      },
    });
    return { store, listeners, emitted, adapter };
  }

  it("subscribes before requesting the snapshot over the existing event bridge", () => {
    const { listeners, emitted, adapter } = harness();
    adapter.start();
    // Orden: suscribir primero, pedir después, como exige el contrato nativo.
    expect([...listeners.keys()]).toEqual([
      WIDGET_POLICY_SNAPSHOT_EVENT,
      WIDGET_POLICY_CHANGED_EVENT,
    ]);
    expect(emitted).toEqual([{ event: WIDGET_POLICY_GET_EVENT, payload: undefined }]);
  });

  it("consumes snapshot then forward-only changed events", () => {
    const { store, listeners, adapter } = harness();
    adapter.start();
    listeners.get(WIDGET_POLICY_SNAPSHOT_EVENT)?.({ data: freeWire });
    expect(store.getSnapshot()).toEqual(freeWire);
    listeners.get(WIDGET_POLICY_CHANGED_EVENT)?.({ data: paidWire });
    expect(store.getSnapshot()).toEqual(paidWire);
    // Retrasado: no pisa.
    listeners.get(WIDGET_POLICY_SNAPSHOT_EVENT)?.({ data: freeWire });
    expect(store.getSnapshot()).toEqual(paidWire);
  });

  it("start is idempotent and stop detaches a single connection", () => {
    const { listeners, emitted, adapter } = harness();
    adapter.start();
    adapter.start();
    expect(emitted).toHaveLength(1);
    adapter.stop();
    expect(listeners.size).toBe(0);
    adapter.start();
    expect(emitted).toHaveLength(2);
    adapter.stop();
  });

  it("restart re-arms the authoritative snapshot without clearing rights", () => {
    const { store, listeners, adapter } = harness();
    adapter.start();
    listeners.get(WIDGET_POLICY_SNAPSHOT_EVENT)?.({ data: paidWire });
    adapter.stop();
    adapter.start();
    expect(store.getSnapshot()).toEqual(paidWire);
    listeners.get(WIDGET_POLICY_SNAPSHOT_EVENT)?.({ data: freeWire });
    expect(store.getSnapshot()).toEqual(freeWire);
    adapter.stop();
  });

  it("requests a fresh snapshot on expiry instead of prolonging premium", () => {
    vi.useFakeTimers();
    try {
      const { store, listeners, emitted, adapter } = harness();
      adapter.start();
      expect(emitted).toHaveLength(1);
      listeners.get(WIDGET_POLICY_SNAPSHOT_EVENT)?.({
        data: { ...paidWire, validUntil: new Date(Date.now() + 5_000).toISOString() },
      });
      expect(store.getSnapshot()?.revision).toBe(2);
      vi.advanceTimersByTime(5_000);
      expect(emitted).toHaveLength(2);
      expect(emitted[1]).toEqual({ event: WIDGET_POLICY_GET_EVENT, payload: undefined });
      adapter.stop();
      store.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("late events after stop change nothing", () => {
    const { store, listeners, emitted, adapter } = harness();
    adapter.start();
    const snapshotListener = listeners.get(WIDGET_POLICY_SNAPSHOT_EVENT);
    const changedListener = listeners.get(WIDGET_POLICY_CHANGED_EVENT);
    adapter.stop();
    snapshotListener?.({ data: paidWire });
    changedListener?.({ data: paidWire });
    // El transporte detenido ya no escucha ni pide nada: sin suscripciones
    // ni emisiones, y el store intacto.
    expect(store.getSnapshot()).toBeNull();
    expect(listeners.size).toBe(0);
    expect(emitted).toHaveLength(1);
    store.dispose();
  });

  it("retained callbacks from a previous generation stay dead after restart", () => {
    const { store, listeners, adapter } = harness();
    adapter.start();
    const oldSnapshot = listeners.get(WIDGET_POLICY_SNAPSHOT_EVENT);
    adapter.stop();
    adapter.start();
    // El callback retenido de la generación anterior no consume aunque el
    // transporte vuelva a estar activo; el nuevo sí.
    oldSnapshot?.({ data: paidWire });
    expect(store.getSnapshot()).toBeNull();
    listeners.get(WIDGET_POLICY_SNAPSHOT_EVENT)?.({ data: paidWire });
    expect(store.getSnapshot()).toEqual(paidWire);
    adapter.stop();
    store.dispose();
  });
});

describe("createSseWidgetPolicyAdapter", () => {
  type FakeSource = {
    handlers: Map<string, Array<(event: MessageEvent<string>) => void>>;
    onerror: ((event: Event) => void) | null;
    closed: boolean;
    emit(type: string, data: unknown): void;
    fail(): void;
  };

  function createFakeSource(): FakeSource {
    return {
      handlers: new Map(),
      onerror: null,
      closed: false,
      emit(type: string, data: unknown) {
        for (const handler of this.handlers.get(type) ?? []) {
          handler({ data: JSON.stringify(data) } as MessageEvent<string>);
        }
      },
      fail() {
        this.onerror?.({} as Event);
      },
    };
  }

  function harness() {
    const store = createWidgetPolicyStore();
    const sources: FakeSource[] = [];
    const adapter = createSseWidgetPolicyAdapter({
      store,
      eventSourceFactory: (url: string) => {
        expect(url).toBe(WIDGET_POLICY_STREAM_URL);
        const source = createFakeSource();
        sources.push(source);
        return {
          addEventListener: (type: string, listener: (event: MessageEvent<string>) => void) => {
            const list = source.handlers.get(type) ?? [];
            list.push(listener);
            source.handlers.set(type, list);
          },
          close: () => {
            source.closed = true;
          },
          get onerror() {
            return source.onerror;
          },
          set onerror(handler: ((event: Event) => void) | null) {
            source.onerror = handler;
          },
        };
      },
    });
    return { store, sources, adapter };
  }

  it("snapshot is authoritative after reconnect even with a smaller revision", () => {
    const { store, sources, adapter } = harness();
    adapter.start();
    sources[0]?.emit(WIDGET_POLICY_SNAPSHOT_EVENT, paidWire);
    expect(store.getSnapshot()).toEqual(paidWire);
    // Caída: se conservan derechos y se arma el snapshot de la reconexión.
    sources[0]?.fail();
    expect(store.getSnapshot()).toEqual(paidWire);
    sources[0]?.emit(WIDGET_POLICY_SNAPSHOT_EVENT, freeWire);
    expect(store.getSnapshot()).toEqual(freeWire);
    adapter.stop();
    expect(sources[0]?.closed).toBe(true);
  });

  it("changed only moves forward and invalid JSON never replaces the snapshot", () => {
    const { store, sources, adapter } = harness();
    const notify = vi.fn();
    store.subscribe(notify);
    adapter.start();
    sources[0]?.emit(WIDGET_POLICY_SNAPSHOT_EVENT, paidWire);
    sources[0]?.emit(WIDGET_POLICY_CHANGED_EVENT, freeWire);
    expect(store.getSnapshot()).toEqual(paidWire);
    for (const handler of sources[0]?.handlers.get(WIDGET_POLICY_CHANGED_EVENT) ?? []) {
      handler({ data: "not-json{" } as MessageEvent<string>);
    }
    expect(store.getSnapshot()).toEqual(paidWire);
    expect(notify).toHaveBeenCalledTimes(1);
    adapter.stop();
  });

  it("start is idempotent: a second mount reuses the single connection", () => {
    const { sources, adapter } = harness();
    adapter.start();
    adapter.start();
    expect(sources).toHaveLength(1);
    adapter.stop();
  });

  it("late callbacks from a previous source never touch the current connection", () => {
    const { store, sources, adapter } = harness();
    adapter.start();
    const old = sources[0]!;
    old.emit(WIDGET_POLICY_SNAPSHOT_EVENT, paidWire);
    expect(store.getSnapshot()?.revision).toBe(2);
    adapter.stop();
    adapter.start();
    const current = sources[1]!;
    // Snapshot armado de la nueva autoridad con revisión menor: entra.
    current.emit(WIDGET_POLICY_SNAPSHOT_EVENT, freeWire);
    expect(store.getSnapshot()?.revision).toBe(1);
    // Snapshot tardío de la fuente anterior, incluso con revisión mayor: fuera.
    old.emit(WIDGET_POLICY_SNAPSHOT_EVENT, { ...paidWire, revision: 9 });
    expect(store.getSnapshot()?.revision).toBe(1);
    // Error tardío de la fuente anterior: no rearma la conexión actual, así
    // que un snapshot menor posterior sigue ignorándose.
    old.fail();
    current.emit(WIDGET_POLICY_SNAPSHOT_EVENT, { ...freeWire, revision: 0 });
    expect(store.getSnapshot()?.revision).toBe(1);
    adapter.stop();
    store.dispose();
  });

  it("reconnects for a fresh snapshot on expiry without prolonging premium", () => {
    vi.useFakeTimers();
    try {
      const { store, sources, adapter } = harness();
      adapter.start();
      sources[0]?.emit(WIDGET_POLICY_SNAPSHOT_EVENT, {
        ...paidWire,
        validUntil: new Date(Date.now() + 5_000).toISOString(),
      });
      expect(sources).toHaveLength(1);
      vi.advanceTimersByTime(5_000);
      expect(sources).toHaveLength(2);
      expect(sources[0]?.closed).toBe(true);
      // La nueva autoridad responde; la anterior queda cerrada.
      sources[1]?.emit(WIDGET_POLICY_SNAPSHOT_EVENT, freeWire);
      expect(store.getSnapshot()).toEqual(freeWire);
      sources[1]?.emit(WIDGET_POLICY_SNAPSHOT_EVENT, paidWire);
      expect(store.getSnapshot()).toEqual(paidWire);
      adapter.stop();
      store.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
