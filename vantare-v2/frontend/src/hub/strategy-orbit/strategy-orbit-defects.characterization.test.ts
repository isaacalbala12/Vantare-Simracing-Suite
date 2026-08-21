/**
 * Caracterizaciones verdes de los defectos de Orbit — F1-4 · issue #727 · parte de ISA-694.
 *
 * Cada test documenta el comportamiento defectuoso ACTUAL tal cual es (verde).
 * Incluye comentario con referencia al defecto y nota de que en F2 se invertirá
 * con el fix. Cero cambios productivos: solo afirman lo que hoy pasa.
 *
 * Defectos cubiertos (ver matriz-migracion-orbit.csv y brief §8):
 * 1) eliminar piloto deja ID colgante en order → buildPlan rompe
 * 2) fallos silenciosos de guardado/activación/apertura (setItem/bridge)
 * 3) fixtures golden sparse/mixed/legacy → defaults sintéticos sin provenance
 * 4) fillMode='telemetry' se borra al leer
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildPlan } from "./strategy-orbit-model";
import {
  readLegacyStrategyState,
  readStrategyEvents,
  STRATEGY_EVENTS_KEY,
  STRATEGY_LEGACY_KEY,
  writeStrategyEvents,
  type StrategyEventRecord,
  type StrategyEventsState,
} from "./strategy-events-store";
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

// ── (1) ID colgante tras eliminar piloto → buildPlan roto ─────────────────

describe("defecto 8.3 · eliminar piloto deja ID colgante y buildPlan rompe — F2 debe validar y no romper UI", () => {
  it("buildPlan lanza TypeError si el order contiene un piloto eliminado (ID colgante)", () => {
    // DEFECTO ISA-694 §8.3: al eliminar driver-2, el order aún puede contener
    // "driver-2". buildPlan accede a drivers[id] sin validar y rompe.
    // F2 invertirá: buildPlan/filtrado debe validar IDs y degradar sin throw.
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
    // Solo queda driver-1 en el mapa, pero el order aún referencia driver-2
    const driversById: Record<string, StrategyDriver> = { "driver-1": DRIVER_A };
    const danglingOrder = ["driver-1", "driver-2"];

    expect(() =>
      buildPlan(event, driversById, { mode: "dry", order: danglingOrder, overrides: {} }),
    ).toThrow();
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
  it("writeStrategyEvents traga QuotaExceededError sin lanzar ni avisar (dato solo en memoria)", () => {
    // DEFECTO matriz fila writeStrategyEvents: setItem en catch vacío.
    // F2 invertirá: confirmar persistencia y mostrar error/toast + journal.
    const evt = makeEvent();
    const state: StrategyEventsState = { events: [evt], activeId: evt.id };

    const spy = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    expect(() => writeStrategyEvents(state)).not.toThrow();
    // No hay error visible — el caller cree que guardó, pero no hay dato
    // (aquí verificamos que no lanzó; el UI no muestra toast de error).
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("readStrategyEvents con JSON corrupto devuelve vacío sin aviso (warningShown=false conceptual)", () => {
    // DEFECTO matriz: corrupción y causa se pierden sin aviso.
    // Fixture events-corrupt-json.json → observedResult events=[], activeId=null, warningShown=false
    // F2 invertirá: backup byte-a-byte + cuarentena tipada + aviso visible.
    window.localStorage.setItem(STRATEGY_EVENTS_KEY, "{no json");
    const read = readStrategyEvents();
    expect(read).toEqual({ events: [], activeId: null });
    // No lanza, no hay flag de warning ni toast — silencioso
  });

  it("readLegacyStrategyState con JSON corrupto también devuelve vacío silencioso", () => {
    // DEFECTO matriz legacy-corrupt: raw "[broken" → variants={}
    // F2 invertirá: misma cuarentena visible.
    window.localStorage.setItem(STRATEGY_LEGACY_KEY, "[broken");
    const legacy = readLegacyStrategyState();
    expect(legacy.variants).toEqual({});
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
  it("sparse: evento mínimo materializa 90L/60s/60min/startAt=now sin marca de procedencia", () => {
    // Fixture events-sparse-defaults.json
    const raw = JSON.stringify({
      events: [{ id: "sparse-1", drivers: [{ id: "driver-1" }], strategies: [{ id: "s1" }] }],
      activeId: "sparse-1",
    });
    window.localStorage.setItem(STRATEGY_EVENTS_KEY, raw);
    const before = Date.now();
    const read = readStrategyEvents();
    const after = Date.now();

    // DEFECTO matriz: tankL=90, pitLossSec=60, durationMin=60, startAt=now, name=id, todos indistinguibles de dato real
    expect(read.events).toHaveLength(1);
    const e = read.events[0];
    expect(e.tankL).toBe(90);
    expect(e.pitLossSec).toBe(60);
    expect(e.durationMin).toBe(60);
    expect(e.name).toBe("sparse-1");
    expect(e.track).toBe("");
    // startAt es now no-determinístico, sin marca de synthetic
    const ts = new Date(e.startAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before - 1000);
    expect(ts).toBeLessThanOrEqual(after + 1000);
    // No existe campo provenance / flag legacy_synthetic
    expect((e as unknown as Record<string, unknown>).provenance).toBeUndefined();
    // F2 invertirá: defaults con provenance legacy_synthetic_default y startAt missing
  });

  it("mixed: eventos inválidos se descartan silenciosamente y activeId colgante se limpia sin aviso", () => {
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
    const read = readStrategyEvents();
    // DEFECTO: solo queda valid-1, activeId null, warningShown false conceptual (sin toast)
    expect(read.events.map((e) => e.id)).toEqual(["valid-1"]);
    expect(read.activeId).toBeNull();
  });

  it("legacy wrapped: variantes sin validación shape — solo id filtrado, resto pasa", () => {
    // Fixture legacy-wrapped.json — parse laxo que conserva order/overrides sin validar shape completo
    const raw = JSON.stringify({
      variants: {
        s1: { state: "draft", order: ["driver-1"], overrides: { "0": { laps: 20 } }, tyres: {} },
        "local-1": { name: "Copia", mode: "eco", order: ["driver-1"], state: "draft" },
      },
      availability: { "driver-1": [{ state: "no", from: 900, to: 960 }] },
    });
    window.localStorage.setItem(STRATEGY_LEGACY_KEY, raw);
    const legacy = readLegacyStrategyState();
    // DEFECTO: no valida que variants sea mapa ni que las variantes sean completas — todo pasa
    expect(legacy.variants["s1"]).toBeDefined();
    expect(legacy.variants["local-1"]).toBeDefined();
    expect(legacy.availability).toBeDefined();
  });

  it("legacy flat: raíz sin clave variants se interpreta como mapa de variantes (propiedad accidental = variante)", () => {
    const raw = JSON.stringify({ s1: { state: "draft", order: ["driver-1"], overrides: { "0": { laps: 20 } } } });
    window.localStorage.setItem(STRATEGY_LEGACY_KEY, raw);
    const legacy = readLegacyStrategyState();
    expect(legacy.variants["s1"]).toBeDefined();
  });

  it("event activeStrategyId colgante se conserva sin validar contra strategies", () => {
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
    const read = readStrategyEvents();
    // Se conserva colgante — F2 debe validar contra strategies migradas
    expect(read.events[0].activeStrategyId).toBe("fantasma");
    expect(read.events[0].strategies.map((s) => s.id)).not.toContain("fantasma");
  });
});

// ── (4) fillMode telemetry se borra ───────────────────────────────────────

describe("defecto · fillMode='telemetry' se borra al leer (solo sobrevive manual) — F2 debe preservar/mapear raw", () => {
  it("un evento guardado con fillMode telemetry se lee como undefined", () => {
    // DEFECTO matriz fila fillMode: solo manual sobrevive
    const evt = makeEvent({ fillMode: "telemetry" as unknown as StrategyEventRecord["fillMode"] });
    writeStrategyEvents({ events: [evt], activeId: evt.id });
    const read = readStrategyEvents();
    // DEFECTO actual: se borra
    expect(read.events[0].fillMode).toBeUndefined();
    // F2 invertirá: preservar raw y bloquear hasta contrato v2 con provenance
  });

  it("fillMode manual sí sobrevive (control)", () => {
    const evt = makeEvent({ fillMode: "manual" });
    writeStrategyEvents({ events: [evt], activeId: evt.id });
    expect(readStrategyEvents().events[0].fillMode).toBe("manual");
  });
});
