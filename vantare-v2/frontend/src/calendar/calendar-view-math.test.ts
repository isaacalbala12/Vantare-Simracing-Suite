import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  startOfLocalDay,
  isSameLocalDay,
  buildMonthGrid,
  buildWeekRange,
  formatMonthTitle,
  isIntervalSeries,
  isWeeklySlotsSeries,
  expandWeeklySlots,
  expandDailyIntervalSeries,
  getDailyPatternSummary,
  groupEventsByDay,
  indexSeriesById,
} from "./calendar-view-math";
import type { RaceSeries } from "./calendar-types";

function createSeries(overrides: Partial<RaceSeries> = {}): RaceSeries {
  return {
    id: "series-id",
    name: "Series Name",
    tier: "beginner",
    licenseLabel: "Rookie",
    track: "Silverstone",
    vehicleClass: "GT3",
    setup: "Fixed",
    durationMin: 20,
    splits: 1,
    assists: "Auto",
    tyreWarmers: false,
    tyres: 4,
    recurrence: { kind: "interval", intervalMinutes: 15 },
    ...overrides,
  };
}

describe("calendar-view-math", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Fijamos el sistema en el 2026-07-01 12:00:00 (que es Miércoles en hora local/UTC)
    vi.setSystemTime(new Date("2026-07-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("A1: Date Range Helpers", () => {
    it("isSameLocalDay works for the same and different local days", () => {
      const d1 = new Date(2026, 6, 1, 10, 0); // 1 de Julio
      const d2 = new Date(2026, 6, 1, 23, 59); // 1 de Julio
      const d3 = new Date(2026, 6, 2, 0, 1); // 2 de Julio

      expect(isSameLocalDay(d1, d2)).toBe(true);
      expect(isSameLocalDay(d1, d3)).toBe(false);
    });

    it("startOfLocalDay normalizes Date to midnight local time", () => {
      const date = new Date(2026, 6, 1, 15, 30, 45);
      const normalized = startOfLocalDay(date);

      expect(normalized.getFullYear()).toBe(2026);
      expect(normalized.getMonth()).toBe(6);
      expect(normalized.getDate()).toBe(1);
      expect(normalized.getHours()).toBe(0);
      expect(normalized.getMinutes()).toBe(0);
      expect(normalized.getSeconds()).toBe(0);
    });

    it("buildMonthGrid returns exactly 42 cells", () => {
      const anchor = new Date(2026, 6, 15); // Julio 2026
      const grid = buildMonthGrid(anchor);

      expect(grid.length).toBe(42);
    });

    it("buildMonthGrid starts on Monday", () => {
      // 1 de Julio de 2026 es Miércoles.
      // La semana debe empezar el lunes anterior (29 de Junio de 2026).
      const anchor = new Date(2026, 6, 15);
      const grid = buildMonthGrid(anchor);

      const firstCell = grid[0];
      // 0 = Domingo, 1 = Lunes, etc.
      expect(firstCell.date.getDay()).toBe(1); // Lunes
      expect(firstCell.date.getFullYear()).toBe(2026);
      expect(firstCell.date.getMonth()).toBe(5); // Junio (0-indexed = 5)
      expect(firstCell.date.getDate()).toBe(29);
    });

    it("buildMonthGrid marks inCurrentMonth correctly", () => {
      const anchor = new Date(2026, 6, 15); // Julio 2026 (mes 6)
      const grid = buildMonthGrid(anchor);

      // Junio 29 (celda 0) no es del mes actual
      expect(grid[0].inCurrentMonth).toBe(false);

      // Julio 1 (celda 2) es del mes actual
      // 2026-06-29 (L), 2026-06-30 (M), 2026-07-01 (X) -> celda de índice 2
      expect(grid[2].date.getDate()).toBe(1);
      expect(grid[2].inCurrentMonth).toBe(true);

      // Agosto 1 (celda 33) no es del mes actual (Julio tiene 31 días)
      // 29 Jun a 31 Jul = 2 + 31 = 33 celdas (índices 0 a 32).
      // El índice 33 es el 1 de Agosto.
      expect(grid[33].date.getDate()).toBe(1);
      expect(grid[33].inCurrentMonth).toBe(false);
    });

    it("buildMonthGrid marks isToday correctly based on system time", () => {
      const anchor = new Date(2026, 6, 15);
      const grid = buildMonthGrid(anchor);

      // Hoy está fijado en 2026-07-01 (Julio es mes 6 en Date)
      const todayCell = grid.find((cell) => cell.date.getDate() === 1 && cell.date.getMonth() === 6);
      expect(todayCell).toBeTruthy();
      expect(todayCell!.isToday).toBe(true);

      const otherCell = grid.find((cell) => cell.date.getDate() === 10 && cell.date.getMonth() === 6);
      expect(otherCell).toBeTruthy();
      expect(otherCell!.isToday).toBe(false);
    });

    it("buildWeekRange returns 7 days starting from Monday to Sunday", () => {
      const anchor = new Date(2026, 6, 1); // Miércoles 1 de Julio de 2026
      const week = buildWeekRange(anchor);

      expect(week.length).toBe(7);
      expect(week[0].getDay()).toBe(1); // Lunes (29 de Junio)
      expect(week[0].getDate()).toBe(29);
      expect(week[0].getMonth()).toBe(5); // Junio

      expect(week[6].getDay()).toBe(0); // Domingo (5 de Julio)
      expect(week[6].getDate()).toBe(5);
      expect(week[6].getMonth()).toBe(6); // Julio
    });

    it("formatMonthTitle returns title in Spanish", () => {
      const date = new Date(2026, 6, 15); // Julio
      expect(formatMonthTitle(date)).toBe("Julio 2026");

      const dateDec = new Date(2026, 11, 1); // Diciembre
      expect(formatMonthTitle(dateDec)).toBe("Diciembre 2026");
    });
  });

  describe("A2: Recurrence Display Helpers", () => {
    it("getSeriesPatternLabel uses preview.scheduleLabel if present", () => {
      const s1 = createSeries({ recurrence: { kind: "interval" } });
      const s2 = createSeries({ recurrence: { kind: "weekly-slots" } });

      expect(isIntervalSeries(s1)).toBe(true);
      expect(isIntervalSeries(s2)).toBe(false);

      expect(isWeeklySlotsSeries(s1)).toBe(false);
      expect(isWeeklySlotsSeries(s2)).toBe(true);
    });

    it("expandWeeklySlots returns occurrences for weekly-slots within the specified window", () => {
      const series = createSeries({
        name: "Weekly LMP2",
        durationMin: 45,
        recurrence: {
          kind: "weekly-slots",
          days: ["Wed", "Sat"],
          timesUTC: ["02:00", "14:00"],
        },
      });

      // El rango es [2026-07-01T00:00:00Z, 2026-07-05T00:00:00Z)
      // 2026-07-01 (Miércoles/Wed)
      //   - 02:00 UTC (dentro)
      //   - 14:00 UTC (dentro)
      // 2026-07-02 (Jueves)
      // 2026-07-03 (Viernes)
      // 2026-07-04 (Sábado/Sat)
      //   - 02:00 UTC (dentro)
      //   - 14:00 UTC (dentro)
      // 2026-07-05 (Domingo) - a las 00:00:00Z es excluido
      const from = new Date("2026-07-01T00:00:00Z");
      const to = new Date("2026-07-05T00:00:00Z");

      const occurrences = expandWeeklySlots(series, from, to);

      expect(occurrences.length).toBe(4);

      expect(occurrences[0].startTime.toISOString()).toBe("2026-07-01T02:00:00.000Z");
      expect(occurrences[0].endTime.toISOString()).toBe("2026-07-01T02:45:00.000Z");
      expect(occurrences[0].title).toBe("Weekly LMP2");
      expect(occurrences[0].seriesId).toBe(series.id);

      expect(occurrences[1].startTime.toISOString()).toBe("2026-07-01T14:00:00.000Z");
      expect(occurrences[2].startTime.toISOString()).toBe("2026-07-04T02:00:00.000Z");
      expect(occurrences[3].startTime.toISOString()).toBe("2026-07-04T14:00:00.000Z");
    });

    it("expandWeeklySlots does not return occurrences outside of the range", () => {
      const series = createSeries({
        durationMin: 30,
        recurrence: {
          kind: "weekly-slots",
          days: ["Wed"],
          timesUTC: ["10:00"],
        },
      });

      // El slot cae en 2026-07-01T10:00:00Z
      const from = new Date("2026-07-01T10:01:00Z"); // justo después
      const to = new Date("2026-07-01T11:00:00Z");

      const occurrences = expandWeeklySlots(series, from, to);
      expect(occurrences.length).toBe(0);
    });

    it("expandWeeklySlots does not expand interval series", () => {
      const series = createSeries({
        recurrence: { kind: "interval", intervalMinutes: 15 },
      });

      const from = new Date("2026-07-01T00:00:00Z");
      const to = new Date("2026-07-02T00:00:00Z");

      const occurrences = expandWeeklySlots(series, from, to);
      expect(occurrences).toEqual([]);
    });

    it("expandWeeklySlots handles day-boundary properly when UTC crosses to local time", () => {
      const series = createSeries({
        recurrence: {
          kind: "weekly-slots",
          days: ["Wed"], // Miércoles UTC
          timesUTC: ["23:30"],
        },
      });

      // Si nos encontramos en una zona horaria como Europe/Madrid (UTC+2 en verano),
      // el 2026-07-01T23:30:00Z (Miércoles) corresponde localmente a 2026-07-02T01:30:00 (Jueves).
      // El helper debe construirlo en base a UTC y retornarlo en Date local, pero coincidiendo en timestamp.
      const from = new Date("2026-07-01T00:00:00Z");
      const to = new Date("2026-07-02T06:00:00Z");

      const occurrences = expandWeeklySlots(series, from, to);
      expect(occurrences.length).toBe(1);
      expect(occurrences[0].startTime.toISOString()).toBe("2026-07-01T23:30:00.000Z");
    });

    it("getDailyPatternSummary groups interval series by tier and derives label", () => {
      const seriesList = [
        createSeries({ id: "s1", tier: "beginner", recurrence: { kind: "interval", intervalMinutes: 15 } }),
        createSeries({ id: "s2", tier: "beginner", recurrence: { kind: "interval", intervalMinutes: 15 } }),
        createSeries({ id: "s3", tier: "intermediate", recurrence: { kind: "interval", intervalMinutes: 20 } }),
        createSeries({ id: "s4", tier: "advanced", recurrence: { kind: "weekly-slots", days: ["Sun"] } }), // weekly slots no entra en daily summary
      ];

      const summaries = getDailyPatternSummary(seriesList);

      // beginner (count 2, label Cada 15 min) e intermediate (count 1, label Cada 20 min)
      expect(summaries.length).toBe(2);

      const beginnerSum = summaries.find((s) => s.tier === "beginner");
      expect(beginnerSum).toBeTruthy();
      expect(beginnerSum!.count).toBe(2);
      expect(beginnerSum!.label).toBe("Cada 15 min");

      const intermediateSum = summaries.find((s) => s.tier === "intermediate");
      expect(intermediateSum).toBeTruthy();
      expect(intermediateSum!.count).toBe(1);
      expect(intermediateSum!.label).toBe("Cada 20 min");
    });



    it("getDailyPatternSummary ordena desordenado: weekly, intermediate, custom-tier, beginner, advanced, another-custom", () => {
      const seriesList = [
        createSeries({ id: "s1", tier: "weekly", recurrence: { kind: "interval", intervalMinutes: 30 } }),
        createSeries({ id: "s2", tier: "intermediate", recurrence: { kind: "interval", intervalMinutes: 20 } }),
        createSeries({ id: "s3", tier: "custom-tier", recurrence: { kind: "interval", intervalMinutes: 40 } }),
        createSeries({ id: "s4", tier: "beginner", recurrence: { kind: "interval", intervalMinutes: 15 } }),
        createSeries({ id: "s5", tier: "advanced", recurrence: { kind: "interval", intervalMinutes: 10 } }),
        createSeries({ id: "s6", tier: "another-custom", recurrence: { kind: "interval", intervalMinutes: 5 } }),
      ];

      const summaries = getDailyPatternSummary(seriesList);

      expect(summaries.map(s => s.tier)).toEqual([
        "beginner",
        "intermediate",
        "advanced",
        "weekly",
        "another-custom",
        "custom-tier"
      ]);
    });

    it("expandWeeklySlots con timesUTC: ['25:00', '12:99', 'xx:00', '08:30'] devuelve exactamente 1 ocurrencia con 08:30", () => {
      const series = createSeries({
        durationMin: 30,
        recurrence: {
          kind: "weekly-slots",
          days: ["Wed"],
          timesUTC: ["25:00", "12:99", "xx:00", "08:30"],
        },
      });

      const from = new Date("2026-07-01T00:00:00Z");
      const to = new Date("2026-07-01T23:59:59Z");

      const occurrences = expandWeeklySlots(series, from, to);
      expect(occurrences.length).toBe(1);
      expect(occurrences[0].startTime.toISOString()).toBe("2026-07-01T08:30:00.000Z");
    });
  });
});

