import { describe, expect, it } from "vitest";
import type { Calendar, RaceSeries } from "../../calendar/calendar-types";
import { EMPTY_CALENDAR } from "../../calendar/calendar-types";
import { buildRaceStarts, dialTarget, intervalMinutesOf, toEngineSeries } from "./race-starts";

function series(overrides: Partial<RaceSeries> & Pick<RaceSeries, "id" | "name">): RaceSeries {
  return {
    tier: "beginner",
    licenseLabel: "Bronze SR",
    track: "Sebring (School)",
    vehicleClass: "LMGT3 Class",
    setup: "fixed",
    durationMin: 20,
    splits: 20,
    assists: "High assists allowed",
    tyreWarmers: true,
    tyres: 8,
    recurrence: { kind: "interval", intervalMinutes: 15 },
    ...overrides,
  } as RaceSeries;
}

function calendar(overrides: Partial<Calendar>): Calendar {
  return { ...EMPTY_CALENDAR, ...overrides };
}

const NOW = new Date("2026-07-07T18:07:30Z");

describe("toEngineSeries", () => {
  it("traduce una cadencia por intervalo con su minuto de salida", () => {
    const engine = toEngineSeries(series({ id: "a", name: "A", startOffsetMinute: 30 }));
    expect(engine).toMatchObject({ every: 15, offset: 0 });
  });

  it("traduce los días semanales del backend a getUTCDay()", () => {
    const engine = toEngineSeries(
      series({
        id: "w",
        name: "WEC Weekly",
        recurrence: { kind: "weekly-slots", days: ["Wed", "Mon"], timesUTC: ["02:00"] },
      }),
    );
    expect(engine).toMatchObject({ days: [3, 1], weeklyUTC: ["02:00"] });
  });

  it("devuelve null cuando la recurrencia no describe ninguna cadencia", () => {
    expect(toEngineSeries(series({ id: "x", name: "X", recurrence: { kind: "none" } }))).toBeNull();
  });
});

describe("intervalMinutesOf", () => {
  it("usa la cadencia del intervalo", () => {
    expect(intervalMinutesOf(series({ id: "a", name: "A" }))).toBe(15);
  });

  it("reparte la semana entre los slots semanales", () => {
    const weekly = series({
      id: "w",
      name: "W",
      recurrence: { kind: "weekly-slots", days: ["Mon"], timesUTC: ["02:00", "14:00"] },
    });
    expect(intervalMinutesOf(weekly)).toBe(5040);
  });
});

describe("buildRaceStarts", () => {
  it("sin calendario devuelve la lista vacía, sin fixture de respaldo", () => {
    expect(buildRaceStarts(null, NOW)).toEqual([]);
    expect(buildRaceStarts(calendar({ series: [] }), NOW)).toEqual([]);
  });

  it("prefiere las salidas ya calculadas por el backend", () => {
    const rows = buildRaceStarts(
      calendar({
        series: [series({ id: "a", name: "LMGT3 Fixed" })],
        seriesPreviews: [
          {
            seriesId: "a",
            scheduleLabel: "Cada 15 min",
            nextStarts: ["2026-07-07T18:15:00Z", "2026-07-07T18:30:00Z"],
          },
        ],
      }),
      NOW,
    );
    expect(rows.map((row) => row.at.toISOString())).toEqual([
      "2026-07-07T18:15:00.000Z",
      "2026-07-07T18:30:00.000Z",
    ]);
    expect(rows[0].note).toBe("Cada 15 min");
    expect(rows[0].licenseTier).toBe("bronze");
  });

  it("descarta las salidas que el backend dejó en el pasado", () => {
    const rows = buildRaceStarts(
      calendar({
        series: [series({ id: "a", name: "A" })],
        seriesPreviews: [
          { seriesId: "a", scheduleLabel: "Cada 15 min", nextStarts: ["2026-07-07T17:00:00Z"] },
        ],
      }),
      NOW,
    );
    // Cae al motor local, que sí calcula desde `now`.
    expect(rows[0].at.getTime()).toBeGreaterThanOrEqual(NOW.getTime());
  });

  it("calcula con el motor local cuando el preview llega vacío", () => {
    const rows = buildRaceStarts(
      calendar({
        series: [series({ id: "a", name: "A", startOffsetMinute: 15 })],
        seriesPreviews: [{ seriesId: "a", scheduleLabel: "Cada 15 min", nextStarts: [] }],
      }),
      NOW,
    );
    expect(rows.map((row) => row.at.toISOString())).toEqual([
      "2026-07-07T18:15:00.000Z",
      "2026-07-07T18:30:00.000Z",
    ]);
  });

  it("ordena por hora y luego por nombre, y recorta al límite", () => {
    const rows = buildRaceStarts(
      calendar({
        series: [
          series({ id: "b", name: "Bravo" }),
          series({ id: "a", name: "Alfa" }),
        ],
        seriesPreviews: [
          { seriesId: "b", scheduleLabel: "", nextStarts: ["2026-07-07T18:15:00Z"] },
          { seriesId: "a", scheduleLabel: "", nextStarts: ["2026-07-07T18:15:00Z"] },
        ],
      }),
      NOW,
      { limit: 2 },
    );
    expect(rows.map((row) => row.name)).toEqual(["Alfa", "Bravo"]);
  });

  it("marca las series seguidas", () => {
    const rows = buildRaceStarts(
      calendar({
        series: [series({ id: "a", name: "A" })],
        seriesPreviews: [{ seriesId: "a", scheduleLabel: "", nextStarts: ["2026-07-07T18:15:00Z"] }],
        followedSeriesIds: ["a"],
      }),
      NOW,
    );
    expect(rows[0].followed).toBe(true);
  });
});

describe("dialTarget", () => {
  const base = {
    seriesId: "a",
    name: "A",
    track: "",
    tier: "beginner" as const,
    licenseLabel: "",
    note: "",
    intervalMin: 15,
    followed: false,
  };

  it("apunta a la primera salida cuando no hay series seguidas", () => {
    const starts = [
      { ...base, at: new Date("2026-07-07T18:15:00Z") },
      { ...base, seriesId: "b", at: new Date("2026-07-07T18:30:00Z") },
    ];
    expect(dialTarget(starts)?.seriesId).toBe("a");
  });

  it("prefiere la primera salida de una serie seguida", () => {
    const starts = [
      { ...base, at: new Date("2026-07-07T18:15:00Z") },
      { ...base, seriesId: "b", followed: true, at: new Date("2026-07-07T18:30:00Z") },
    ];
    expect(dialTarget(starts)?.seriesId).toBe("b");
  });

  it("sin salidas no hay objetivo", () => {
    expect(dialTarget([])).toBeNull();
  });
});
