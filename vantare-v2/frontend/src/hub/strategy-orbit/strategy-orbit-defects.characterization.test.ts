/**
 * Caracterizaciones verdes de los defectos de Orbit — F1-4 · issue #727 · parte de ISA-694.
 *
 * F2(c) invierte aquí las caracterizaciones que pertenecen a la migración:
 * el frontend conserva raw y el store queda read-only. Las de cálculo,
 * roster y apertura siguen caracterizando el defecto hasta F2(d-f).
 *
 * Defectos cubiertos (ver matriz-migracion-orbit.csv y brief §8):
 * 1) eliminar piloto deja ID colgante en order → el cálculo productivo debe rechazarlo tipado
 * 2) fallos silenciosos de guardado/activación/apertura (setItem/bridge)
 * 3) fixtures golden sparse/mixed/legacy → defaults sintéticos sin provenance
 * 4) fillMode='telemetry' se borra al leer
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculateStrategyOrbit } from "./strategy-orbit-bridge";
import { orbitCalculationInput } from "./strategy-orbit-model";
import {
  StrategyApplicationError,
  type StrategyApplicationClient,
} from "../../strategy/strategy-application-client";
import {
  readStrategyEvents,
  STRATEGY_EVENTS_KEY,
  STRATEGY_LEGACY_KEY,
  STRATEGY_MIGRATED_KEY,
  writeStrategyEvents,
  type StrategyEventRecord,
  type StrategyEventsState,
} from "./strategy-events-store";
import { readOrbitLegacySources } from "./strategy-orbit-migration";
import type { StrategyDriver, StrategyEvent } from "./strategy-orbit-model";

// ── helpers ───────────────────────────────────────────────────────────────

const DRIVER_A: StrategyDriver = {
  id: "driver-1",
  name: "Piloto A",
  ini: "PA",
  color: "#ff6a5f",
  cls: "Gold",
  dry: [105, 2.8],
  wet: [113, 2.45],
  eco: [106.1, 2.6],
};
const DRIVER_B: StrategyDriver = {
  id: "driver-2",
  name: "Piloto B",
  ini: "PB",
  color: "#00ff00",
  cls: "Gold",
  dry: [105, 2.8],
  wet: [113, 2.45],
  eco: [106.1, 2.6],
};

function makeEvent(overrides: Partial<StrategyEventRecord> = {}): StrategyEventRecord {
  return {
    id: "evt-1",
    name: "Evento test",
    source: "custom",
    track: "Spa",
    cls: "GT3",
    durationMin: 120,
    startAt: "2026-08-21T14:00:00.000Z",
    drivers: [DRIVER_A, DRIVER_B],
    tankL: 90,
    pitLossSec: 60,
    strategies: [
      { id: "s1", name: "Base", note: "", mode: "dry", order: ["driver-1", "driver-2"], state: "ok", overrides: {}, tyres: {} },
    ],
    activeStrategyId: "s1",
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

// ── (1) ID colgante tras eliminar piloto → rechazo Go tipado ───────────────

describe("inversión F2(d) · un piloto colgante se rechaza de forma tipada sin ejecutar cálculo TS", () => {
  it("envía el ID al dominio Go y conserva calculation_invalid + campo para la UI", async () => {
    // INVERSIÓN F2(d): ya no existe acceso TS a drivers[id]. El input cruza el
    // cliente v2 y el dominio Go devuelve un rechazo tipado y visible.
    const event: StrategyEvent = {
      startMin: 14 * 60,
      durationMin: 120,
      tankL: 90,
      pitS: 60,
      name: "Evento test",
      subtitle: "GT3 · Spa",
      monogram: "ET",
      vehicleClass: "GT3",
      team: "",
      dayLabel: "sáb 12",
      startISO: "2026-08-21T14:00:00.000Z",
    };
    const input = orbitCalculationInput(event, [DRIVER_A], [{
      id: "s1", name: "Base", note: "", mode: "dry", order: ["driver-1", "driver-2"],
      state: "ok", overrides: {}, tyres: {},
    }], "s1");
    const rejected = new StrategyApplicationError(
      "calculation_invalid",
      "input.variants.0.order.1",
      "The Strategy calculation input is invalid.",
    );
    const client = {
      execute: vi.fn().mockRejectedValue(rejected),
      cancel: () => false,
      dispose: () => undefined,
    } as unknown as StrategyApplicationClient<unknown>;

    await expect(calculateStrategyOrbit(client, "dangling-driver", input)).rejects.toMatchObject({
      code: "calculation_invalid",
      field: "input.variants.0.order.1",
    });
  });

  it("persistir evento con piloto eliminado mantiene el ID colgante en storage (no se limpia al guardar)", () => {
    // DEFECTO: write→read no sanea order contra drivers existentes.
    // F2 invertirá: migración/limpieza debe filtrar order contra drivers vivos.
    const evt = makeEvent();
    // Simula edición que borra driver-2 pero olvida filtrar order
    const withDangling: StrategyEventRecord = {
      ...evt,
      drivers: [DRIVER_A], // driver-2 eliminado
      strategies: [{ ...evt.strategies[0], order: ["driver-1", "driver-2"] }], // colgante
    };
    writeStrategyEvents({ events: [withDangling], activeId: withDangling.id });
    const read = readStrategyEvents();
    expect(read.events[0].strategies[0].order).toContain("driver-2");
    expect(read.events[0].drivers.map((d) => d.id)).not.toContain("driver-2");
  });
});

// ── (2) Fallos silenciosos ────────────────────────────────────────────────

describe("defecto · fallos silenciosos de guardado/bridge/apertura — F2 debe mostrar error visible", () => {
  it("F2(c): tras el commit, el flag impide cualquier escritura en el store antiguo", () => {
    // INVERSIÓN F2(c): esta issue no repara el escritor legacy (se retira en
    // F2(d)); lo vuelve read-only después del commit canónico confirmado.
    const evt = makeEvent();
    const state: StrategyEventsState = { events: [evt], activeId: evt.id };
    window.localStorage.setItem(STRATEGY_MIGRATED_KEY, "{\"fingerprint\":\"fp\"}");
    const spy = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(writeStrategyEvents(state)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("F2(c): el JSON de eventos corrupto llega byte a byte a Go sin parsearse en frontend", () => {
    // INVERSIÓN F2(c): el store viejo sigue leyendo como antes hasta F2(d),
    // pero el flujo nuevo no lo usa para migrar: entrega el raw al motor Go.
    window.localStorage.setItem(STRATEGY_EVENTS_KEY, "{no json");
    expect(decodeSource(STRATEGY_EVENTS_KEY)).toBe("{no json");
  });

  it("F2(c): el JSON legacy corrupto también llega byte a byte al motor Go", () => {
    window.localStorage.setItem(STRATEGY_LEGACY_KEY, "[broken");
    expect(decodeSource(STRATEGY_LEGACY_KEY)).toBe("[broken");
  });

  it("bridge con payload inválido no llama al listener y no avisa (fallo silencioso)", async () => {
    // DEFECTO: subscribeToStrategyRoster parseStrategyRoster null → listener no invocado, sin error UI.
    // F2 invertirá: error visible / degradación tipada.
    // Caracterizamos parseando vía subscribe mockeado.
    const { subscribeToStrategyRoster } = await import("./strategy-orbit-bridge");
    // Mock Events.On para capturar el handler y simular payload inválido (sin drivers)
    const { Events } = await import("@wailsio/runtime");
    const origOn = Events.On;
    let captured: (e: { data?: unknown }) => void = () => {};
    const fakeOn = vi.fn((eventName: string, handler: (e: { data?: unknown }) => void) => {
      captured = handler;
      return () => undefined;
    });
    // @ts-expect-error mock
    Events.On = fakeOn;
    const listener = vi.fn();
    const off = subscribeToStrategyRoster(listener);
    // Payload sin drivers ni evento utilizable → debe ser descartado silenciosamente
    captured({ data: { event: { name: "roto" }, drivers: [], strategies: [] } });
    expect(listener).not.toHaveBeenCalled();
    // No lanza
    expect(() => captured({ data: { event: { name: "roto" } } })).not.toThrow();
    off();
    Events.On = origOn;
  });

  it("openOrCreateStrategyEditor envuelto en .catch(()=>undefined) traga error de apertura (silencioso en la página)", async () => {
    // DEFECTO: StrategyOrbitPage.tsx hace `void openOrCreateStrategyEditor(...).catch(()=>undefined)` — cualquier
    // fallo de bridge/Wails queda sin toast ni estado de error.
    // F2 invertirá: propagar error visible al usuario.
    const { openOrCreateStrategyEditor } = await import("../../strategy/strategy-editor-store");
    const { StrategyApplicationError } = await import("../../strategy/strategy-application-client");
    const failingStore = {
      open: vi.fn().mockRejectedValue(new Error("bridge caído")),
      create: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      getSnapshot: vi.fn(() => ({})),
    } as unknown as Parameters<typeof openOrCreateStrategyEditor>[0];

    // La función sí lanza para errores no-draft_not_found (correcto aislado),
    // pero la PÁGINA lo traga con .catch(()=>undefined) — aquí mostramos ambos lados:
    await expect(openOrCreateStrategyEditor(failingStore)).rejects.toThrow("bridge caído");

    // Simulación del wrapper silencioso de la página:
    let swallowed = false;
    await openOrCreateStrategyEditor(failingStore).catch(() => {
      swallowed = true;
    });
    expect(swallowed).toBe(true); // defecto: se traga sin UI

    // draft_not_found sí se recupera silenciosamente creando draft — también sin aviso
    const draftNotFound = new StrategyApplicationError("draft_not_found", "not found");
    const recoverStore = {
      open: vi.fn().mockRejectedValue(draftNotFound),
      create: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn(() => () => undefined),
      getSnapshot: vi.fn(() => ({})),
    } as unknown as Parameters<typeof openOrCreateStrategyEditor>[0];
    await expect(openOrCreateStrategyEditor(recoverStore)).resolves.toBeUndefined();
    expect(recoverStore.create).toHaveBeenCalled();
  });
});

// ── (3) Fixtures golden → defaults sintéticos sin provenance ──────────────

describe("defecto · fixtures golden producen defaults sintéticos sin provenance — F2 debe marcar legacy_synthetic_default", () => {
  it("F2(c): sparse se envía intacto y ya no se materializa startAt=now en frontend", () => {
    // Fixture events-sparse-defaults.json
    const raw = JSON.stringify({
      events: [{ id: "sparse-1", drivers: [{ id: "driver-1" }], strategies: [{ id: "s1" }] }],
      activeId: "sparse-1",
    });
    window.localStorage.setItem(STRATEGY_EVENTS_KEY, raw);
    expect(decodeSource(STRATEGY_EVENTS_KEY)).toBe(raw);
  });

  it("F2(c): mixed se conserva completo para cuarentena y aviso del motor Go", () => {
    // Fixture events-mixed-discard.json
    const raw = JSON.stringify({
      events: [
        { id: "no-drivers", drivers: [], strategies: [] },
        { name: "no-id", drivers: [{ id: "driver-1" }], strategies: [] },
        { id: "valid-1", drivers: [{ id: "driver-1" }], strategies: [] },
      ],
      activeId: "no-drivers",
    });
    window.localStorage.setItem(STRATEGY_EVENTS_KEY, raw);
    expect(decodeSource(STRATEGY_EVENTS_KEY)).toBe(raw);
  });

  it("F2(c): legacy wrapped se conserva íntegro para validación estricta en Go", () => {
    // Fixture legacy-wrapped.json — parse laxo que conserva order/overrides sin validar shape completo
    const raw = JSON.stringify({
      variants: {
        s1: { state: "draft", order: ["driver-1"], overrides: { "0": { laps: 20 } }, tyres: {} },
        "local-1": { name: "Copia", mode: "eco", order: ["driver-1"], state: "draft" },
      },
      availability: { "driver-1": [{ state: "no", from: 900, to: 960 }] },
    });
    window.localStorage.setItem(STRATEGY_LEGACY_KEY, raw);
    expect(decodeSource(STRATEGY_LEGACY_KEY)).toBe(raw);
  });

  it("F2(c): legacy flat se conserva sin reinterpretarlo en frontend", () => {
    const raw = JSON.stringify({ s1: { state: "draft", order: ["driver-1"], overrides: { "0": { laps: 20 } } } });
    window.localStorage.setItem(STRATEGY_LEGACY_KEY, raw);
    expect(decodeSource(STRATEGY_LEGACY_KEY)).toBe(raw);
  });

  it("F2(c): activeStrategyId colgante llega intacto para que Go lo cuarentene", () => {
    // DEFECTO matriz: activeStrategyId string opcional sin comprobar que exista en strategies
    const raw = JSON.stringify({
      events: [
        {
          id: "evt-1",
          drivers: [{ id: "driver-1" }],
          strategies: [{ id: "s1" }],
          activeStrategyId: "fantasma",
        },
      ],
      activeId: "evt-1",
    });
    window.localStorage.setItem(STRATEGY_EVENTS_KEY, raw);
    expect(decodeSource(STRATEGY_EVENTS_KEY)).toBe(raw);
  });
});

// ── (4) fillMode telemetry se borra ───────────────────────────────────────

describe("defecto · fillMode='telemetry' se borra al leer (solo sobrevive manual) — F2 debe preservar/mapear raw", () => {
  it("F2(c): fillMode telemetry se preserva raw y no pasa por el parser legacy", () => {
    const evt = makeEvent({ fillMode: "telemetry" as unknown as StrategyEventRecord["fillMode"] });
    writeStrategyEvents({ events: [evt], activeId: evt.id });
    expect(decodeSource(STRATEGY_EVENTS_KEY)).toContain('"fillMode":"telemetry"');
  });

  it("fillMode manual sí sobrevive (control)", () => {
    const evt = makeEvent({ fillMode: "manual" });
    writeStrategyEvents({ events: [evt], activeId: evt.id });
    expect(readStrategyEvents().events[0].fillMode).toBe("manual");
  });
});

function decodeSource(key: string): string {
  const source = readOrbitLegacySources(window.localStorage).find((candidate) => candidate.key === key);
  if (!source) throw new Error(`missing source ${key}`);
  return new TextDecoder().decode(Uint8Array.from(atob(source.raw), (char) => char.charCodeAt(0)));
}