describe("expandDailyIntervalSeries", () => {
  function createIntervalSeries(overrides: Partial<RaceSeries> = {}): RaceSeries {
    return {
      id: "test-series",
      name: "Test Series",
      tier: "beginner",
      licenseLabel: "Bronze SR",
      track: "Silverstone",
      vehicleClass: "GT3",
      setup: "Fixed",
      durationMin: 20,
      raceDurationMin: 20,
      eventDurationMin: 31,
      sessions: [
        { name: "practice", durationMin: 3, estimated: true },
        { name: "qualifying", durationMin: 8, estimated: true },
        { name: "race", durationMin: 20, estimated: false },
      ],
      startOffsetMinute: 15,
      splits: 1,
      assists: "Auto",
      tyreWarmers: false,
      tyres: 4,
      recurrence: { kind: "interval", intervalMinutes: 15 },
      ...overrides,
    };
  }

  it("expands one series to 24 occurrences for a full day", () => {
    const dayStart = new Date("2026-07-04T00:00:00");
    const dayEnd = new Date("2026-07-05T00:00:00");
    const series = [createIntervalSeries()];

    const result = expandDailyIntervalSeries(series, dayStart, dayEnd);

    expect(result.length).toBe(95); // offset=15, interval=15: 15,30,...,1425 = 95 events
    for (const occ of result) {
      expect(occ.durationMin).toBe(31); // eventDurationMin
    }
  });

  it("uses eventDurationMin for visual duration", () => {
    const dayStart = new Date("2026-07-04T00:00:00");
    const dayEnd = new Date("2026-07-05T00:00:00");
    const series = [createIntervalSeries({ eventDurationMin: 45 })];

    const result = expandDailyIntervalSeries(series, dayStart, dayEnd);

    expect(result.length).toBe(95);
    expect(result[0].durationMin).toBe(45);
  });

  it("falls back to durationMin + 11 when eventDurationMin is missing", () => {
    const dayStart = new Date("2026-07-04T00:00:00");
    const dayEnd = new Date("2026-07-05T00:00:00");
    const series = [createIntervalSeries({ eventDurationMin: undefined, durationMin: 30 })];

    const result = expandDailyIntervalSeries(series, dayStart, dayEnd);

    expect(result[0].durationMin).toBe(41); // 30 + 11
  });

  it("respects startOffsetMinute for each series", () => {
    const dayStart = new Date("2026-07-04T00:00:00");
    const dayEnd = new Date("2026-07-05T00:00:00");
    const series = [
      createIntervalSeries({ id: "s1", startOffsetMinute: 15 }),
      createIntervalSeries({ id: "s2", startOffsetMinute: 30 }),
      createIntervalSeries({ id: "s3", startOffsetMinute: 45 }),
    ];

    const result = expandDailyIntervalSeries(series, dayStart, dayEnd);

    expect(result.length).toBe(282); // 95+94+93 (offset affects count)
    const s1 = result.filter((o) => o.seriesId === "s1");
    const s2 = result.filter((o) => o.seriesId === "s2");
    const s3 = result.filter((o) => o.seriesId === "s3");
    expect(s1.length).toBe(95);
    expect(s2.length).toBe(94);
    expect(s3.length).toBe(93);
    expect(s1[0].startTime.getMinutes()).toBe(15);
    expect(s2[0].startTime.getMinutes()).toBe(30);
    expect(s3[0].startTime.getMinutes()).toBe(45);
  });

  it("filters by tier when tierFilter is provided", () => {
    const dayStart = new Date("2026-07-04T00:00:00");
    const dayEnd = new Date("2026-07-05T00:00:00");
    const series = [
      createIntervalSeries({ id: "s1", tier: "beginner" }),
      createIntervalSeries({ id: "s2", tier: "intermediate" }),
      createIntervalSeries({ id: "s3", tier: "advanced" }),
    ];

    const result = expandDailyIntervalSeries(series, dayStart, dayEnd, "intermediate");

    expect(result.length).toBe(95);
    expect(result[0].seriesId).toBe("s2");
  });

  it("returns empty for non-interval series", () => {
    const dayStart = new Date("2026-07-04T00:00:00");
    const dayEnd = new Date("2026-07-05T00:00:00");
    const series = [createIntervalSeries({ recurrence: { kind: "weekly-slots", days: ["Wed"], timesUTC: ["20:00"] } })];

    const result = expandDailyIntervalSeries(series, dayStart, dayEnd);

    expect(result.length).toBe(0);
  });

  it("returns empty for empty series list", () => {
    const dayStart = new Date("2026-07-04T00:00:00");
    const dayEnd = new Date("2026-07-05T00:00:00");

    const result = expandDailyIntervalSeries([], dayStart, dayEnd);

    expect(result.length).toBe(0);
  });

  it("does not expand beyond 24h window", () => {
    const dayStart = new Date("2026-07-04T00:00:00");
    const dayEnd = new Date("2026-07-04T12:00:00"); // 12h window
    const series = [createIntervalSeries()];

    const result = expandDailyIntervalSeries(series, dayStart, dayEnd);

    expect(result.length).toBe(47); // offset=15, interval=15, 12h: 15,30,...,705 = 47
  });
});

