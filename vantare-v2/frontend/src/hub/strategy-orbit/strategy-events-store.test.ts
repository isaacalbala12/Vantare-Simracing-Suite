import { beforeEach, describe, expect, it } from "vitest";
import {
  activeEventOf,
  createCustomEvent,
  createEventFromSeries,
  dayLabelOf,
  eventFromRoster,
  eventsByRecency,
  FALLBACK_SERIES_DURATION_MIN,
  freeEventId,
  initialsOf,
  lastOpenedEventOf,
  monogramOf,
  newDriver,
  openEvent,
  patchEvent,
  readLegacyStrategyState,
  readStrategyEvents,
  removeEvent,
  rosterEventId,
  startMinuteOf,
  STRATEGY_EVENTS_KEY,
  STRATEGY_LEGACY_KEY,
  toStrategyEvent,
  upsertEvent,
  writeStrategyEvents,
  type StrategyEventRecord,
  type StrategyEventsState,
} from "./strategy-events-store";
import type { StrategyRoster } from "./strategy-orbit-bridge";
import type { StrategyDriver } from "./strategy-orbit-model";

const LABELS = { strategyName: "Estrategia #1", strategyNote: "nota" };

const ISAAC: StrategyDriver = {
  id: "isaac",
  name: "Isaac Albalá",
  ini: "IA",
  color: "#ff6a5f",
  cls: "Gold SR",
  dry: [104, 2.75],
  wet: [112, 2.4],
  eco: [105.1, 2.55],
};

const ROSTER: StrategyRoster = {
  event: {
    startMin: 14 * 60,
    durationMin: 240,
    tankL: 90,
    pitS: 64,
    name: "4 Horas de Imola",
    subtitle: "ELMS · Imola",
    monogram: "4H",
    vehicleClass: "LMGT3",
    team: "Vantare Racing · #58",
    dayLabel: "Sáb 12",
    startISO: "2026-07-11T14:00:00.000Z",
  },
  drivers: [ISAAC],
  strategies: [{ id: "s1", name: "Estrategia #1", note: "Mínimo tiempo", mode: "dry", order: ["isaac"] }],
};

beforeEach(() => {
  window.localStorage.clear();
});

describe("derivados del evento", () => {
  it("monogramOf salta las preposiciones", () => {
    expect(monogramOf("4 Horas de Imola")).toBe("4H");
    expect(monogramOf("Spa")).toBe("SP");
    expect(monogramOf("")).toBe("EV");
  });

  it("initialsOf toma la inicial de nombre y apellido", () => {
    expect(initialsOf("Isaac Albalá")).toBe("IA");
    expect(initialsOf("Sol")).toBe("SO");
  });

  it("startMinuteOf lee la hora local de la salida", () => {
    const at = new Date(2026, 6, 11, 15, 30);
    expect(startMinuteOf(at.toISOString())).toBe(15 * 60 + 30);
  });

  it("toStrategyEvent arma el evento que consume el modelo", () => {
    const record = createCustomEvent(
      [],
      {
        name: "Enduro de casa",
        track: "Motorland",
        cls: "GT3",
        durationMin: 120,
        startAt: new Date(2026, 6, 11, 15, 0).toISOString(),
        tankL: 80,
        pitLossSec: 55,
        drivers: [ISAAC],
      },
      LABELS,
    );
    const event = toStrategyEvent(record, "es");

    expect(event.name).toBe("Enduro de casa");
    expect(event.subtitle).toBe("GT3 · Motorland");
    expect(event.monogram).toBe("EC");
    expect(event.startMin).toBe(15 * 60);
    expect(event.durationMin).toBe(120);
    expect(event.tankL).toBe(80);
    expect(event.pitS).toBe(55);
    expect(event.dayLabel).toBe(dayLabelOf(record.startAt, "es"));
  });
});

