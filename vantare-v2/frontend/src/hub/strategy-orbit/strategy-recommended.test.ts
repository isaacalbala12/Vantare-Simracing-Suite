import { describe, expect, it } from "vitest";
import type { Calendar, RaceEvent } from "../../calendar/calendar-types";
import type { RaceStart } from "../orbit/race-starts";
import { buildRecommendedEvents } from "./strategy-recommended";

const NOW = new Date("2030-01-01T12:00:00Z");

function special(overrides: Partial<RaceEvent>): RaceEvent {
  return {
    id: "e1",
    title: "24 Horas de Spa",
    sim: "LMU",
    track: "Spa-Francorchamps",
    series: "Special Events",
    sessionLabel: "",
    startTime: "2030-07-27T14:00:00Z",
    durationMin: 1440,
    registrationUrl: "",
    source: "test",
    notes: "",
    ...overrides,
  };
}

function calendarOf(events: RaceEvent[]): Calendar {
  return {
    version: 1,
    timezone: "Europe/Madrid",
    reminderMinutes: [],
    events,
    updated: "",
  };
}

function start(overrides: Partial<RaceStart>): RaceStart {
  return {
    seriesId: "weekly-endurance",
    name: "LMU Weekly Endurance",
    track: "Le Mans",
    tier: "weekly",
    licenseLabel: "",
    note: "Cada semana",
    intervalMin: 10_080,
    vehicleClass: "LMP2",
    durationMin: 90,
    at: new Date("2030-01-05T18:00:00Z"),
    followed: false,
    ...overrides,
  };
}

describe("buildRecommendedEvents", () => {
  it("sin calendario ni salidas devuelve vacío honesto", () => {
    expect(buildRecommendedEvents(null, [], NOW)).toEqual({ kind: "none", rows: [] });
  });

  it("los especiales del calendario mandan sobre las semanales", () => {
    const result = buildRecommendedEvents(
      calendarOf([special({})]),
      [start({})],
      NOW,
    );
    expect(result.kind).toBe("special");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe("24 Horas de Spa");
    expect(result.rows[0].durationMin).toBe(1440);
  });

  it("`raceDurationMin` gana a la duración del evento cuando existe", () => {
    const result = buildRecommendedEvents(
      calendarOf([special({ raceDurationMin: 240, durationMin: 300 })]),
      [],
      NOW,
    );
    expect(result.rows[0].durationMin).toBe(240);
  });

  it("descarta los especiales que ya han empezado y ordena por salida", () => {
    const result = buildRecommendedEvents(
      calendarOf([
        special({ id: "past", title: "Pasado", startTime: "2029-01-01T10:00:00Z" }),
        special({ id: "late", title: "Tarde", startTime: "2030-09-01T10:00:00Z" }),
        special({ id: "soon", title: "Pronto", startTime: "2030-02-01T10:00:00Z" }),
        special({ id: "bad", title: "Roto", startTime: "no-es-una-fecha" }),
      ]),
      [],
      NOW,
    );
    expect(result.rows.map((row) => row.name)).toEqual(["Pronto", "Tarde"]);
  });

  it("sin especiales cae a las semanales, una fila por serie y la más próxima", () => {
    const result = buildRecommendedEvents(
      calendarOf([]),
      [
        start({ tier: "advanced", seriesId: "gt3", name: "GT3 Sprint" }),
        start({}),
        start({ at: new Date("2030-01-12T18:00:00Z") }),
        start({ seriesId: "weekly-gt", name: "Weekly GT", vehicleClass: "GT3" }),
      ],
      NOW,
    );
    expect(result.kind).toBe("weekly");
    expect(result.rows.map((row) => row.seriesId)).toEqual(["weekly-endurance", "weekly-gt"]);
    expect(result.rows[0].at.toISOString()).toBe("2030-01-05T18:00:00.000Z");
  });

  it("respeta el límite pedido", () => {
    const result = buildRecommendedEvents(
      calendarOf([
        special({ id: "a", title: "A", startTime: "2030-02-01T10:00:00Z" }),
        special({ id: "b", title: "B", startTime: "2030-03-01T10:00:00Z" }),
      ]),
      [],
      NOW,
      1,
    );
    expect(result.rows.map((row) => row.name)).toEqual(["A"]);
    expect(buildRecommendedEvents(calendarOf([special({})]), [], NOW, 0).kind).toBe("none");
  });
});