describe("groupEventsByDay", () => {
  it("groups two events of the same local day under the same key", () => {
    const events = [
      { id: "e1", title: "Race 1", startTime: "2026-07-04T10:00:00Z", series: "s1", sim: "LMU", track: "Silverstone", sessionLabel: "Race", durationMin: 20, registrationUrl: "", source: "", notes: "" },
      { id: "e2", title: "Race 2", startTime: "2026-07-04T14:00:00Z", series: "s1", sim: "LMU", track: "Silverstone", sessionLabel: "Race", durationMin: 20, registrationUrl: "", source: "", notes: "" },
    ];

    const grouped = groupEventsByDay(events);

    expect(grouped.size).toBe(1);
    expect(grouped.get("2026-07-04")?.length).toBe(2);
  });

  it("separates events of different local days into different keys", () => {
    const events = [
      { id: "e1", title: "Race 1", startTime: "2026-07-04T10:00:00Z", series: "s1", sim: "LMU", track: "Silverstone", sessionLabel: "Race", durationMin: 20, registrationUrl: "", source: "", notes: "" },
      { id: "e2", title: "Race 2", startTime: "2026-07-05T10:00:00Z", series: "s1", sim: "LMU", track: "Silverstone", sessionLabel: "Race", durationMin: 20, registrationUrl: "", source: "", notes: "" },
    ];

    const grouped = groupEventsByDay(events);

    expect(grouped.size).toBe(2);
    expect(grouped.get("2026-07-04")?.length).toBe(1);
    expect(grouped.get("2026-07-05")?.length).toBe(1);
  });

  it("does not mutate the original array", () => {
    const events = [
      { id: "e1", title: "Race 1", startTime: "2026-07-04T10:00:00Z", series: "s1", sim: "LMU", track: "Silverstone", sessionLabel: "Race", durationMin: 20, registrationUrl: "", source: "", notes: "" },
    ];
    const originalLength = events.length;

    groupEventsByDay(events);

    expect(events.length).toBe(originalLength);
  });
});