describe("creación de eventos", () => {
  it("un evento propio nace con Estrategia #1 y todos sus pilotos", () => {
    const sol = newDriver("Sol Martín", 1);
    const record = createCustomEvent(
      [],
      {
        name: "Enduro de casa",
        track: "Motorland",
        cls: "GT3",
        durationMin: 120,
        startAt: new Date().toISOString(),
        tankL: 90,
        pitLossSec: 60,
        drivers: [ISAAC, sol],
      },
      LABELS,
    );

    expect(record.source).toBe("custom");
    expect(record.id).toBe("own-1");
    expect(record.strategies).toHaveLength(1);
    expect(record.strategies[0].order).toEqual(["isaac", sol.id]);
    expect(record.activeStrategyId).toBe("s1");
  });

  it("desde una serie toma salida, clase y duración, con el usuario de piloto", () => {
    const at = new Date("2030-01-01T14:00:00Z");
    const record = createEventFromSeries(
      [],
      { seriesId: "gt3-sprint", name: "GT3 Sprint", track: "Spa", at, vehicleClass: "GT3", durationMin: 45 },
      ISAAC,
      LABELS,
    );

    expect(record.source).toBe("series");
    expect(record.seriesId).toBe("gt3-sprint");
    expect(record.cls).toBe("GT3");
    expect(record.durationMin).toBe(45);
    expect(record.startAt).toBe(at.toISOString());
    expect(record.drivers).toEqual([ISAAC]);
  });

  it("una serie sin duración publicada cae a una hora, no a cero", () => {
    const record = createEventFromSeries(
      [],
      { seriesId: "x", name: "X", track: "", at: new Date(), durationMin: 0 },
      ISAAC,
      LABELS,
    );
    expect(record.durationMin).toBe(FALLBACK_SERIES_DURATION_MIN);
  });

  it("freeEventId salta los ids ocupados", () => {
    const taken = [{ id: "own-1" }, { id: "own-2" }] as StrategyEventRecord[];
    expect(freeEventId(taken, "own")).toBe("own-3");
  });
});

describe("importación del roster", () => {
  it("el evento del puente entra como uno más y conserva sus estrategias", () => {
    const record = eventFromRoster(ROSTER);

    expect(record.id).toBe(rosterEventId(ROSTER));
    expect(record.source).toBe("roster");
    expect(record.durationMin).toBe(240);
    expect(record.tankL).toBe(90);
    expect(record.pitLossSec).toBe(64);
    expect(record.strategies.map((item) => item.id)).toEqual(["s1"]);
    expect(record.strategies[0].state).toBe("ok");
  });

  it("migra los overrides y las estrategias locales de la clave antigua", () => {
    window.localStorage.setItem(
      STRATEGY_LEGACY_KEY,
      JSON.stringify({
        variants: {
          s1: { state: "draft", order: ["isaac"], overrides: { 0: { laps: 20 } }, tyres: {} },
          "local-1": { name: "Copia", mode: "eco", order: ["isaac"], state: "draft" },
        },
        availability: { isaac: [{ state: "no", from: 900, to: 960 }] },
      }),
    );

    const record = eventFromRoster(ROSTER, readLegacyStrategyState());

    expect(record.strategies.map((item) => item.id)).toEqual(["s1", "local-1"]);
    expect(record.strategies[0].overrides).toEqual({ 0: { laps: 20 } });
    expect(record.strategies[0].state).toBe("draft");
    expect(record.strategies[1].mode).toBe("eco");
    expect(record.availability?.isaac).toHaveLength(1);
  });

  it("la clave antigua en formato plano también se entiende", () => {
    window.localStorage.setItem(
      STRATEGY_LEGACY_KEY,
      JSON.stringify({ s1: { state: "draft", order: ["isaac"] } }),
    );
    expect(readLegacyStrategyState().variants.s1?.state).toBe("draft");
  });
});

describe("persistencia", () => {
  it("guarda y recupera los eventos con el activo", () => {
    const record = eventFromRoster(ROSTER);
    const state: StrategyEventsState = { events: [record], activeId: record.id };
    writeStrategyEvents(state);

    const read = readStrategyEvents();
    expect(read.events).toHaveLength(1);
    expect(read.activeId).toBe(record.id);
    expect(activeEventOf(read)?.name).toBe("4 Horas de Imola");
  });

  it("un activo que ya no existe no deja la pantalla colgada", () => {
    window.localStorage.setItem(
      STRATEGY_EVENTS_KEY,
      JSON.stringify({ events: [], activeId: "fantasma" }),
    );
    expect(readStrategyEvents()).toEqual({ events: [], activeId: null });
  });

  it("un JSON roto devuelve el estado vacío en vez de reventar", () => {
    window.localStorage.setItem(STRATEGY_EVENTS_KEY, "{no json");
    expect(readStrategyEvents().events).toEqual([]);
  });

  it("un evento sin pilotos se descarta al leer", () => {
    window.localStorage.setItem(
      STRATEGY_EVENTS_KEY,
      JSON.stringify({ events: [{ id: "x", name: "X", drivers: [] }], activeId: "x" }),
    );
    expect(readStrategyEvents().events).toEqual([]);
  });
});

