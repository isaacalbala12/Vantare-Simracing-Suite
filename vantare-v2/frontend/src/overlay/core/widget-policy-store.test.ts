import { describe, expect, it, vi } from "vitest";
import { createWidgetPolicyStore } from "./widget-policy-store";
import { resolveEffectiveWidgetPolicy, type WidgetPolicyWire } from "./widget-policy";

function wire(revision: number): WidgetPolicyWire {
  return {
    revision,
    overlaysBasic: true,
    overlaysAdvanced: revision >= 2,
    engineerAI: false,
    brandCrystal: revision >= 2 ? "optional" : "required",
    brandEfficiency: revision >= 2 ? "optional" : "required",
    brandOriginal: "none",
  };
}

describe("createWidgetPolicyStore", () => {
  it("starts fail-safe without a snapshot", () => {
    const store = createWidgetPolicyStore();
    expect(store.getSnapshot()).toBeNull();
  });

  it("accepts the first snapshot and notifies once", () => {
    const store = createWidgetPolicyStore();
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });
    expect(store.consumeSnapshot(wire(1))).toBe(true);
    expect(store.getSnapshot()).toEqual(wire(1));
    expect(calls).toBe(1);
  });

  it("rejects invalid payloads without touching the snapshot", () => {
    const store = createWidgetPolicyStore();
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });
    expect(store.consumeSnapshot({ revision: "one" })).toBe(false);
    expect(store.consumeChanged(null)).toBe(false);
    expect(store.getSnapshot()).toBeNull();
    expect(calls).toBe(0);
  });

  it("a delayed snapshot never overwrites a newer changed on the same transport", () => {
    const store = createWidgetPolicyStore();
    store.consumeSnapshot(wire(2));
    expect(store.consumeChanged(wire(5))).toBe(true);
    expect(store.getSnapshot()?.revision).toBe(5);
    // Retrasado de la misma autoridad: se ignora aunque sea un snapshot.
    expect(store.consumeSnapshot(wire(3))).toBe(false);
    expect(store.getSnapshot()?.revision).toBe(5);
    // Reemisión idéntica: se acepta sin notificar de más.
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });
    expect(store.consumeSnapshot(wire(5))).toBe(true);
    expect(calls).toBe(0);
  });

  it("changed only moves forward within a connection", () => {
    const store = createWidgetPolicyStore();
    store.consumeSnapshot(wire(4));
    expect(store.consumeChanged(wire(4))).toBe(false);
    expect(store.consumeChanged(wire(3))).toBe(false);
    expect(store.getSnapshot()?.revision).toBe(4);
    expect(store.consumeChanged(wire(6))).toBe(true);
    expect(store.getSnapshot()?.revision).toBe(6);
  });

  it("only a reconnect acknowledges a smaller revision from a new authority", () => {
    const store = createWidgetPolicyStore();
    store.consumeSnapshot(wire(6));
    store.resetTransport();
    expect(store.consumeSnapshot(wire(2))).toBe(true);
    expect(store.getSnapshot()?.revision).toBe(2);
    // Tras el snapshot de la nueva autoridad, lo antiguo vuelve a ignorarse.
    expect(store.consumeSnapshot(wire(6))).toBe(true);
    expect(store.consumeChanged(wire(1))).toBe(false);
  });

  it("resetTransport keeps the last verified rights without notifying others", () => {
    const store = createWidgetPolicyStore();
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });
    store.consumeSnapshot(wire(2));
    expect(calls).toBe(1);
    store.resetTransport();
    expect(store.getSnapshot()).toEqual(wire(2));
    expect(calls).toBe(1);
  });

  it("unsubscribe stops notifications", () => {
    const store = createWidgetPolicyStore();
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });
    unsubscribe();
    store.consumeSnapshot(wire(1));
    expect(calls).toBe(0);
    store.dispose();
  });

  it("notifies on expiry so the runtime remounts fail-safe without new frames", () => {
    vi.useFakeTimers();
    try {
      const store = createWidgetPolicyStore();
      let calls = 0;
      store.subscribe(() => {
        calls += 1;
      });
      store.consumeSnapshot({ ...wire(2), validUntil: new Date(Date.now() + 5_000).toISOString() });
      expect(calls).toBe(1);
      expect(resolveEffectiveWidgetPolicy(store.getSnapshot())).not.toBeNull();
      const before = store.getSnapshot();
      vi.advanceTimersByTime(5_000);
      expect(calls).toBe(2);
      expect(resolveEffectiveWidgetPolicy(store.getSnapshot())).toBeNull();
      // Identidad nueva con idéntico contenido: useSyncExternalStore sí
      // re-renderiza y el bloqueo/marca se ve en DOM sin frames ni eventos.
      expect(store.getSnapshot()).not.toBe(before);
      expect(store.getSnapshot()).toEqual(before);
      expect(store.getSnapshot()?.revision).toBe(2);
      store.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("schedules a 30-day paid_through in bounded chunks without losing expiry", () => {
    vi.useFakeTimers();
    try {
      const store = createWidgetPolicyStore();
      let calls = 0;
      store.subscribe(() => {
        calls += 1;
      });
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1_000;
      store.consumeSnapshot({
        ...wire(2),
        validUntil: new Date(Date.now() + thirtyDaysMs).toISOString(),
      });
      expect(calls).toBe(1);
      vi.advanceTimersByTime(25 * 24 * 60 * 60 * 1_000);
      expect(calls).toBe(1);
      expect(resolveEffectiveWidgetPolicy(store.getSnapshot())).not.toBeNull();
      vi.advanceTimersByTime(6 * 24 * 60 * 60 * 1_000);
      expect(calls).toBe(2);
      expect(resolveEffectiveWidgetPolicy(store.getSnapshot())).toBeNull();
      store.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("dispose clears the expiry timer and the subscribers", () => {
    vi.useFakeTimers();
    try {
      const store = createWidgetPolicyStore();
      let calls = 0;
      store.subscribe(() => {
        calls += 1;
      });
      store.consumeSnapshot({ ...wire(2), validUntil: new Date(Date.now() + 5_000).toISOString() });
      store.dispose();
      vi.advanceTimersByTime(60_000);
      expect(calls).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