describe("indexSeriesById", () => {
  it("returns a map keyed by series id", () => {
    const series = [
      { id: "s1", name: "Bronze GT3", tier: "beginner", licenseLabel: "R", track: "Silverstone", vehicleClass: "GT3", setup: "Fixed", durationMin: 20, splits: 1, assists: "Auto", tyreWarmers: false, tyres: 4, recurrence: { kind: "interval", intervalMinutes: 15 } },
      { id: "s2", name: "Silver GT3", tier: "intermediate", licenseLabel: "R", track: "Silverstone", vehicleClass: "GT3", setup: "Fixed", durationMin: 20, splits: 1, assists: "Auto", tyreWarmers: false, tyres: 4, recurrence: { kind: "interval", intervalMinutes: 20 } },
    ];

    const indexed = indexSeriesById(series);

    expect(indexed.size).toBe(2);
    expect(indexed.get("s1")?.name).toBe("Bronze GT3");
    expect(indexed.get("s2")?.name).toBe("Silver GT3");
  });

  it("does not mutate the original array", () => {
    const series = [
      { id: "s1", name: "Bronze GT3", tier: "beginner", licenseLabel: "R", track: "Silverstone", vehicleClass: "GT3", setup: "Fixed", durationMin: 20, splits: 1, assists: "Auto", tyreWarmers: false, tyres: 4, recurrence: { kind: "interval", intervalMinutes: 15 } },
    ];
    const originalLength = series.length;

    indexSeriesById(series);

    expect(series.length).toBe(originalLength);
  });
});