describe("mutación", () => {
  it("upsertEvent reemplaza en su sitio y patchEvent solo toca el suyo", () => {
    const a = eventFromRoster(ROSTER);
    const b = createCustomEvent([a], {
      name: "Otro",
      track: "",
      cls: "",
      durationMin: 60,
      startAt: new Date().toISOString(),
      tankL: 90,
      pitLossSec: 60,
      drivers: [ISAAC],
    }, LABELS);

    let state: StrategyEventsState = { events: [a, b], activeId: a.id };
    state = upsertEvent(state, { ...a, name: "Renombrado" });
    expect(state.events.map((event) => event.name)).toEqual(["Renombrado", "Otro"]);

    state = patchEvent(state, b.id, (event) => ({ ...event, tankL: 42 }));
    expect(state.events[0].tankL).toBe(90);
    expect(state.events[1].tankL).toBe(42);
  });
});

describe("strategy-events-store · lastOpenedAt (ISA-377)", () => {
  const own = (name: string) =>
    createCustomEvent(
      [],
      {
        name,
        track: "",
        cls: "",
        durationMin: 60,
        startAt: "2030-01-01T14:00:00.000Z",
        tankL: 90,
        pitLossSec: 60,
        drivers: [ISAAC],
      },
      LABELS,
    );

  it("abrir un evento sella la fecha y lo deja activo", () => {
    const a = { ...own("A"), id: "own-1", lastOpenedAt: undefined };
    const b = { ...own("B"), id: "own-2", lastOpenedAt: undefined };
    const state = openEvent(
      { events: [a, b], activeId: null },
      "own-2",
      new Date("2030-02-02T10:00:00Z"),
    );

    expect(state.activeId).toBe("own-2");
    expect(state.events[1].lastOpenedAt).toBe("2030-02-02T10:00:00.000Z");
    // Abrir uno no toca al resto.
    expect(state.events[0].lastOpenedAt).toBeUndefined();
  });

  it("abrir un id que no existe no inventa nada", () => {
    const a = { ...own("A"), id: "own-1" };
    const state: StrategyEventsState = { events: [a], activeId: null };
    expect(openEvent(state, "fantasma")).toBe(state);
  });

  it("«Continuar» es el último abierto, no el último creado", () => {
    const a = { ...own("A"), id: "own-1", lastOpenedAt: "2030-01-05T10:00:00.000Z" };
    const b = { ...own("B"), id: "own-2", lastOpenedAt: "2030-01-09T10:00:00.000Z" };
    const c = { ...own("C"), id: "own-3", lastOpenedAt: undefined };
    const state: StrategyEventsState = { events: [a, b, c], activeId: null };

    expect(lastOpenedEventOf(state)?.id).toBe("own-2");
    expect(eventsByRecency(state).map((event) => event.id)).toEqual(["own-2", "own-1", "own-3"]);
  });

  it("sin ningún evento abierto no hay nada que continuar", () => {
    const a = { ...own("A"), id: "own-1", lastOpenedAt: undefined };
    expect(lastOpenedEventOf({ events: [a], activeId: null })).toBeNull();
  });

  it("la fecha sobrevive al guardado y a la relectura", () => {
    const a = { ...own("A"), id: "own-1", lastOpenedAt: "2030-01-05T10:00:00.000Z" };
    writeStrategyEvents({ events: [a], activeId: "own-1" });
    expect(readStrategyEvents().events[0].lastOpenedAt).toBe("2030-01-05T10:00:00.000Z");
  });

  it("borrar el evento activo devuelve la vista al menú", () => {
    const a = { ...own("A"), id: "own-1" };
    const b = { ...own("B"), id: "own-2" };
    const state = removeEvent({ events: [a, b], activeId: "own-1" }, "own-1");
    expect(state.events.map((event) => event.id)).toEqual(["own-2"]);
    expect(state.activeId).toBeNull();
  });

  it("el asistente decide el tablero y el evento lo guarda", () => {
    const solo = createCustomEvent(
      [],
      {
        name: "Solo",
        track: "",
        cls: "",
        durationMin: 60,
        startAt: "2030-01-01T14:00:00.000Z",
        tankL: 90,
        pitLossSec: 60,
        drivers: [ISAAC],
        teamMode: "solo",
      },
      LABELS,
    );
    expect(solo.teamMode).toBe("solo");
    expect(solo.fillMode).toBe("manual");
    const automatic = createCustomEvent(
      [],
      {
        name: "Automática",
        track: "Spa",
        cls: "LMP2",
        durationMin: 120,
        startAt: "2030-01-01T14:00:00.000Z",
        tankL: 90,
        pitLossSec: 60,
        drivers: [ISAAC],
        fillMode: "telemetry",
      },
      LABELS,
    );
    writeStrategyEvents({ events: [automatic], activeId: automatic.id });
    expect(readStrategyEvents().events[0].fillMode).toBe("telemetry");
    expect(own("Por defecto").teamMode).toBe("team");
  });
});
